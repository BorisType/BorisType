import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import type { WshcmConnection } from "../connection.js";
import { fileText, fileUrl, writeResponse } from "./file-contract.js";
import { callManagedFile, fileTool } from "./managed-files.js";
import type { ReadState } from "./read-state.js";

/** Register bounded create/overwrite with UTF-8 BOM and same-directory replacement. */
export function registerWriteFileTool(server: McpServer, connection: WshcmConnection, reads: ReadState): void {
  server.registerTool(
    "wshcm_write_file",
    {
      description:
        "Create a UTF-8 BOM file via DLL alpha.4/API 2. Default mode create NEVER overwrites. mode overwrite requires a readToken covering the entire current file in this MCP instance. Mutation consumes token. Up to 1 MiB including BOM; parent must exist, links/readonly files rejected. External writes after the final check remain possible.",
      inputSchema: z
        .strictObject({
          path: fileUrl,
          content: fileText.describe("Exact text to write; UTF-8 BOM is added"),
          mode: z.enum(["create", "overwrite"]).default("create"),
          readToken: z.string().min(1).max(128).optional(),
        })
        .refine((input) => (input.mode === "overwrite" ? input.readToken !== undefined : input.readToken === undefined)),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
    },
    async ({ path, content, mode, readToken }) =>
      fileTool(() =>
        reads.run(async () => {
          const snapshot = mode === "overwrite" ? reads.require(path, readToken!, undefined, true) : undefined;
          try {
            await callManagedFile(connection, "WriteJson", path, { content, mode, expectedSha256: snapshot?.sha256 }, writeResponse);
            return `File written: ${path}`;
          } finally {
            reads.invalidate(path);
          }
        }),
      ),
  );
}
