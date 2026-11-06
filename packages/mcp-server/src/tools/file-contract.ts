import { z } from "zod";

/** Fixed managed text and JSON budgets (bytes, not UTF-16 length). */
export const MAX_FILE_BYTES = 1048576;
/** Maximum inner request/response JSON bytes; the outer carrier adds escaping. */
export const MAX_FILE_JSON_BYTES = 8388608;
/** Server URLs are resolved only by the BS platform, never by the client OS. */
export const fileUrl = z
  .string()
  .min(11)
  .max(4096)
  .regex(/^x-local:\/\/[^\u0000?#]+$/)
  .describe("Server file or directory URL (x-local://)");
/** Text requests must be well-formed UTF-16, NUL-free and fit the UTF-8 budget. */
export const fileText = z
  .string()
  .max(MAX_FILE_BYTES)
  .refine((text) => text.isWellFormed() && !text.includes("\0") && Buffer.byteLength(text, "utf8") <= MAX_FILE_BYTES);
/** Lowercase original-byte hash returned by the managed implementation. */
export const fileHash = z.string().regex(/^[0-9a-f]{64}$/);
/** Successful ReadJson response; the content has already had one BOM removed. */
export const readResponse = z
  .strictObject({
    apiVersion: z.literal(2),
    content: fileText,
    sha256: fileHash,
    bom: z.boolean(),
    startLine: z
      .number()
      .int()
      .min(1)
      .max(MAX_FILE_BYTES + 1),
    endLine: z
      .number()
      .int()
      .min(1)
      .max(MAX_FILE_BYTES + 1),
    totalLines: z
      .number()
      .int()
      .min(1)
      .max(MAX_FILE_BYTES + 1),
    startOffset: z.number().int().min(0).max(MAX_FILE_BYTES),
    endOffset: z.number().int().min(0).max(MAX_FILE_BYTES),
    totalLength: z.number().int().min(0).max(MAX_FILE_BYTES),
  })
  .refine(
    (data) =>
      data.startLine <= data.endLine &&
      data.endLine <= data.totalLines &&
      data.startOffset <= data.endOffset &&
      data.endOffset <= data.totalLength &&
      data.content.length === data.endOffset - data.startOffset,
  );
/** Successful WriteJson response. */
export const writeResponse = z.strictObject({
  apiVersion: z.literal(2),
  bytesWritten: z.number().int().min(3).max(MAX_FILE_BYTES),
  sha256: fileHash,
});
/** Immediate directory entries; links are data and are never traversed. */
export const listResponse = z.strictObject({
  apiVersion: z.literal(2),
  entries: z
    .array(
      z.strictObject({
        name: z
          .string()
          .min(1)
          .refine((name) => !name.includes("/") && !name.includes("\0") && name !== "." && name !== ".."),
        isDirectory: z.boolean(),
        isSymbolicLink: z.literal(true).optional(),
      }),
    )
    .max(10000),
});
/** Successful DeleteJson response. */
export const deleteResponse = z.strictObject({ apiVersion: z.literal(2), deleted: z.literal(true) });
/** Targeted edits return hashes for preview/commit workflows. */
export const editResponse = z
  .strictObject({
    apiVersion: z.literal(2),
    status: z.enum(["applied", "dry_run", "unchanged"]),
    editsCount: z.number().int().min(0).max(100),
    previousSha256: fileHash,
    sha256: fileHash,
    content: fileText.optional(),
  })
  .refine((data) => (data.status === "dry_run") === (data.content !== undefined), { message: "Only dry_run responses contain content" });
/** Operational errors must be explicit, versioned and structurally complete. */
export const fileError = z.strictObject({
  apiVersion: z.literal(2),
  error: z.strictObject({
    code: z.string().min(1).max(64),
    message: z.string().max(2000),
    editIndex: z.number().int().min(1).max(100).optional(),
  }),
});
