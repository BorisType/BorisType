import type { McpServer } from "@modelcontextprotocol/server";
import { wshcmSchemas, type WshcmApi } from "@boristype/ws-client";
import { toolResult } from "./result.js";

export function registerReadFileTool(server: McpServer, api: WshcmApi): void {
  server.registerTool(
    "wshcm_read_file",
    {
      description:
        "Read a physical HCM x-local:// UTF-8 file (up to 1 MiB), optionally by 1-based inclusive startLine/endLine. Returns content with original line endings, byte sha256, bom, line/UTF-16 offsets and a fresh readToken for this URL. " +
        "Pass the previous readToken to accumulate ranges of the same version. Without it only the latest range is covered. Use the newest token for wshcm_edit_file or a full-coverage overwrite. Tokens expire after 30 minutes or invalidation in this MCP instance.",
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
