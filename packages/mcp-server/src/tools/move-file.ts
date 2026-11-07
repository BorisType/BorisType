import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import type { WshcmConnection } from "../connection.js";
import { fileUrl } from "./file-contract.js";
import { callManagedFile, fileTool } from "./managed-files.js";
import type { ReadState } from "./read-state.js";

/** Register native no-replace rename; URL resolution for both paths remains in BS. */
export function registerMoveFileTool(server: McpServer, connection: WshcmConnection, reads: ReadState): void {
  server.registerTool(
    "wshcm_move_file",
    {
      description:
        "Move/rename one file via DLL alpha.4/API 2 without overwriting or copy/delete fallback. Source and destination are x-local:// URLs. Parent must exist; directories/links/readonly source are rejected. Linux/Windows only; cross-filesystem rename is an explicit error. Invalidates source/destination read tokens.",
      inputSchema: z.strictObject({ source: fileUrl, destination: fileUrl }),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
    },
    async ({ source, destination }) =>
      fileTool(() =>
        reads.run(async () => {
          try {
            return JSON.stringify(
              await callManagedFile(
                connection,
                "MoveJson",
                source,
                { destination },
                z.strictObject({ apiVersion: z.literal(2), moved: z.literal(true) }),
              ),
            );
          } finally {
            reads.invalidate(source);
            reads.invalidate(destination);
          }
        }),
      ),
  );
}
