import { readFileSync } from "node:fs";
import type { WshcmValue } from "./types.js";
import { projectionSource, projectionDecoder, carrierRecord as record, carrierArray as array } from "./value-projection.js";

/** Options for bounded XQuery results; row limits do not bound database work. */
export interface XQueryOptions {
  /** Maximum returned rows (1–1000, default 100); materializes one extra row. */
  maxRows?: number;
}

/** Plain typed data projected from server-side XQuery results. */
export interface XQueryResult {
  /** Recursive ordinary records/arrays; integers are bigint and dates ISO strings. */
  rows: WshcmValue[];
  /** Number of complete returned rows. */
  returnedRows: number;
  /** Whether another row was excluded by a row or output limit. */
  truncated: boolean;
  /** The first result limit reached, or null for complete results. */
  limitReason: "rows" | "output" | null;
}

const template = readFileSync(new URL("../resources/xquery.bs", import.meta.url), "utf8");
const maxBytes = 262144;

function invalid(message: string): never {
  throw new Error(`Invalid XQuery response: ${message}`);
}

/**
 * Execute XQuery once through an evaluator and decode the private typed carrier.
 * Query text is passed unchanged as data. No retries, read-only validation,
 * database work bound or transport cancellation guarantee are provided.
 * Results are limited to whole rows, depth 32, 10,000 values and 256 KiB of
 * JSON-compatible data. Strings preserve CR/LF; native dates become ISO strings.
 */
export async function executeXQuery(
  evaluator: { eval(code: string): Promise<unknown> },
  query: string,
  options: XQueryOptions = {},
): Promise<XQueryResult> {
  if (
    typeof query !== "string" ||
    !query.trim() ||
    !query.isWellFormed() ||
    query.includes("\0") ||
    Buffer.byteLength(query, "utf8") > 65536
  ) {
    throw new TypeError("XQuery query must be nonblank, well-formed text without NUL, within 65536 UTF-8 bytes");
  }
  const maxRows = options.maxRows === undefined ? 100 : options.maxRows;
  if (!Number.isInteger(maxRows) || maxRows < 1 || maxRows > 1000) throw new TypeError("XQuery maxRows must be an integer from 1 to 1000");
  // JSON string syntax is valid BS string syntax; escape line separator literals.
  const literal = JSON.stringify(query)
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
  const script = template.replace(/\$\{(queryLiteral|maxRows|projectionSource)\}/g, (_, name: string) =>
    name === "projectionSource" ? projectionSource : name === "queryLiteral" ? literal : String(maxRows),
  );
  const response = await evaluator.eval(script);
  if (!record(response, ["rows", "returnedRows", "truncated", "limitReason"])) invalid("expected the result envelope");
  const { rows: carrier, returnedRows, truncated, limitReason } = response;
  if (
    !array(carrier) ||
    typeof returnedRows !== "bigint" ||
    returnedRows < 0n ||
    returnedRows > BigInt(maxRows) ||
    returnedRows !== BigInt(carrier.length)
  )
    invalid("inconsistent row count");
  if (
    typeof truncated !== "boolean" ||
    (limitReason !== null && limitReason !== "rows" && limitReason !== "output") ||
    truncated !== (limitReason !== null)
  )
    invalid("inconsistent truncation metadata");
  if (limitReason === "rows" && returnedRows !== BigInt(maxRows)) invalid("row limit contradicts maxRows");
  const decode = projectionDecoder();
  const rows = carrier.map((row) => decode(row, 0));
  const result: XQueryResult = { rows, returnedRows: Number(returnedRows), truncated, limitReason };
  // Conservative size accounting only: presentation policy remains the caller's.
  // Decimal strings bound both safe-number and large-decimal-string bigint JSON.
  const bounded = JSON.stringify(result, (_, value: unknown) => {
    if (typeof value === "bigint") return value.toString();
    if (typeof value === "number" && !Number.isFinite(value)) return String(value);
    return value === undefined ? null : value;
  });
  if (Buffer.byteLength(bounded, "utf8") > maxBytes) invalid("JSON-compatible output exceeds 256 KiB limit");
  return result;
}
