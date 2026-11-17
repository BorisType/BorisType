import type { McpServer } from "@modelcontextprotocol/server";
import { wshcmSchemas, type WshcmApi } from "@boristype/ws-client";
import { toolResult } from "./result.js";

export function registerSystemInfoTool(server: McpServer, api: WshcmApi): void {
  server.registerTool(
    "wshcm_get_system_info",
    {
      description:
        "Read HCM environment information from the platform's About/System Information report: HCM, OS, database and Unibridge versions, run mode, cluster, full-text index and personal-data flags. Returns JSON with summary; missing or unrecognized summary fields are null. Set includeReport=true to include the complete native report (INI/XML/global settings), without additional redaction. Reports over 256 KiB UTF-8 are rejected whole. No BorisType file DLL is required; no retries or cluster-wide snapshot guarantee.",
      inputSchema: wshcmSchemas.systemInfo,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    (input) => toolResult(async () => JSON.stringify(await api.systemInfo(input))),
  );
}
