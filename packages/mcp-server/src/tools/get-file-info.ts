import type { McpServer } from "@modelcontextprotocol/server";
import { wshcmSchemas, type WshcmApi } from "@boristype/ws-client";
import { toolResult } from "./result.js";

export function registerGetFileInfoTool(server: McpServer, api: WshcmApi): void {
  server.registerTool(
    "wshcm_get_file_info",
    {
      description:
        "Inspect one physical HCM x-local:// entry before deciding how to handle it. Returns name, isDirectory, modifiedUtc and, for a file, sizeBytes. Works for binary and large files. Links/junctions are rejected. Use wshcm_read_file for text and a readToken.",
      inputSchema: wshcmSchemas.files.info,
      annotations: { readOnlyHint: true, destructiveHint: false },
    },
    async (input) =>
      toolResult(async () => {
        const data = await api.files.info(input);
        return JSON.stringify(data);
      }),
  );
}
