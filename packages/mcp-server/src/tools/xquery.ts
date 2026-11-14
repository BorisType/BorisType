import type { McpServer } from "@modelcontextprotocol/server";
import { wshcmSchemas, type WshcmApi } from "@boristype/ws-client";
import { toolResult } from "./result.js";

export function registerXQueryTool(server: McpServer, api: WshcmApi): void {
  server.registerTool(
    "wshcm_xquery",
    {
      description:
        "Execute a query with WebSoft HCM's server-side XQuery, including the sql: prefix. No extra DLL is required. " +
        "Passes query text unchanged; may modify data and is not guaranteed read-only or idempotent. " +
        "Returns rows as platform JSON, returnedRows, truncated and limitReason, up to 256 KiB. " +
        "Platform conversion can lose negative SQL integers and conflate SQL NULL with empty text; CAST signed integers to text when needed. " +
        "Row/output limits do not bound database work; transport timeout does not guarantee cancellation. Do not blindly retry failures.",
      inputSchema: wshcmSchemas.xquery,
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    },
    async (input) =>
      toolResult(async () => {
        const data = await api.xquery(input);
        return data;
      }, 2000),
  );
}
