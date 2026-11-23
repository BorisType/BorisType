import type { McpServer } from "@modelcontextprotocol/server";
import { wshcmSchemas, type WshcmApi } from "@boristype/ws-client";
import { toolResult } from "./result.js";

export function registerEditFileTool(server: McpServer, api: WshcmApi): void {
  server.registerTool(
    "wshcm_edit_file",
    {
      description:
        "Apply up to 100 ordered oldText/newText replacements to a physical UTF-8 file up to 1 MiB. Use the latest wshcm_read_file token for this URL and version. Each oldText must be unique and fully covered by reads. All edits validate before writing. " +
        "dryRun returns candidate content and preserves the token and its coverage. Apply returns status and byte hashes, preserving BOM and unaffected line endings. Reread after a mutation attempt or Conflict/ReadRequired. External writes remain possible between the last check and rename.",
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
