import type { McpServer } from "@modelcontextprotocol/server";
import { wshcmSchemas, type WshcmApi } from "@boristype/ws-client";
import { toolResult } from "./result.js";

export function registerWriteFileTool(server: McpServer, api: WshcmApi): void {
  server.registerTool(
    "wshcm_write_file",
    {
      description:
        "Create a UTF-8 BOM file via DLL alpha.4/API 2. Default mode create NEVER overwrites. mode overwrite requires a readToken covering the entire current file in this MCP instance. Mutation consumes token. Up to 1 MiB including BOM; parent must exist, links/readonly files rejected. External writes after the final check remain possible.",
      inputSchema: wshcmSchemas.files.write,
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
    },
    async (input) =>
      toolResult(async () => {
        await api.files.write(input);
        return `File written: ${input.path}`;
      }),
  );
}
