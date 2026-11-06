import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import type { WshcmConnection } from "../connection.js";
import { editResponse, fileText, fileUrl } from "./file-contract.js";
import { callManagedFile, fileTool } from "./managed-files.js";

/** Register exact sequential replacements, checked in memory before same-directory file replacement. */
export function registerEditFileTool(server: McpServer, connection: WshcmConnection): void {
  server.registerTool(
    "wshcm_edit_file",
    {
      description:
        "Apply up to 100 exact sequential oldText/newText edits via BorisType.FileSystem.dll 0.1.0-alpha.3/API 1. Each oldText must occur exactly once (overlapping matches count); all edits are validated before writing. Preserves BOM/newlines; max 1 MiB. dryRun returns preview and original hash without writing. expectedSha256 checks original bytes; external races after the final check remain possible.",
      inputSchema: z.strictObject({
        path: fileUrl,
        edits: z.array(z.strictObject({ oldText: fileText.refine((text) => text.length > 0), newText: fileText })).max(100),
        dryRun: z.boolean().optional().default(false),
        expectedSha256: z
          .string()
          .regex(/^[0-9a-fA-F]{64}$/)
          .optional()
          .describe("Original byte hash from read_file includeMetadata or edit dryRun previousSha256"),
      }),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
    },
    async ({ path, edits, dryRun, expectedSha256 }) =>
      fileTool(async () => {
        const data = await callManagedFile(connection, "EditJson", path, { edits, dryRun, expectedSha256 }, editResponse);
        return JSON.stringify(data);
      }),
  );
}
