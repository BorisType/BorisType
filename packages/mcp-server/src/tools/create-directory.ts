import type { McpServer } from "@modelcontextprotocol/server";
import { wshcmSchemas, type WshcmApi } from "@boristype/ws-client";
import { toolResult } from "./result.js";

export function registerCreateDirectoryTool(server: McpServer, api: WshcmApi): void {
  server.registerTool(
    "wshcm_create_directory",
    {
      description:
        "Create a directory and missing parents via automatically managed BorisType.FileSystem/API 2. Existing directory succeeds with created=false. Files and symlink/junction ancestors are rejected. Creation of a parent chain is not transactional.",
      inputSchema: wshcmSchemas.files.mkdir,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async (input) =>
      toolResult(async () => {
        const data = await api.files.mkdir(input);
        return JSON.stringify(data);
      }),
  );
}
