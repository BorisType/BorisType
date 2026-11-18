import { SaxesParser } from "saxes";

/** Bounded input metadata used only to check native XmlForm paths; never reserialized as data. */
export interface ObjectXmlNode {
  path: string[];
  count: number;
  hasElements: boolean;
  hasText: boolean;
  text: string;
  integerValid: boolean;
}

/** XML transport bounds; an oversized document is rejected in full. */
export const objectXmlBytes = 262144;
export const objectRequestBytes = 2097152;

/** Recognize native decimal/hex integer values without passing through Number. */
function integerValue(text: string): bigint | undefined {
  const value = text.replace(/^[\x20\t\r\n]+|[\x20\t\r\n]+$/g, "");
  if (!/^(?:[+-]?\d+|0[xX][\da-fA-F]+)$/.test(value)) return undefined;
  const normalized = value.replace(/^([+-]?)0+(?=\d)/, "$1").replace(/^(0[xX])0+(?=[\da-fA-F])/, "$1");
  if (normalized.length > 21) return undefined;
  const integer = BigInt(normalized);
  return integer >= -9223372036854775808n && integer <= 18446744073709551615n ? integer : undefined;
}

const patchModes = ["merge", "replace", "replace-array", "clear", "remove"] as const;
type PatchMode = "auto" | (typeof patchModes)[number];
export interface ObjectPatchNode extends ObjectXmlNode {
  name: string;
  parentIndex: number;
  ordinal: number;
  mode: PatchMode;
  integer: string;
  date: string;
  realValid: boolean;
}

/** Native XML wall clock at whole-second precision. Z and zero offsets are accepted XML spellings. */
function patchDate(text: string): string {
  const match = /^(\d{4}-\d{2}-\d{2})(?:T(\d{2}:\d{2}:\d{2})(?:\.(0+))?(Z|[+-]00:00)?)?$/.exec(text);
  if (!match || match[1]!.startsWith("0000")) return "";
  const clock = match[1] + "T" + (match[2] ?? "00:00:00");
  const local = new Date(clock + "Z");
  if (!Number.isFinite(local.getTime()) || local.toISOString().slice(0, 19) !== clock) return "";
  return clock;
}

type Identity = { formUrl: string; id?: string };
type Inspection<T> = { root: string; id?: string; nodes: T[] };

/** Validate strict XML 1.0 and identity; collect only bounded native validation metadata. */
export function inspectObjectXml(xml: string, identity: Identity): Inspection<ObjectXmlNode> {
  return inspect(xml, identity, false);
}

export function inspectObjectPatchXml(xml: string, identity: { formUrl: string; id: string }): Inspection<ObjectPatchNode> {
  return inspect(xml, identity, true);
}
function inspect(xml: string, identity: Identity, patch: true): Inspection<ObjectPatchNode>;
function inspect(xml: string, identity: Identity, patch: false): Inspection<ObjectXmlNode>;
function inspect(xml: string, identity: Identity, patch: boolean): Inspection<ObjectXmlNode> {
  if (!xml.trim() || Buffer.byteLength(xml, "utf8") > objectXmlBytes) throw new Error("XML size limit: provide 1–256 KiB of XML");
  if (!xml.isWellFormed()) throw new Error("Invalid XML character");
  const nodes: ObjectXmlNode[] = [];
  let repeatedPathBytes = 0;
  const stack: { index: number; pathBytes: number; node: ObjectXmlNode; children: Map<string, ObjectXmlNode[]> }[] = [];
  let root = "";
  let id: string | undefined;
  const parser = new SaxesParser({ xmlns: false, defaultXMLVersion: "1.0" });
  parser.on("error", (error) => {
    throw new Error(`Invalid XML: ${error.message}`);
  });
  parser.on("doctype", () => {
    throw new Error("XML DTD/entity definitions are not supported");
  });
  parser.on("processinginstruction", () => {
    throw new Error("XML processing instructions are not supported");
  });
  parser.on("xmldecl", (declaration) => {
    if (declaration.version !== "1.0") throw new Error("Only XML 1.0 is supported");
  });
  parser.on("opentag", (tag) => {
    if (nodes.length >= 8192) throw new Error("XML element limit: at most 8192 elements");
    if (stack.length >= 64) throw new Error("XML depth limit: at most 64 levels");
    const parent = stack.at(-1);
    if (!parent) root = tag.name;
    const path = parent ? [...parent.node.path, tag.name] : [];
    const pathBytes = patch && parent ? parent.pathBytes + Buffer.byteLength(tag.name, "utf8") : 0;
    // An arbitrarily long ancestor repeated in thousands of paths can otherwise
    // exhaust memory in JSON.stringify before the exact request budget check.
    repeatedPathBytes += pathBytes;
    if (repeatedPathBytes > objectRequestBytes) throw new Error("InputLimit: XML validation paths exceed 2 MiB");
    let mode: PatchMode = "auto";
    for (const [name, value] of Object.entries(tag.attributes)) {
      if (patch && name === "bt-mode") {
        if (!patchModes.some((m) => m === value)) throw new Error("Unknown XML bt-mode");
        mode = value as PatchMode;
        if ((!parent && mode !== "merge") || (path.length === 1 && tag.name === "id"))
          throw new Error("Invalid mode on XML root or identity");
        continue;
      }
      if (parent || name !== "SPXML-FORM") throw new Error(`Unsupported XML attribute ${name}`);
      if (value !== identity.formUrl) throw new Error("XML form attribute does not match selected form");
    }
    const node: ObjectXmlNode = { path, count: 1, hasElements: false, hasText: false, text: "", integerValid: true };
    if (patch)
      Object.assign(node, { name: tag.name, parentIndex: parent?.index ?? -1, ordinal: parent?.children.get(tag.name)?.length ?? 0, mode });
    const index = nodes.length;
    nodes.push(node);
    if (parent) {
      parent.node.hasElements = true;
      const siblings = parent.children.get(tag.name) ?? [];
      siblings.push(node);
      parent.children.set(tag.name, siblings);
    }
    stack.push({ index, pathBytes, node, children: new Map() });
  });
  const appendText = (text: string): void => {
    const frame = stack.at(-1);
    if (frame) frame.node.text += text;
    else if (/[^\x20\t\r\n]/.test(text)) throw new Error("Invalid XML text outside root");
  };
  parser.on("text", appendText);
  parser.on("cdata", (text) => {
    if (!stack.length) throw new Error("Invalid XML CDATA outside root");
    appendText(text);
  });
  parser.on("closetag", () => {
    const { node, children } = stack.pop()!;
    node.hasText = /[^\x20\t\r\n]/.test(node.text);
    const integer = node.hasText ? integerValue(node.text) : undefined;
    node.integerValid = !node.hasText || integer !== undefined;
    if (patch) {
      const p = node as ObjectPatchNode;
      const text = node.text.replace(/^[\x20\t\r\n]+|[\x20\t\r\n]+$/g, "");
      p.integer = integer?.toString() ?? "";
      p.realValid = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(text);
      p.date = patchDate(text);
      if (p.mode === "clear" && (p.hasElements || p.text.length)) throw new Error("XML clear requires an empty placeholder");
    }
    for (const siblings of children.values()) for (const sibling of siblings) sibling.count = siblings.length;
    if (node.path.length === 1 && node.path[0] === "id") {
      if (id !== undefined || node.hasElements || identity.id === undefined || integerValue(node.text)?.toString() !== identity.id)
        throw new Error("XML ID must match replace identity; create must omit ID");
      id = identity.id;
    }
  });
  parser.write(xml).close();
  if (!root || stack.length) throw new Error("XML must contain exactly one complete root");
  return { root, ...(id === undefined ? {} : { id }), nodes };
}
