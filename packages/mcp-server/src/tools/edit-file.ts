import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import type { WshcmConnection } from "../connection.js";
import { editResponse, fileText, fileUrl } from "./file-contract.js";
import { callManagedFile, fileTool } from "./managed-files.js";
import type { ReadState } from "./read-state.js";

/** Register exact sequential replacements, checked in memory before same-directory file replacement. */
export function registerEditFileTool(server: McpServer, connection: WshcmConnection, reads: ReadState): void {
  server.registerTool(
    "wshcm_edit_file",
    {
      description:
        "Apply up to 100 exact unique oldText/newText edits via DLL alpha.4/API 2. Requires a readToken from this MCP instance; every oldText must be fully covered by reads of the same version. All patches validate before writing. Token is consumed on a mutation attempt; reread afterwards. dryRun preserves token but does not grant additional ranges. Preserves BOM/newlines; max 1 MiB. External writes after the final check remain possible.",
      inputSchema: z.strictObject({
        path: fileUrl,
        readToken: z.string().min(1).max(128),
        edits: z.array(z.strictObject({ oldText: fileText.refine((text) => text.length > 0), newText: fileText })).max(100),
        dryRun: z.boolean().optional().default(false),
        expectedSha256: z
          .string()
          .regex(/^[0-9a-fA-F]{64}$/)
          .optional()
          .describe("Optional extra check against the read token's byte hash; never replaces readToken"),
      }),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
    },
    async ({ path, readToken, edits, dryRun, expectedSha256 }) =>
      fileTool(() =>
        reads.run(async () => {
          const snapshot = reads.require(path, readToken, expectedSha256);
          try {
            const data = await callManagedFile(
              connection,
              "EditJson",
              path,
              { edits, dryRun, expectedSha256: snapshot.sha256, allowedRanges: snapshot.ranges },
              editResponse,
            );
            return JSON.stringify(data);
          } finally {
            if (!dryRun) reads.invalidate(path);
          }
        }),
      ),
  );
}
