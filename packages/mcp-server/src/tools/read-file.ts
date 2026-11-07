import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import type { WshcmConnection } from "../connection.js";
import { fileUrl, readResponse } from "./file-contract.js";
import { callManagedFile, fileTool } from "./managed-files.js";
import type { ReadState } from "./read-state.js";

/** Register strict UTF-8 line reads with original byte metadata and a new per-instance read grant. */
export function registerReadFileTool(server: McpServer, connection: WshcmConnection, reads: ReadState): void {
  server.registerTool(
    "wshcm_read_file",
    {
      description:
        "Read UTF-8 text (file up to 1 MiB) via DLL alpha.4/API 2. Returns JSON content, original hash, BOM, line/UTF-16 coordinates and a NEW readToken required for edits in this MCP instance. Optional 1-based inclusive line range; preserves line endings. Supply the previous readToken to accumulate ranges of the same version; otherwise only this read is granted. Tokens expire after 30 minutes or mutation. Separate chats sharing this server are not isolated.",
      inputSchema: z
        .strictObject({
          path: fileUrl,
          startLine: z.number().int().min(1).max(1048577).optional(),
          endLine: z.number().int().min(1).max(1048577).optional(),
          readToken: z.string().min(1).max(128).optional(),
        })
        .refine((input) => input.endLine === undefined || input.endLine >= (input.startLine ?? 1)),
      annotations: { readOnlyHint: true, destructiveHint: false },
    },
    async ({ path, startLine, endLine, readToken }) =>
      fileTool(() =>
        reads.run(async () => {
          if (readToken !== undefined) reads.require(path, readToken);
          const data = await callManagedFile(connection, "ReadJson", path, { startLine, endLine }, readResponse);
          return JSON.stringify({ ...data, readToken: reads.record(path, data, readToken) });
        }),
      ),
  );
}
