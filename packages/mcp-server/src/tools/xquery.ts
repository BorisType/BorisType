import type { McpServer } from "@modelcontextprotocol/server";
import { wshcmSchemas, type WshcmApi } from "@boristype/ws-client";
import { toolResult } from "./result.js";

const maxResponseBytes = 262144;

/** Present the shared SDK's typed XQuery data as bounded MCP JSON. */
export function registerXQueryTool(server: McpServer, api: WshcmApi): void {
  server.registerTool(
    "wshcm_xquery",
    {
      description:
        "Execute a query with WebSoft HCM's server-side XQuery, including the sql: prefix. No extra DLL is required. " +
        "Passes query text unchanged; may modify data and is not guaranteed read-only or idempotent. " +
        "Returns typed query rows as JSON, returnedRows, truncated and limitReason, up to 256 KiB. " +
        "Safe integers are JSON numbers; larger integers are exact decimal strings. Nonfinite reals cause an error. " +
        "HCM SOAP real serialization can lose precision. " +
        "Platform conversion can lose negative SQL integers and conflate SQL NULL with empty text; CAST signed integers to text when needed. " +
        "Row/output limits do not bound database work; transport timeout does not guarantee cancellation. Do not blindly retry failures.",
      inputSchema: wshcmSchemas.xquery,
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    },
    async (input) =>
      toolResult(async () => {
        const result = await api.xquery(input);
        // JSON has no bigint: presentation does not change the shared SDK result.
        const text = JSON.stringify(result, (_key, value: unknown) => {
          if (typeof value === "bigint") {
            return value >= BigInt(Number.MIN_SAFE_INTEGER) && value <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(value) : String(value);
          }
          if (typeof value === "number" && !Number.isFinite(value)) {
            throw new Error("Nonfinite real values cannot be represented in MCP JSON");
          }
          return value;
        });
        if (Buffer.byteLength(text, "utf8") > maxResponseBytes) {
          throw new Error("XQuery response must be JSON text within 256 KiB");
        }
        return text;
      }, 2000),
  );
}
