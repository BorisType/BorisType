import type { McpServer } from "@modelcontextprotocol/server";
import { wshcmSchemas, type WshcmApi } from "@boristype/ws-client";
import { toolResult } from "./result.js";

export function registerListDirectoryTool(server: McpServer, api: WshcmApi): void {
  server.registerTool(
    "wshcm_list_directory",
    {
      description:
        "List immediate entries in ordinal order via BorisType.FileSystem.dll 0.1.0-alpha.4/API 2. Returns a JSON array of name/isDirectory and isSymbolicLink=true for links. At most 10000 entries; overflow is an error. Root links and file roots are rejected.",
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
