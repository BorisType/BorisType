import type { McpServer } from "@modelcontextprotocol/server";
import { wshcmSchemas, type WshcmApi } from "@boristype/ws-client";
import { toolResult } from "./result.js";

export function registerDeleteFileTool(server: McpServer, api: WshcmApi): void {
  server.registerTool(
    "wshcm_delete_file",
    {
      description:
        "Delete a single physical HCM x-local:// file, including binary files. Returns plain text 'File deleted: <path>'. Missing files, directories, read-only files and links are errors. The attempt invalidates this URL's readToken. Use wshcm_delete_object for an HCM document.",
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
