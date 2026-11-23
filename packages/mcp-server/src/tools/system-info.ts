import type { McpServer } from "@modelcontextprotocol/server";
import { wshcmSchemas, type WshcmApi } from "@boristype/ws-client";
import { toolResult } from "./result.js";

export function registerSystemInfoTool(server: McpServer, api: WshcmApi): void {
  server.registerTool(
    "wshcm_get_system_info",
    {
      description:
        "Identify the answering HCM process using the native About/System Information report. Call with {} for summary: HCM, OS, database, Unibridge, run mode, cluster, full-text and personal-data flags. Unknown fields are null. " +
        "Use includeReport=true for the complete native configuration text without additional redaction. Reports over 256 KiB UTF-8 fail even for summary alone. Use wshcm_runtime_status to diagnose the file DLL. No file DLL is needed to read this report.",
      inputSchema: wshcmSchemas.systemInfo,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    (input) => toolResult(async () => JSON.stringify(await api.systemInfo(input))),
  );
}
