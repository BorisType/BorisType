import type { McpServer } from "@modelcontextprotocol/server";
import { wshcmSchemas, type WshcmApi } from "@boristype/ws-client";
import { toolResult } from "./result.js";

export function registerWriteFileTool(server: McpServer, api: WshcmApi): void {
  server.registerTool(
    "wshcm_write_file",
    {
      description:
        "Write a complete UTF-8 BOM file up to 1 MiB including BOM. Default mode create requires a free name and an existing parent (see wshcm_create_directory). For overwrite, read the entire current file with wshcm_read_file and pass its readToken. For a partial change use wshcm_edit_file. " +
        "Returns plain text 'File written: <path>'. Reread after an overwrite attempt. Other processes can write between the final comparison and rename.",
      inputSchema: wshcmSchemas.files.write,
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
    },
    async (input) =>
      toolResult(async () => {
        await api.files.write(input);
        return `File written: ${input.path}`;
      }),
  );
}
