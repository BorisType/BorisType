import { createHash, randomUUID } from "node:crypto";
import { constants, type WriteStream } from "node:fs";
import { lstat, mkdir, open, unlink } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

const MAX_ARCHIVE_BYTES = 128 * 1024 * 1024;
const RETENTION_MS = 24 * 60 * 60 * 1000;
const HANDLE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export interface PackageArtifact {
  artifactId: string;
  localPath: string;
  mimeType: "application/zip";
  sizeBytes: number;
  sha256: string;
  expiresAt: string;
}

/** Persistent, private snapshots; handles never resolve a caller supplied filesystem path. */
export class PackageArtifactStore {
  private readonly directory: string;

  constructor(directory = join(homedir(), ".boristype", "package-artifacts")) {
    if (!isAbsolute(directory)) throw new Error("Artifact directory must be absolute");
    this.directory = directory;
  }

  async capture(localPath: string): Promise<PackageArtifact> {
    if (!isAbsolute(localPath)) throw new Error("Package path must be absolute");
    if (!(await lstat(localPath)).isFile()) throw new Error("Package source must be a regular file");
    const source = await open(localPath, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const artifactId = randomUUID();
    const targetPath = join(this.directory, `${artifactId}.zip`);
    const metadataPath = join(this.directory, `${artifactId}.json`);
    let target;
    let metadata;
    let output: WriteStream | undefined;
    let complete = false;
    try {
      const before = await source.stat();
      if (!before.isFile()) throw new Error("Package source must be a regular file");
      if (before.size > MAX_ARCHIVE_BYTES) throw new Error("Package size exceeds 128 MiB limit");
      await mkdir(this.directory, { recursive: true, mode: 0o700 });
      target = await open(targetPath, "wx", 0o600);
      const hash = createHash("sha256");
      let sizeBytes = 0;
      output = target.createWriteStream({ autoClose: false });
      await pipeline(
        source.createReadStream({ autoClose: false }),
        new Transform({
          transform(chunk: Buffer, _encoding, callback) {
            sizeBytes += chunk.length;
            if (sizeBytes > MAX_ARCHIVE_BYTES) return callback(new Error("Package size exceeds 128 MiB limit"));
            hash.update(chunk);
            callback(null, chunk);
          },
        }),
        output,
      );
      const after = await source.stat();
      if (sizeBytes !== before.size || after.size !== before.size || after.mtimeMs !== before.mtimeMs || after.ctimeMs !== before.ctimeMs) {
        throw new Error("Package source changed during capture");
      }
      await target.sync();
      const artifact: PackageArtifact = {
        artifactId,
        localPath: targetPath,
        mimeType: "application/zip",
        sizeBytes,
        sha256: hash.digest("hex"),
        expiresAt: new Date(Date.now() + RETENTION_MS).toISOString(),
      };
      metadata = await open(metadataPath, "wx", 0o600);
      await metadata.writeFile(JSON.stringify(artifact), "utf8");
      await metadata.sync();
      complete = true;
      return artifact;
    } finally {
      output?.destroy();
      await source.close();
      await target?.close();
      await metadata?.close();
      if (!complete) {
        if (target) await unlink(targetPath).catch(() => undefined);
        if (metadata) await unlink(metadataPath).catch(() => undefined);
      }
    }
  }

  async get(artifactId: string): Promise<PackageArtifact> {
    if (!HANDLE.test(artifactId)) throw new Error("Unknown package artifact handle");
    const metadataPath = join(this.directory, `${artifactId}.json`);
    if (!(await lstat(metadataPath)).isFile()) throw new Error("Invalid artifact metadata");
    const metadata = await open(metadataPath, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    let artifact: PackageArtifact;
    try {
      const stat = await metadata.stat();
      if (!stat.isFile() || stat.size > 4096) throw new Error("Invalid artifact metadata");
      artifact = JSON.parse(await metadata.readFile("utf8")) as PackageArtifact;
    } finally {
      await metadata.close();
    }
    const expectedPath = join(this.directory, `${artifactId}.zip`);
    if (
      artifact.artifactId !== artifactId ||
      artifact.localPath !== expectedPath ||
      artifact.mimeType !== "application/zip" ||
      !Number.isSafeInteger(artifact.sizeBytes) ||
      artifact.sizeBytes < 0 ||
      artifact.sizeBytes > MAX_ARCHIVE_BYTES ||
      typeof artifact.sha256 !== "string" ||
      !/^[0-9a-f]{64}$/.test(artifact.sha256) ||
      typeof artifact.expiresAt !== "string" ||
      !Number.isFinite(Date.parse(artifact.expiresAt))
    ) {
      throw new Error("Invalid artifact metadata");
    }
    if (Date.parse(artifact.expiresAt) <= Date.now()) throw new Error("Package artifact expired");
    if (!(await lstat(expectedPath)).isFile()) throw new Error("Package artifact integrity changed");
    const file = await open(expectedPath, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    try {
      const stat = await file.stat();
      if (!stat.isFile() || stat.size !== artifact.sizeBytes) throw new Error("Package artifact integrity changed");
      const hash = createHash("sha256");
      let bytes = 0;
      for await (const chunk of file.createReadStream({ autoClose: false })) {
        bytes += chunk.length;
        if (bytes > artifact.sizeBytes) throw new Error("Package artifact integrity changed");
        hash.update(chunk);
      }
      if (bytes !== artifact.sizeBytes || hash.digest("hex") !== artifact.sha256)
        throw new Error("Package artifact integrity hash changed");
    } finally {
      await file.close();
    }
    return { ...artifact };
  }
}
