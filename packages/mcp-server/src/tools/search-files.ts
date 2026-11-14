import type { McpServer } from "@modelcontextprotocol/server";
import { wshcmSchemas, type WshcmApi } from "@boristype/ws-client";
import { toolResult } from "./result.js";

export function registerSearchFilesTool(server: McpServer, api: WshcmApi): void {
  server.registerTool(
    "wshcm_search_files",
    {
      description:
        "Search file names by glob, or UTF-8 file contents by literal/line regex, below a WebSoft HCM x-local:// directory. " +
        "Automatically prepares packaged BorisType.FileSystem (API 2). A stale loaded build requires HCM process restart. Returns root URL, relative paths, optional line/column/text, " +
        "work/skip counters and limitReason. Inspect skipped and limitReason for incomplete coverage. Does not follow links.",
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
