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
        "Query an HCM catalog by its registered name (see wshcm_list_object_types), or pass SQL with the sql: prefix. Returns rows, returnedRows, truncated and limitReason. Default maxRows=100, max 1000, output up to 256 KiB. Narrow the query itself to limit database work. " +
        "Safe integers are JSON numbers, larger integers exact decimal strings. Pass exact IDs as strings to wshcm_get_object for full XML. SOAP real formatting can lose precision. Nonfinite reals cause an error. On Linux C/PostgreSQL, cast signed integers to text in SQL to preserve negatives. SQL NULL and empty text may coincide. " +
        "Queries run unchanged with the connected account, can modify data and do not require the file DLL. Timeout does not guarantee cancellation. Verify effects before retrying a mutation.",
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
