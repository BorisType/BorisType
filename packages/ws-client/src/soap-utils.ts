import { XMLParser, XMLBuilder, XMLValidator } from "fast-xml-parser";
import { WshcmException, WshcmSoapFault } from "./exceptions.js";
import type { WshcmValue } from "./types.js";

const INT64_MIN = -(1n << 63n);
const INT64_MAX = (1n << 63n) - 1n;
const UINT64_MAX = (1n << 64n) - 1n;
const prototypeNames = new Set(["__proto__", "constructor", "prototype"]);

/** XML 1.0 Char production, including supplementary Unicode code points. */
function isXmlCodePoint(codePoint: number): boolean {
  return (
    codePoint === 0x9 ||
    codePoint === 0xa ||
    codePoint === 0xd ||
    (codePoint >= 0x20 && codePoint <= 0xd7ff) ||
    (codePoint >= 0xe000 && codePoint <= 0xfffd) ||
    (codePoint >= 0x10000 && codePoint <= 0x10ffff)
  );
}

/** Reject forbidden raw characters, including unpaired JavaScript surrogates. */
function validateXmlCharacters(text: string): void {
  for (const character of text) {
    if (!isXmlCodePoint(character.codePointAt(0)!)) throw new WshcmException("Forbidden XML 1.0 character");
  }
}

/**
 * Validate references before fast-xml-parser can discard invalid characters.
 * References are literal data in CDATA, comments and processing instructions.
 */
function validateXmlReferences(xml: string): void {
  const tokens = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>|&#/g;
  const reference = /&#(?:x([\da-fA-F]+)|([0-9]+));/y;
  for (let token = tokens.exec(xml); token; token = tokens.exec(xml)) {
    if (token[0] !== "&#") continue;
    reference.lastIndex = token.index;
    const match = reference.exec(xml);
    if (!match || !isXmlCodePoint(Number.parseInt(match[1] ?? match[2]!, match[1] === undefined ? 10 : 16))) {
      throw new WshcmException("Invalid XML 1.0 numeric character reference");
    }
    tokens.lastIndex = reference.lastIndex;
  }
}

/**
 * Preserve text and namespace-qualified record keys. Reserved JavaScript names
 * use an internal prefix (invalid in XML names) until copied into own fields.
 */
const soapParser = new XMLParser({
  htmlEntities: true,
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  trimValues: false,
  parseTagValue: false,
  transformTagName: (name) => (prototypeNames.has(name) ? `#${name}` : name),
});

/**
 * Escape values including whitespace: HCM trims literal trailing whitespace,
 * while XML normalizes literal CR. Character references preserve both.
 */
function encodeSoapXmlValue(_name: string, value: unknown): string {
  const entities: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&apos;",
    " ": "&#32;",
    "\t": "&#9;",
    "\r": "&#13;",
    "\n": "&#10;",
  };
  return String(value).replace(/[&<>"' \t\r\n]/g, (character) => entities[character]!);
}

/** XMLBuilder with explicit escaping for the HCM SOAP parser. */
const soapBuilder = new XMLBuilder({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  format: true,
  indentBy: "    ",
  suppressEmptyNode: false,
  processEntities: false,
  tagValueProcessor: encodeSoapXmlValue,
  attributeValueProcessor: encodeSoapXmlValue,
});

type ValueElement = { "@_VALUE-TYPE": string; [key: string]: unknown };

/** Encode a supported value, rejecting lossy conversions and ancestor cycles. */
function buildArgumentValue(arg: unknown, ancestors: Set<object>): ValueElement {
  if (arg === null) return { "@_VALUE-TYPE": "null" };
  if (arg === undefined) return { "@_VALUE-TYPE": "undefined" };
  if (typeof arg === "string") return { "@_VALUE-TYPE": "string", "#text": arg };
  if (typeof arg === "boolean") return { "@_VALUE-TYPE": "bool", "#text": arg ? "1" : "0" };
  if (typeof arg === "bigint") {
    if (arg < INT64_MIN || arg > INT64_MAX) throw new WshcmException("SOAP integer is outside signed int64 range");
    // Native C SOAP input parses the decimal representation as unsigned bits.
    return { "@_VALUE-TYPE": "integer", "#text": BigInt.asUintN(64, arg).toString() };
  }
  if (typeof arg === "number") {
    const text = Number.isNaN(arg)
      ? "nan"
      : arg === Infinity
        ? "inf"
        : arg === -Infinity
          ? "-inf"
          : Object.is(arg, -0)
            ? "-0"
            : String(arg);
    return { "@_VALUE-TYPE": "real", "#text": text };
  }
  if (typeof arg !== "object") throw new WshcmException(`Unsupported SOAP argument type: ${typeof arg}`);
  if (ancestors.has(arg)) throw new WshcmException("Cyclic SOAP argument value");
  const array = Array.isArray(arg);
  const prototype = Object.getPrototypeOf(arg);
  if (!array && prototype !== Object.prototype && prototype !== null) {
    throw new WshcmException("Unsupported SOAP object: expected a plain record or array (native XML and dates are unsupported)");
  }
  ancestors.add(arg);
  try {
    const fields = Object.create(null) as ValueElement;
    fields["@_VALUE-TYPE"] = array ? "Array" : "Object";
    if (array) {
      // Sparse arrays and custom fields have no faithful SOAP array encoding.
      if (Reflect.ownKeys(arg).length !== arg.length + 1) throw new WshcmException("Unsupported SOAP array fields or holes");
      const entries: ValueElement[] = [];
      for (let i = 0; i < arg.length; i++) {
        const descriptor = Object.getOwnPropertyDescriptor(arg, String(i));
        if (!descriptor || !("value" in descriptor)) throw new WshcmException("Unsupported SOAP array hole or accessor");
        entries.push(buildArgumentValue(descriptor.value, ancestors));
      }
      if (entries.length) fields.e = entries;
    } else {
      for (const key of Reflect.ownKeys(arg)) {
        if (typeof key !== "string" || /[\s<>\/=:"'&]/.test(key) || XMLValidator.validate(`<${key}/>`) !== true) {
          throw new WshcmException(`Unsupported SOAP record field name: ${String(key)}`);
        }
        const descriptor = Object.getOwnPropertyDescriptor(arg, key)!;
        if (!("value" in descriptor) || !descriptor.enumerable)
          throw new WshcmException(`Unsupported SOAP record field descriptor: ${key}`);
        fields[key] = buildArgumentValue(descriptor.value, ancestors);
      }
    }
    return fields;
  } finally {
    ancestors.delete(arg);
  }
}

/**
 * Render a CallMethod SOAP request. Values must satisfy the recursive
 * WshcmValue contract; bigint is signed int64, and every number is SOAP real.
 * Native XML, dates, invalid XML field names and cyclic graphs are rejected.
 */
export function renderRequest(lib: string, method: string, methodArgs: unknown[]): string {
  const argData: Record<string, ValueElement> = Object.create(null);
  for (let i = 0; i < methodArgs.length; i++) argData[`arg-${i}`] = buildArgumentValue(methodArgs[i], new Set());
  const request = soapBuilder.build({
    "?xml": { "@_version": "1.0", "@_encoding": "utf-8" },
    "soap:Envelope": {
      "@_xmlns:soap": "http://schemas.xmlsoap.org/soap/envelope/",
      "@_xmlns": "http://www.datex-soft.com/soap/",
      "soap:Body": { CallMethod: { LibName: lib, MethodName: method, ArgData: argData } },
    },
  });
  validateXmlCharacters(request);
  return request;
}

/** Find SOAP protocol elements by local name, retaining record field prefixes. */
function findElement(obj: unknown, key: string): unknown {
  if (!obj || typeof obj !== "object" || Object.hasOwn(obj, "@_VALUE-TYPE")) return undefined;
  for (const [name, value] of Object.entries(obj)) {
    if (name.split(":").at(-1) === key) return value;
  }
  for (const value of Object.values(obj)) {
    const found = findElement(value, key);
    if (found !== undefined) return found;
  }
  return undefined;
}

/** A SOAP fault must belong to the envelope body. HTTP error pages can also contain a field named Fault. */
function responseFault(parsed: unknown): unknown {
  function direct(parent: unknown, local: string) {
    if (!parent || typeof parent !== "object") return undefined;
    return Object.entries(parent).find(([key]) => key.split(":").at(-1) === local);
  }
  const entry = direct(parsed, "Envelope");
  if (!entry) return undefined;
  const [name, envelope] = entry;
  const ns = name.includes(":") ? `@_xmlns:${name.split(":")[0]}` : "@_xmlns";
  if (!["http://schemas.xmlsoap.org/soap/envelope/", "http://www.w3.org/2003/05/soap-envelope"].includes(envelope?.[ns])) return undefined;
  return direct(direct(envelope, "Body")?.[1], "Fault")?.[1];
}

/** Extract direct XML element children, excluding attributes and text. */
function children(element: Record<string, unknown>): [string, unknown][] {
  return Object.entries(element).filter(([key]) => !key.startsWith("@_") && key !== "#text");
}

/** Parse an exact decimal int64 or native hexadecimal two's-complement value. */
function parseInteger(text: string): bigint {
  if (/^0x[\da-f]+$/i.test(text)) {
    const bits = BigInt(text);
    if (bits <= UINT64_MAX) return BigInt.asIntN(64, bits);
  } else if (/^[+-]?\d+$/.test(text)) {
    const value = BigInt(text);
    if (value >= INT64_MIN && value <= INT64_MAX) return value;
  }
  throw new WshcmException(`Invalid signed int64 SOAP integer: ${text}`);
}

/** Decode typed SOAP data without coercing unsupported or malformed values. */
function parseResultValue(element: unknown): WshcmValue {
  if (!element || typeof element !== "object" || Array.isArray(element)) throw new WshcmException("Malformed typed SOAP value");
  const record = element as Record<string, unknown>;
  const valueType = record["@_VALUE-TYPE"];
  const text = String(record["#text"] ?? "");
  const fields = children(record);
  if (valueType === "Object" || valueType === "Array") {
    if (text.trim()) throw new WshcmException(`Unexpected text in SOAP ${valueType}`);
    if (valueType === "Array") {
      if (fields.some(([name]) => name !== "e")) throw new WshcmException("Unexpected SOAP Array element (expected e)");
      const items = record.e;
      return items === undefined ? [] : (Array.isArray(items) ? items : [items]).map(parseResultValue);
    }
    const result: Record<string, WshcmValue> = {};
    for (const [key, value] of fields) {
      const name = key.startsWith("#") ? key.slice(1) : key;
      Object.defineProperty(result, name, { value: parseResultValue(value), enumerable: true, writable: true, configurable: true });
    }
    return result;
  }
  if (fields.length) throw new WshcmException(`Unexpected children in SOAP ${String(valueType)}`);
  if (valueType === "string") return text;
  const lexical = text.trim();
  if ((valueType === "null" || valueType === "undefined") && !lexical) return valueType === "null" ? null : undefined;
  if (valueType === "integer") return parseInteger(lexical);
  if (valueType === "bool" && (lexical === "0" || lexical === "1")) return lexical === "1";
  if (valueType === "real") {
    if (lexical === "nan") return NaN;
    if (lexical === "inf") return Infinity;
    if (lexical === "-inf") return -Infinity;
    if (/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(lexical)) {
      const value = Number(lexical);
      if (Number.isFinite(value)) return value;
    }
  }
  throw new WshcmException(`Invalid or unsupported SOAP VALUE-TYPE ${String(valueType)}: ${lexical}`);
}

/**
 * Decode a SOAP response into recursive values. Every integer becomes bigint;
 * native raw XML/date and malformed or untyped values throw WshcmException.
 */
export function parseResponse(responseText: string): WshcmValue {
  let parsed: unknown;
  try {
    validateXmlCharacters(responseText);
    validateXmlReferences(responseText);
    parsed = soapParser.parse(responseText, true);
  } catch (error) {
    throw new WshcmException(`Malformed SOAP XML: ${error instanceof Error ? error.message : String(error)}`);
  }
  const soapFault = responseFault(parsed);
  const fault = soapFault ?? findElement(parsed, "Fault");
  if (fault && typeof fault === "object") {
    const Fault = soapFault ? WshcmSoapFault : WshcmException;
    throw new Fault(`ERR: (${findElement(fault, "faultcode") ?? "UNKNOWN"}) ${findElement(fault, "faultstring") ?? "Unknown error"}`);
  }
  const resultData = findElement(parsed, "ResultData");
  if (!resultData || typeof resultData !== "object" || Array.isArray(resultData))
    throw new WshcmException("Unexpected response: ResultData element not found");
  const result = Object.entries(resultData).find(([name]) => name.split(":").at(-1) === "Result")?.[1];
  if (result === undefined) throw new WshcmException("Unexpected response: Result element not found");
  return parseResultValue(result);
}
