import type { McpServer } from "@modelcontextprotocol/server";
import { wshcmSchemas, type WshcmApi } from "@boristype/ws-client";
import { toolResult } from "./result.js";

export function registerMoveFileTool(server: McpServer, api: WshcmApi): void {
  server.registerTool(
    "wshcm_move_file",
    {
      description:
        "Move/rename one file via automatically managed BorisType.FileSystem/API 2 without overwriting or copy/delete fallback. Source and destination are x-local:// URLs. Parent must exist; directories/links/readonly source are rejected. Linux/Windows only; cross-filesystem rename is an explicit error. Invalidates source/destination read tokens.",
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
