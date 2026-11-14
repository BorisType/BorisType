import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { bundleManifestSchema, type RuntimeComponentDescriptor } from "./contracts.js";

export class BundleFailure extends Error {
  constructor(
    public readonly reason: string,
    message: string,
  ) {
    super(message);
  }
}

export function matchesArtifact(bytes: Buffer, expected: { bytes: number; sha256: string }): boolean {
  return bytes.length === expected.bytes && createHash("sha256").update(bytes).digest("hex") === expected.sha256;
}

/** Validate package bytes before exposing any payload to the remote process. */
export async function loadBundle(directory: string) {
  let manifest;
  try {
    if ((await stat(join(directory, "manifest.json"))).size > 65536) throw new Error("Manifest exceeds 64 KiB");
    manifest = bundleManifestSchema.parse(JSON.parse(await readFile(join(directory, "manifest.json"), "utf8")));
  } catch (error) {
    throw new BundleFailure("InvalidBundle", String(error));
  }
  async function payload(kind: string, component: RuntimeComponentDescriptor) {
    const files: Record<string, string> = {};
    for (const file of component.files) {
      let bytes: Buffer;
      try {
        const path = join(directory, kind, file.path);
        if ((await stat(path)).size !== file.bytes) throw new Error(`Size mismatch: ${kind}/${file.path}`);
        bytes = await readFile(path);
      } catch (error) {
        throw new BundleFailure("ArtifactMismatch", String(error));
      }
      if (!matchesArtifact(bytes, file)) throw new BundleFailure("ArtifactMismatch", `Hash mismatch: ${kind}/${file.path}`);
      files[file.path] = bytes.toString("base64");
    }
    return files;
  }
  const bootstrapPayload = await payload("bootstrap", manifest.bootstrap);
  const componentPayload = await payload("component", manifest.component);
  return { manifest, bootstrapPayload, componentPayload };
}
