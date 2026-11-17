import { readFileSync } from "node:fs";
import type { WshcmValue } from "./types.js";

export const projectionSource = readFileSync(new URL("../resources/value-projection.bs", import.meta.url), "utf8");
const maxBytes = 262144;
const maxDepth = 32;
const maxValues = 10000;
function invalid(message: string): never {
  throw new Error(`Invalid projected value carrier: ${message}`);
}

export function carrierRecord(value: unknown, keys: string[]): value is Record<string, unknown> {
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

export function carrierArray(value: unknown): value is unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > maxValues) return false;
  if (Reflect.ownKeys(value).length !== value.length + 1) return false;
  for (let index = 0; index < value.length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor?.enumerable || !("value" in descriptor)) return false;
  }
  return true;
}

export function decodeCarrierString(value: unknown): string {
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

/** One bounded decoder per response; preserves the shared native typed carrier. */
export function projectionDecoder(): (value: unknown, depth: number) => WshcmValue {
  let values = 0;
  const active = new WeakSet<object>();
  let textBytes = 0;
  function text(value: unknown): string {
    const decoded = decodeCarrierString(value);
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
        if (!carrierArray(value)) invalid("malformed array carrier");
        return value.map((entry) => decode(entry, depth + 1));
      }
      if (!carrierRecord(value, ["entries"]) || !carrierArray(value.entries)) invalid("malformed record carrier");
      const result: Record<string, WshcmValue> = {};
      for (const entry of value.entries) {
        if (!carrierArray(entry) || entry.length !== 2) invalid("malformed record entry carrier");
        const name = text(entry[0]);
        if (Object.hasOwn(result, name)) invalid("duplicate record key");
        Object.defineProperty(result, name, { value: decode(entry[1], depth + 1), enumerable: true, configurable: true, writable: true });
      }
      return result;
    } finally {
      active.delete(value);
    }
  }
  return decode;
}
