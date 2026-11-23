import type { McpServer } from "@modelcontextprotocol/server";
import { wshcmSchemas, type WshcmApi } from "@boristype/ws-client";
import { toolResult } from "./result.js";

export function registerSearchFilesTool(server: McpServer, api: WshcmApi): void {
  server.registerTool(
    "wshcm_search_files",
    {
      description:
        "Find physical files below an HCM x-local:// directory by case-sensitive glob, or add query for literal or .NET regex line matches in UTF-8 text. Returns root and relative matches with line/column/text for content hits. " +
        "Check stats, skipped and limitReason even for empty matches. Narrow the root or glob when coverage is incomplete. Use the root plus a matched path with wshcm_read_file before editing. Search grants no readToken.",
      inputSchema: wshcmSchemas.files.search,
      annotations: { readOnlyHint: true, destructiveHint: false },
    },
    async (input) =>
      toolResult(async () => {
        const data = await api.files.search(input);
        return JSON.stringify(data);
      }),
  );
}
