import type { McpServer } from "@modelcontextprotocol/server";
import { wshcmSchemas, type WshcmApi } from "@boristype/ws-client";
import { toolResult } from "./result.js";

export function registerDeleteFileTool(server: McpServer, api: WshcmApi): void {
  server.registerTool(
    "wshcm_delete_file",
    {
      description:
        "Delete one existing file via automatically managed BorisType.FileSystem/API 2. Missing files, directories, readonly files and links are errors; never deletes recursively.",
      inputSchema: wshcmSchemas.files.delete,
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
    },
    async (input) =>
      toolResult(async () => {
        await api.files.delete(input);
        return `File deleted: ${input.path}`;
      }),
  );
}
