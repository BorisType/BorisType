import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { copyFile, link, lstat, mkdir, open, unlink } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, isAbsolute, join, resolve } from "node:path";
import {
  checkedParent,
  denied,
  inside,
  LocalFileError,
  openTransferSource,
  withParent,
  type Access,
  type TransferKind,
} from "./local-file-access.js";
import { missing, recordOwnership, sharedLifetimeMs } from "./shared-file-cleanup.js";
import { objectXmlBytes } from "./object-xml.js";

export interface TransferFileOptions {
  /** Absolute shared root on this host, with packages/ and objects/ subdirectories. */
  sharedDirectory?: string;
  /** Absolute fallback for clients without usable local project roots. */
  projectDirectory?: string;
  /** Resolve the current project roots when a caller supplies a project path. */
  projectRoots?: () => Promise<readonly string[]>;
}
export type TransferFile = { path: string; storage: "project" } | { path: string; storage: "shared"; expiresAt: string; warning: string };
export type TransferLocation = Pick<TransferFile, "path" | "storage"> & { root: string };
const extensions = { packages: ".zip", objects: ".xml" } as const;

function directory(path: string) {
  if (!isAbsolute(path)) throw new Error("Transfer directory must be absolute");
  return resolve(path);
}

export class TransferFiles {
  private readonly shared: string;
  private readonly fallback?: string;
  constructor(private readonly options: TransferFileOptions = {}) {
    this.shared = directory(options.sharedDirectory ?? join(homedir(), ".boristype", "shared"));
    if (options.projectDirectory !== undefined) this.fallback = directory(options.projectDirectory);
  }

  async locate(kind: TransferKind, input: string, access: Access): Promise<TransferLocation> {
    const extension = extensions[kind];
    const segments = process.platform === "win32" ? input.replace(/^[A-Za-z]:[\\/]/, "").split(/[\\/]/) : input.split("/");
    if (input.length > 4096 || !input.toLowerCase().endsWith(extension) || input.includes("\0") || segments.includes(".."))
      throw denied(access, "Expected a " + extension + " file below an allowed directory");
    if (
      process.platform === "win32" &&
      segments.some((s) => (/[:<>|"?*]|[. ]$/.test(s) && s !== ".") || /^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(s))
    )
      throw denied(access, "Unsupported Windows path");
    const sharedGroup = join(this.shared, kind);
    let path = input;
    let projects: readonly string[] = [];
    if (!isAbsolute(path) || !inside(this.shared, path)) {
      const roots = ((await this.options.projectRoots?.()) ?? []).filter(isAbsolute);
      projects = roots.length ? roots : this.fallback ? [this.fallback] : [];
      if (!isAbsolute(path) && projects.length !== 1)
        throw denied(
          access,
          "Relative paths require one project root. Use an absolute path or configure --project-directory when client roots are unavailable.",
        );
      path = isAbsolute(path) ? resolve(path) : resolve(projects[0]!, path);
    }
    path = resolve(path);
    if (path.length > 4096) throw denied(access, "Resolved file path exceeds 4096 characters");
    if (inside(sharedGroup, path)) return { root: this.shared, path, storage: "shared" };
    const project = projects.find((root) => inside(root, path));
    if (!project || inside(this.shared, path)) throw denied(access, "Use a file inside the shared " + kind + " directory or a project");
    return { root: project, path, storage: "project" };
  }

  async destination(kind: TransferKind, outputPath?: string, name: string = randomUUID()) {
    const location = await this.locate(kind, outputPath ?? join(this.shared, kind, name + extensions[kind]), "Export");
    try {
      if (location.storage === "shared") {
        await mkdir(this.shared, { recursive: true, mode: 0o700 });
        if (!(await lstat(this.shared)).isDirectory()) throw denied("Export", "Invalid shared directory");
        await mkdir(join(this.shared, kind), { recursive: true, mode: 0o700 });
      }
      const { parent } = await checkedParent(location, "Export");
      if (
        await lstat(join(parent, basename(location.path))).catch((error) => {
          if (!missing(error)) throw error;
        })
      )
        throw new Error("Destination already exists");
    } catch (cause) {
      throw denied("Export", cause instanceof Error ? cause.message : "Cannot open output directory");
    }
    return location;
  }

  async readXml(input: string) {
    const location = await this.locate("objects", input, "Import");
    const source = await openTransferSource(location.path, "objects", location.root);
    try {
      const before = await source.stat({ bigint: true });
      if (before.size > objectXmlBytes) throw new LocalFileError("InputLimit", "Object XML exceeds 256 KiB");
      const chunks: Buffer[] = [];
      let bytes = 0;
      for await (const chunk of source.createReadStream({ autoClose: false })) {
        bytes += chunk.length;
        if (bytes > objectXmlBytes) throw new LocalFileError("InputLimit", "Object XML exceeds 256 KiB");
        chunks.push(chunk);
      }
      const after = await source.stat({ bigint: true });
      if (BigInt(bytes) !== before.size || after.mtimeNs !== before.mtimeNs || after.ctimeNs !== before.ctimeNs)
        throw new LocalFileError("InputChanged", "Object XML changed while reading");
      return new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks));
    } finally {
      await source.close();
    }
  }

  async publish(location: TransferLocation, content: { xml: string } | { source: string }): Promise<TransferFile> {
    return withParent(location, async (anchor, verify) => {
      const temp = join(anchor, ".boristype-" + randomUUID() + ".tmp");
      let marker: string | undefined;
      let published = false;
      let staged = false;
      try {
        if ("xml" in content) {
          const handle = await open(temp, "wx", 0o600);
          staged = true;
          try {
            await handle.writeFile(content.xml);
          } finally {
            await handle.close();
          }
        } else {
          await copyFile(content.source, temp, constants.COPYFILE_EXCL);
          staged = true;
        }
        await verify();
        let file: TransferFile = { path: location.path, storage: "project" };
        if (location.storage === "shared") {
          const expires = Date.now() + sharedLifetimeMs;
          marker = await recordOwnership(this.shared, location.path, await lstat(temp, { bigint: true }), expires);
          file = {
            path: location.path,
            storage: "shared",
            expiresAt: new Date(expires).toISOString(),
            warning: "Temporary shared file. Use outputPath in the project or copy it there before expiry to keep it.",
          };
        }
        await verify();
        await link(temp, join(anchor, basename(location.path)));
        published = true;
        return file;
      } finally {
        try {
          if (staged) await unlink(temp);
        } finally {
          if (marker && !published)
            await unlink(marker).catch((error) => {
              if (!missing(error)) throw error;
            });
        }
      }
    });
  }
}
