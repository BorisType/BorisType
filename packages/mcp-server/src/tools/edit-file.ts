import type { McpServer } from "@modelcontextprotocol/server";
import { wshcmSchemas, type WshcmApi } from "@boristype/ws-client";
import { toolResult } from "./result.js";

export function registerEditFileTool(server: McpServer, api: WshcmApi): void {
  server.registerTool(
    "wshcm_edit_file",
    {
      description:
        "Apply up to 100 exact unique oldText/newText edits via DLL alpha.4/API 2. Requires a readToken from this MCP instance; every oldText must be fully covered by reads of the same version. All patches validate before writing. Token is consumed on a mutation attempt; reread afterwards. dryRun preserves token but does not grant additional ranges. Preserves BOM/newlines; max 1 MiB. External writes after the final check remain possible.",
      inputSchema: wshcmSchemas.files.edit,
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
    },
    async (input) =>
      toolResult(async () => {
        const data = await api.files.edit(input);
        return JSON.stringify(data);
      }),
  );
}
