import type { McpServer } from "@modelcontextprotocol/server";
import { wshcmSchemas, type WshcmApi } from "@boristype/ws-client";
import { toolResult } from "./result.js";

export function registerListDirectoryTool(server: McpServer, api: WshcmApi): void {
  server.registerTool(
    "wshcm_list_directory",
    {
      description:
        "List the immediate children of one physical HCM x-local:// directory in ordinal name order. The result text is a JSON array of {name,isDirectory}, with isSymbolicLink=true on link entries. A file or link root and directories over 10000 entries are errors. Use wshcm_search_files to find descendants and wshcm_read_file to read a result.",
      inputSchema: wshcmSchemas.files.list,
      annotations: { readOnlyHint: true, destructiveHint: false },
    },
    async (input) =>
      toolResult(async () => {
        const data = await api.files.list(input);
        return JSON.stringify(data.entries);
      }),
  );
}
