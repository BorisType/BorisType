import { readFileSync } from "node:fs";
import type { WshcmValue } from "./types.js";

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
const maxDepth = 32;
const maxValues = 10000;

function invalid(message: string): never {
  throw new Error(`Invalid XQuery response: ${message}`);
}

function record(value: unknown, keys: string[]): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) return false;
  const actual = Reflect.ownKeys(value);
  return (
    actual.length === keys.length &&
    keys.every((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      return descriptor?.enumerable === true && "value" in descriptor;
    })
  );
}

function array(value: unknown): value is unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > maxValues) return false;
  if (Reflect.ownKeys(value).length !== value.length + 1) return false;
  for (let index = 0; index < value.length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor?.enumerable || !("value" in descriptor)) return false;
  }
  return true;
}

function decodeString(value: unknown): string {
  if (typeof value !== "string" || Buffer.byteLength(value, "utf8") > maxBytes * 6 + 2) invalid("expected bounded encoded string");
  let decoded: unknown;
  try {
    decoded = JSON.parse(value);
  } catch {
    invalid("malformed encoded string carrier");
  }
  if (typeof decoded !== "string" || !decoded.isWellFormed()) invalid("expected a well-formed encoded string");
  return decoded;
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
  const script = template.replace(/\$\{(queryLiteral|maxRows)\}/g, (_, name: string) =>
    name === "queryLiteral" ? literal : String(maxRows),
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
  let values = 0;
  const active = new WeakSet<object>();
  let textBytes = 0;
  function text(value: unknown): string {
    const decoded = decodeString(value);
    textBytes += Buffer.byteLength(decoded, "utf8");
    if (textBytes > maxBytes) invalid("decoded text exceeds output limit");
    return decoded;
  }
  function decode(value: unknown, depth: number): WshcmValue {
    if (depth > maxDepth || ++values > maxValues) invalid("projection depth or values limit exceeded");
    if (typeof value === "string") return text(value);
    if (value === null || value === undefined || typeof value === "boolean" || typeof value === "number") return value;
    if (typeof value === "bigint") {
      if (value < -(1n << 63n) || value > (1n << 63n) - 1n) invalid("integer outside signed int64");
      return value;
    }
    if (typeof value !== "object") invalid("unsupported carrier value");
    if (active.has(value)) invalid("cyclic carrier");
    active.add(value);
    try {
      if (Array.isArray(value)) {
        if (!array(value)) invalid("malformed array carrier");
        return value.map((entry) => decode(entry, depth + 1));
      }
      if (!record(value, ["entries"]) || !array(value.entries)) invalid("malformed record carrier");
      const result: Record<string, WshcmValue> = {};
      for (const entry of value.entries) {
        if (!array(entry) || entry.length !== 2) invalid("malformed record entry carrier");
        const name = text(entry[0]);
        if (Object.hasOwn(result, name)) invalid("duplicate record key");
        Object.defineProperty(result, name, { value: decode(entry[1], depth + 1), enumerable: true, configurable: true, writable: true });
      }
      return result;
    } finally {
      active.delete(value);
    }
  }
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
