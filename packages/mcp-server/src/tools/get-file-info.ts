import type { McpServer } from "@modelcontextprotocol/server";
import { wshcmSchemas, type WshcmApi } from "@boristype/ws-client";
import { toolResult } from "./result.js";

export function registerGetFileInfoTool(server: McpServer, api: WshcmApi): void {
  server.registerTool(
    "wshcm_get_file_info",
    {
      description:
        "Get file/directory name, type, UTC modification time and sizeBytes for files via DLL alpha.4/API 2. Does not read content or grant a readToken. Supports binary files and files larger than the text budget. Links/junctions are rejected.",
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
