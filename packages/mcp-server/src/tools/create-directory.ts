import type { McpServer } from "@modelcontextprotocol/server";
import { wshcmSchemas, type WshcmApi } from "@boristype/ws-client";
import { toolResult } from "./result.js";

export function registerCreateDirectoryTool(server: McpServer, api: WshcmApi): void {
  server.registerTool(
    "wshcm_create_directory",
    {
      description:
        "Create a physical HCM x-local:// directory and missing parents, e.g. before wshcm_write_file. Returns created=true for a new directory or false for an existing one. A file at the target or a link/junction in the path is an error. Some parent directories can remain if creation fails partway.",
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
