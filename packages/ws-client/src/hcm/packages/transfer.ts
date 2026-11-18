import { createHash, randomUUID } from "node:crypto";
import { open, unlink } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import type { WshcmEvaluator } from "../types.js";
import type { PackageArtifact } from "./artifacts.js";
import { packageNative } from "./native.js";
import { WshcmPackageError, operationResult } from "./contracts.js";
const chunkBytes = 262144;
const chunk = z.strictObject({
  data: z
    .string()
    .max(349528)
    .regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/),
});
async function readChunk(e: WshcmEvaluator, operationId: string, start: number, end: number): Promise<Buffer> {
  const { data } = await packageNative(e, { operation: "read_chunk", operationId, start, end }, chunk);
  const bytes = Buffer.from(data, "base64");
  if (bytes.length !== end - start || bytes.toString("base64") !== data) throw new Error("Invalid package chunk size or encoding");
  return bytes;
}
export async function hashRemotePackage(e: WshcmEvaluator, operationId: string, sizeBytes: number): Promise<string> {
  const hash = createHash("sha256");
  for (let start = 0; start < sizeBytes; start += chunkBytes)
    hash.update(await readChunk(e, operationId, start, Math.min(start + chunkBytes, sizeBytes)));
  return hash.digest("hex");
}
export async function uploadPackage(
  e: WshcmEvaluator,
  operationId: string,
  artifact: Pick<PackageArtifact, "localPath" | "sizeBytes" | "sha256">,
): Promise<void> {
  try {
    await packageNative(e, { operation: "upload", operationId }, operationResult);
    const file = await open(artifact.localPath, "r");
    try {
      for (let start = 0; start < artifact.sizeBytes; start += chunkBytes) {
        const end = Math.min(start + chunkBytes, artifact.sizeBytes);
        const data = Buffer.alloc(end - start);
        const { bytesRead } = await file.read(data, 0, data.length, start);
        if (bytesRead !== data.length) throw new Error("Package source changed");
        const result = await packageNative(
          e,
          { operation: "write_chunk", operationId, start, end, data: data.toString("base64") },
          z.strictObject({ sizeBytes: z.number().int().min(0).max(134217728) }),
        );
        if (result.sizeBytes !== end) throw new Error("Package upload size mismatch");
      }
    } finally {
      await file.close();
    }
    if ((await hashRemotePackage(e, operationId, artifact.sizeBytes)) !== artifact.sha256) throw new Error("Package upload hash mismatch");
    await packageNative(
      e,
      { operation: "seal_upload", operationId, sizeBytes: artifact.sizeBytes, sha256: artifact.sha256 },
      operationResult,
    );
  } catch (error) {
    if (error instanceof WshcmPackageError) throw error;
    throw new WshcmPackageError(
      {
        operationId,
        code: "TransferError",
        message: String(error).slice(0, 2000),
        phase: "transfer",
        status: "unknown",
      },
      { cause: error },
    );
  }
}
export async function downloadPackage(e: WshcmEvaluator, operationId: string, sizeBytes: number, directory: string): Promise<string> {
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes < 0 || sizeBytes > 134217728) throw new Error("Package download exceeds 128 MiB");
  const path = join(directory, `${randomUUID()}.zip`);
  const file = await open(path, "wx", 0o600);
  let complete = false;
  try {
    for (let start = 0; start < sizeBytes; start += chunkBytes)
      await file.writeFile(await readChunk(e, operationId, start, Math.min(start + chunkBytes, sizeBytes)));
    await file.sync();
    complete = true;
    return path;
  } finally {
    await file.close();
    if (!complete) await unlink(path);
  }
}
