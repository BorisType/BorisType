import { constants, readFileSync } from "node:fs";
import { copyFile, link, lstat, mkdir, mkdtemp, open, readdir, rename, rm, rmdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { z } from "zod";
import { buildScript } from "./hcm/load.js";
import type { WshcmEvaluator } from "./hcm/types.js";

const script = readFileSync(new URL("../resources/download.bs", import.meta.url), "utf8");
const info = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("link") }),
  z.object({ kind: z.literal("directory"), names: z.array(z.string()) }),
  z.object({ kind: z.literal("file"), size: z.number().int().nonnegative(), modified: z.string() }),
]);
type Entry = z.infer<typeof info>;
type RemoteFile = Extract<Entry, { kind: "file" }> & { parts: string[] };
const defaultChunkSize = 256 * 1024;

export interface WshcmDownloaderOptions {
  /** The caller owns the authenticated evaluator and closes it. */
  evaluator: WshcmEvaluator;
  /** Physical server file or directory. Accepts an absolute OS path or x-local://, x-app://, file:// URL. */
  path: string;
  /** Exact new local file or directory; its parent must exist. */
  destination: string;
  /** Raw bytes per SOAP range request. Defaults to 256 KiB; maximum 4 MiB. */
  chunkSize?: number;
}

export type DownloadProgressCallback = (downloadedBytes: number, totalBytes: number) => void;
export interface DownloadResult {
  path: string;
  files: number;
  bytes: number;
  skippedLinks: number;
}

function validateLocalName(name: string) {
  if (
    process.platform === "win32" &&
    (/[<>:"|?*\x00-\x1f]|[. ]$/.test(name) || /^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(name))
  ) {
    throw new Error("Remote name cannot be represented on Windows: " + name);
  }
}

async function requireNewPath(path: string) {
  try {
    await lstat(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
  throw new Error("Destination already exists: " + path);
}

async function publishFile(staged: string, destination: string) {
  try {
    await link(staged, destination);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "EPERM" && code !== "EOPNOTSUPP" && code !== "ENOSYS" && code !== "EMLINK") throw error;
    // Some removable drives and network mounts do not support hard links.
    await copyFile(staged, destination, constants.COPYFILE_EXCL);
  }
}

/** Publish only after all network reads succeed. mkdir claims the directory even in concurrent downloads. */
async function publishDirectory(staged: string, destination: string) {
  await mkdir(destination, { mode: 0o700 });
  const moved: string[] = [];
  try {
    for (const name of await readdir(staged)) {
      await rename(join(staged, name), join(destination, name));
      moved.push(name);
    }
  } catch (error) {
    for (const name of moved) await rename(join(destination, name), join(staged, name));
    await rmdir(destination);
    throw error;
  }
}

/** Downloads individual physical server files or directory trees through a caller-owned evaluator. */
export class WshcmDownloader {
  private readonly chunkSize: number;

  constructor(private readonly options: WshcmDownloaderOptions) {
    this.chunkSize = options.chunkSize ?? defaultChunkSize;
    if (!Number.isSafeInteger(this.chunkSize) || this.chunkSize < 1 || this.chunkSize > 4 * 1024 * 1024)
      throw new RangeError("chunkSize must be 1 byte to 4 MiB");
    if (!options.path || !options.destination || options.path.includes("\0") || options.destination.includes("\0"))
      throw new Error("Expected remote path and local destination");
  }

  private async call(parts: string[], operation: "info" | "read", range?: { start: number; end: number }): Promise<unknown> {
    const request = JSON.stringify({
      source: this.options.path,
      moduleUrl: this.options.evaluator.moduleUrl ?? "",
      parts,
      operation,
      ...range,
    });
    const wire = await this.options.evaluator.eval(buildScript(script, { request }));
    if (typeof wire !== "string") throw new Error("Invalid download response");
    const result: unknown = JSON.parse(wire);
    if (result && typeof result === "object" && "error" in result) throw new Error("HCM download: " + String(result.error));
    return result;
  }

  private async scan() {
    const directories: string[][] = [];
    const files: RemoteFile[] = [];
    const pending: string[][] = [[]];
    let bytes = 0;
    let skippedLinks = 0;
    while (pending.length) {
      const parts = pending.pop()!;
      const entry = info.parse(await this.call(parts, "info"));
      if (entry.kind === "link") {
        if (!parts.length) throw new Error("Cannot download a symbolic link");
        skippedLinks++;
        continue;
      }
      if (parts.length) validateLocalName(parts[parts.length - 1]);
      if (entry.kind === "directory") {
        directories.push(parts);
        for (const name of entry.names) {
          if (!name || name === "." || name === ".." || /[\\/\0]/.test(name)) throw new Error("Invalid remote entry name");
          pending.push([...parts, name]);
        }
      } else {
        files.push({ ...entry, parts });
        bytes += entry.size;
        if (!Number.isSafeInteger(bytes)) throw new Error("Download size exceeds exact byte range");
      }
    }
    return { directories, files, bytes, skippedLinks };
  }

  private async readChunk(parts: string[], start: number, end: number): Promise<Buffer> {
    const response = await this.call(parts, "read", { start, end });
    if (
      !response ||
      typeof response !== "object" ||
      !("data" in response) ||
      typeof response.data !== "string" ||
      response.data.length !== 4 * Math.ceil((end - start) / 3)
    )
      throw new Error("Invalid download chunk length");
    const bytes = Buffer.from(response.data, "base64");
    if (bytes.length !== end - start || bytes.toString("base64") !== response.data) throw new Error("Invalid download chunk encoding");
    return bytes;
  }

  async download(onProgress?: DownloadProgressCallback): Promise<DownloadResult> {
    const destination = resolve(this.options.destination);
    await requireNewPath(destination);
    const { directories, files, bytes: totalBytes, skippedLinks } = await this.scan();
    const staging = await mkdtemp(join(dirname(destination), ".boristype-download-"));
    const staged = join(staging, "content");
    let downloaded = 0;
    try {
      for (const parts of directories) await mkdir(join(staged, ...parts), { mode: 0o700 });
      for (const file of files) {
        const handle = await open(join(staged, ...file.parts), "wx", 0o600);
        try {
          for (let start = 0; start < file.size; start += this.chunkSize) {
            const end = Math.min(start + this.chunkSize, file.size);
            const bytes = await this.readChunk(file.parts, start, end);
            await handle.writeFile(bytes);
            downloaded += bytes.length;
            onProgress?.(downloaded, totalBytes);
          }
          const after = info.parse(await this.call(file.parts, "info"));
          if (after.kind !== "file" || after.size !== file.size || after.modified !== file.modified)
            throw new Error("Remote file changed during download: " + [this.options.path, ...file.parts].join("/"));
        } finally {
          await handle.close();
        }
      }
      if (directories.length) await publishDirectory(staged, destination);
      else await publishFile(staged, destination);
      return { path: destination, files: files.length, bytes: downloaded, skippedLinks };
    } finally {
      await rm(staging, { recursive: true, force: true });
    }
  }
}
