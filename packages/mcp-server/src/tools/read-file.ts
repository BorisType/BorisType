import type { McpServer } from "@modelcontextprotocol/server";
import { wshcmSchemas, type WshcmApi } from "@boristype/ws-client";
import { toolResult } from "./result.js";

export function registerReadFileTool(server: McpServer, api: WshcmApi): void {
  server.registerTool(
    "wshcm_read_file",
    {
      description:
        "Read UTF-8 text (file up to 1 MiB) via DLL alpha.4/API 2. Returns JSON content, original hash, BOM, line/UTF-16 coordinates and a NEW readToken required for edits in this MCP instance. Optional 1-based inclusive line range; preserves line endings. Supply the previous readToken to accumulate ranges of the same version; otherwise only this read is granted. Tokens expire after 30 minutes or mutation. Separate chats sharing this server are not isolated.",
      inputSchema: wshcmSchemas.files.read,
      annotations: { readOnlyHint: true, destructiveHint: false },
    },
    async (input) =>
      toolResult(async () => {
        const data = await api.files.read(input);
        return JSON.stringify(data);
      }),
  );
}
