import { readFileSync } from "node:fs";
import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import type { WshcmConnection } from "../connection.js";
import { buildScript } from "../load.js";

const scriptTemplate = readFileSync(new URL("../../resources/xquery.bs", import.meta.url), "utf8");
const maxResponseBytes = 262144;
const input = z.strictObject({
  query: z
    .string()
    .max(65536)
    .refine(
      (query) => query.trim().length > 0 && query.isWellFormed() && !query.includes("\0") && Buffer.byteLength(query, "utf8") <= 65536,
    )
    .describe("Query passed unchanged to server-side XQuery; the sql: prefix is supported. No read-only validation."),
  maxRows: z
    .number()
    .int()
    .min(1)
    .max(1000)
    .default(100)
    .describe("Returned row limit, not a database workload limit; reads up to one extra row."),
});
const response = z
  .strictObject({
    rows: z.array(z.unknown()).max(1000),
    returnedRows: z.number().int().min(0).max(1000),
    truncated: z.boolean(),
    limitReason: z.enum(["rows", "output"]).nullable(),
  })
  .refine((value) => value.rows.length === value.returnedRows && value.truncated === (value.limitReason !== null));

/** Register a server-side XQuery passthrough, including sql:, with bounded returned JSON. */
export function registerXQueryTool(server: McpServer, connection: WshcmConnection): void {
  server.registerTool(
    "wshcm_xquery",
    {
      description:
        "Execute a query with WebSoft HCM's server-side XQuery, including the sql: prefix. No extra DLL is required. " +
        "Passes query text unchanged; may modify data and is not guaranteed read-only or idempotent. " +
        "Returns rows as platform JSON, returnedRows, truncated and limitReason, up to 256 KiB. " +
        "Platform conversion can lose negative SQL integers and conflate SQL NULL with empty text; CAST signed integers to text when needed. " +
        "Row/output limits do not bound database work; transport timeout does not guarantee cancellation. Do not blindly retry failures.",
      inputSchema: input,
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    },
    async ({ query, maxRows }) => {
      try {
        const wire = await connection.evaluator.eval(buildScript(scriptTemplate, { query, maxRows: String(maxRows) }));
        // JSON string escaping expands a code unit by at most six characters.
        if (typeof wire !== "string" || Buffer.byteLength(wire, "utf8") > maxResponseBytes * 6 + 2) {
          throw new Error("Expected a bounded JSON string carrier from WSHCM XQuery");
        }
        const text: unknown = JSON.parse(wire);
        if (typeof text !== "string" || Buffer.byteLength(text, "utf8") > maxResponseBytes) {
          throw new Error("XQuery response must be JSON text within 256 KiB");
        }
        const result = response.parse(JSON.parse(text));
        if (result.returnedRows > maxRows || (result.limitReason === "rows" && result.returnedRows !== maxRows)) {
          throw new Error("XQuery response exceeds or contradicts maxRows");
        }
        // Validate the envelope, but return original JSON: re-encoding rounds large numbers/decimals in Node.
        return { content: [{ type: "text" as const, text }] };
      } catch (error) {
        const message = (error instanceof Error ? error.message : String(error)).slice(0, 2000);
        return { content: [{ type: "text" as const, text: message }], isError: true };
      }
    },
  );
}
