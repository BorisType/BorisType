import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import type { WshcmConnection } from "../connection.js";
import { deleteResponse, fileUrl } from "./file-contract.js";
import { callManagedFile, fileTool } from "./managed-files.js";

/** Register deletion of one existing regular file through the managed library. */
export function registerDeleteFileTool(server: McpServer, connection: WshcmConnection): void {
  server.registerTool(
    "wshcm_delete_file",
    {
      description:
        "Delete one existing file via BorisType.FileSystem.dll 0.1.0-alpha.3/API 1. Missing files, directories, readonly files and links are errors; never deletes recursively.",
      inputSchema: z.strictObject({ path: fileUrl }),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
    },
    async ({ path }) =>
      fileTool(async () => {
        await callManagedFile(connection, "DeleteJson", path, {}, deleteResponse);
        return `File deleted: ${path}`;
      }),
  );
}
