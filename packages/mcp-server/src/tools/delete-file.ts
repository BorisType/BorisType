import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import type { WshcmConnection } from "../connection.js";
import { deleteResponse, fileUrl } from "./file-contract.js";
import { callManagedFile, fileTool } from "./managed-files.js";
import type { ReadState } from "./read-state.js";

/** Register deletion of one existing regular file through the managed library. */
export function registerDeleteFileTool(server: McpServer, connection: WshcmConnection, reads: ReadState): void {
  server.registerTool(
    "wshcm_delete_file",
    {
      description:
        "Delete one existing file via BorisType.FileSystem.dll 0.1.0-alpha.4/API 2. Missing files, directories, readonly files and links are errors; never deletes recursively.",
      inputSchema: z.strictObject({ path: fileUrl }),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
    },
    async ({ path }) =>
      fileTool(() =>
        reads.run(async () => {
          try {
            await callManagedFile(connection, "DeleteJson", path, {}, deleteResponse);
            return `File deleted: ${path}`;
          } finally {
            reads.invalidate(path);
          }
        }),
      ),
  );
}
