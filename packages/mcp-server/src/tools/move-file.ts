import type { McpServer } from "@modelcontextprotocol/server";
import { wshcmSchemas, type WshcmApi } from "@boristype/ws-client";
import { toolResult } from "./result.js";

export function registerMoveFileTool(server: McpServer, api: WshcmApi): void {
  server.registerTool(
    "wshcm_move_file",
    {
      description:
        "Rename or move one physical file between x-local:// URLs, including large or binary files, without a text read. The destination parent must exist and the destination name must be free. Returns moved=true. Rejects directories, links and read-only sources. Cross-filesystem rename fails without copy/delete fallback. The attempt invalidates read tokens for both URLs.",
      inputSchema: wshcmSchemas.files.move,
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
    },
    async (input) =>
      toolResult(async () => {
        const data = await api.files.move(input);
        return JSON.stringify(data);
      }),
  );
}
