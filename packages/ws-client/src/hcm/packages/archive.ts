import { constants } from "node:fs";
import { lstat, open } from "node:fs/promises";
import { isAbsolute, posix } from "node:path";
import { crc32 } from "node:zlib";
import { SaxesParser } from "saxes";
import { fromBufferPromise, getFileNameLowLevel, parseExtraFields, type ZipFile } from "yauzl";
import type { PackageArchiveInspection, PackageArchivePart } from "./archive-types.js";

export type { PackageArchiveInspection, PackageArchivePart, PackageObjectEntry } from "./archive-types.js";

const MAX_ARCHIVE_BYTES = 128 * 1024 * 1024;
const MAX_EXPANDED_BYTES = 512 * 1024 * 1024;
const MAX_XML_BYTES = 32 * 1024 * 1024;
const MAX_ENTRIES = 10000;
const DESCRIPTOR_FORM = "x-local://wtv/wtv_form_download_packages.xmd";
const TYPES = new Set(["objects", "courses", "web", "custom_file"]);
interface XmlNode {
  name: string;
  text: string;
  children: XmlNode[];
}
interface ArchiveEntry {
  xml?: XmlNode;
  archive?: Archive;
  directory: boolean;
}
type Archive = Map<string, ArchiveEntry>;
interface Budget {
  totalEntries: number;
  expandedBytes: number;
}

/** Reject ambiguous extraction paths before any caller can hand the original ZIP to HCM. */
function archivePath(value: string): string {
  let path = value;
  for (let i = 0; i < 8; i++) {
    if (
      !path ||
      /[\\\x00-\x1f\x7f:?#]/.test(path) ||
      path.startsWith("/") ||
      path.split("/").some((part) => part === "." || part === ".." || (part === "" && !path.endsWith("/")))
    ) {
      throw new Error("Unsafe package archive path");
    }
    const pieces = path.replace(/\/$/, "").split("/");
    if (pieces.some((part) => !part || /[. ]$/.test(part) || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) {
      throw new Error("Unsafe package archive path");
    }
    if (!path.includes("%")) return path;
    let decoded: string;
    try {
      decoded = decodeURIComponent(path);
    } catch {
      throw new Error("Invalid package archive path encoding");
    }
    if (decoded === path) return path;
    path = decoded;
  }
  throw new Error("Excessively encoded package archive path");
}

function validateExtraFields(bytes: Buffer, rawName: Buffer, expectedName: string): void {
  // yauzl tolerates a trailing partial extra-field header; native extractors may disagree.
  let offset = 0;
  while (offset < bytes.length) {
    if (offset + 4 > bytes.length) throw new Error("Truncated package ZIP extra-field header");
    offset += 4 + bytes.readUInt16LE(offset + 2);
    if (offset > bytes.length) throw new Error("Package ZIP extra-field length exceeds header");
  }
  // Inspect every Unicode field, since extractors can choose a different occurrence.
  for (const field of parseExtraFields(bytes)) {
    if (field.id !== 0x7075) continue;
    if (field.data.length < 6 || field.data[0] !== 1 || field.data.readUInt32LE(1) !== crc32(rawName))
      throw new Error("Invalid package ZIP Unicode filename metadata");
    let name: string;
    try {
      name = new TextDecoder("utf-8", { fatal: true }).decode(field.data.subarray(5));
    } catch {
      throw new Error("Invalid package ZIP Unicode filename encoding");
    }
    archivePath(name);
    if (name !== expectedName) throw new Error("Ambiguous package ZIP Unicode filename override");
  }
}

function xmlDocument(bytes: Buffer): XmlNode {
  if (bytes.length > MAX_XML_BYTES) throw new Error("Package XML size exceeds 32 MiB limit");
  let xml: string;
  try {
    xml = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error("Package XML must be valid UTF-8");
  }
  const parser = new SaxesParser({ xmlns: false, defaultXMLVersion: "1.0" });
  const stack: XmlNode[] = [];
  let root: XmlNode | undefined;
  let nodes = 0;
  parser.on("error", (error) => {
    throw new Error(`Invalid package XML: ${error.message}`);
  });
  parser.on("doctype", () => {
    throw new Error("Package XML DTD/entities are not supported");
  });
  parser.on("processinginstruction", () => {
    throw new Error("Package XML processing instructions are not supported");
  });
  parser.on("xmldecl", (declaration) => {
    if (declaration.version !== "1.0" || (declaration.encoding && !/^utf-?8$/i.test(declaration.encoding)))
      throw new Error("Only UTF-8 XML 1.0 is supported");
  });
  parser.on("opentag", (tag) => {
    if (stack.length >= 64 || ++nodes > 250000) throw new Error("Package XML structure limit exceeded");
    for (const [name, value] of Object.entries(tag.attributes)) {
      if (
        /^(?:SPXML-FORM|FORM)$/i.test(name) &&
        (name !== "SPXML-FORM" || stack.length !== 0 || tag.name !== "download_packages" || value !== DESCRIPTOR_FORM)
      ) {
        throw new Error("Package XML form override is not supported");
      }
    }
    const node: XmlNode = { name: tag.name, text: "", children: [] };
    if (stack.length) stack.at(-1)!.children.push(node);
    else root = node;
    stack.push(node);
  });
  const appendText = (text: string): void => {
    if (stack.length) stack.at(-1)!.text += text;
  };
  parser.on("text", appendText);
  parser.on("cdata", appendText);
  parser.on("closetag", () => {
    stack.pop();
  });
  parser.write(xml).close();
  if (!root || stack.length) throw new Error("Incomplete package XML");
  return root;
}

function child(node: XmlNode, name: string, required = true): XmlNode | undefined {
  const children = node.children.filter((item) => item.name === name);
  if (children.length > 1 || (required && children.length !== 1)) throw new Error(`Invalid package XML field ${name}`);
  return children[0];
}
function scalar(node: XmlNode, name: string, required = true): string | undefined {
  const value = child(node, name, required);
  if (!value) return undefined;
  if (value.children.length) throw new Error(`Invalid package XML scalar ${name}`);
  const text = value.text.trim();
  if (required && !text) throw new Error(`Empty package XML field ${name}`);
  return text;
}
function exactId(value: string): string {
  if (value.length > 32 || !/^(?:\d+|0[xX][0-9a-fA-F]+)$/.test(value)) throw new Error("Invalid package object ID");
  const id = BigInt(value);
  if (id <= 0n || id > 18446744073709551615n) throw new Error("Package object ID outside unsigned 64-bit range");
  return id.toString();
}
function addId(ids: Set<string>, value: string): string {
  const id = exactId(value);
  if (ids.has(id)) throw new Error(`Duplicate package object ID ${id}`);
  ids.add(id);
  return id;
}

async function readArchive(bytes: Buffer, depth: number, budget: Budget): Promise<Archive> {
  if (depth > 2) throw new Error("Package ZIP depth limit exceeded");
  if (bytes.length > MAX_ARCHIVE_BYTES) throw new Error("Package ZIP size exceeds 128 MiB limit");
  const zip: ZipFile = await fromBufferPromise(bytes, {
    lazyEntries: true,
    autoClose: false,
    strictFileNames: true,
    validateEntrySizes: true,
  });
  const archive: Archive = new Map();
  const portableNames = new Map<string, boolean>();
  try {
    if (zip.entryCount + budget.totalEntries > MAX_ENTRIES) throw new Error("Package ZIP entry limit exceeded");
    for await (const entry of zip.eachEntry()) {
      if (++budget.totalEntries > MAX_ENTRIES) throw new Error("Package ZIP entry limit exceeded");
      const name = archivePath(entry.fileName);
      // Native extractors may use the legacy name instead of the Unicode extra field.
      archivePath(entry.fileNameRaw.toString("latin1"));
      if (getFileNameLowLevel(entry.generalPurposeBitFlag, entry.fileNameRaw, [], true) !== entry.fileName)
        throw new Error("Ambiguous package ZIP Unicode filename override");
      validateExtraFields(entry.extraFieldRaw, entry.fileNameRaw, entry.fileName);
      const portableName = name.replace(/\/$/, "").toLowerCase();
      if (portableNames.has(portableName)) throw new Error("Duplicate package ZIP entry");
      portableNames.set(portableName, name.endsWith("/"));
      if (entry.isEncrypted() || entry.generalPurposeBitFlag & 0x40) throw new Error("Encrypted package ZIP is not supported");
      const mode = (entry.externalFileAttributes >>> 16) & 0xf000;
      if (mode && mode !== 0x8000 && mode !== 0x4000)
        throw new Error("Package ZIP entries must be regular files or directories; symlinks are not supported");
      if (entry.compressionMethod !== 0 && entry.compressionMethod !== 8) throw new Error("Unsupported package ZIP compression");
      const header = await zip.readLocalFileHeaderPromise(entry);
      if (
        header.generalPurposeBitFlag !== entry.generalPurposeBitFlag ||
        header.compressionMethod !== entry.compressionMethod ||
        !header.fileName.equals(entry.fileNameRaw)
      ) {
        throw new Error("Inconsistent package ZIP local header");
      }
      validateExtraFields(header.extraField, header.fileName, entry.fileName);
      if (
        !(entry.generalPurposeBitFlag & 8) &&
        (header.crc32 !== entry.crc32 ||
          (header.compressedSize !== entry.compressedSize && header.compressedSize !== 0xffffffff) ||
          (header.uncompressedSize !== entry.uncompressedSize && header.uncompressedSize !== 0xffffffff))
      ) {
        throw new Error("Inconsistent package ZIP entry metadata");
      }
      const directory = name.endsWith("/");
      if ((directory && entry.uncompressedSize !== 0) || (mode === 0x4000 && !directory)) throw new Error("Invalid package ZIP directory");
      if (entry.uncompressedSize > MAX_EXPANDED_BYTES - budget.expandedBytes)
        throw new Error("Package expanded bytes exceed 512 MiB limit");
      if (/\.xml$/i.test(name) && entry.uncompressedSize > MAX_XML_BYTES) throw new Error("Package XML size exceeds 32 MiB limit");
      const stream = await zip.openReadStreamPromise(entry);
      const chunks: Buffer[] = [];
      let actualBytes = 0;
      let checksum = 0;
      let retain = /\.(?:xml|zip)$/i.test(name);
      let prefix = Buffer.alloc(0);
      try {
        for await (const chunk of stream) {
          const data = chunk as Buffer;
          actualBytes += data.length;
          budget.expandedBytes += data.length;
          if (budget.expandedBytes > MAX_EXPANDED_BYTES) throw new Error("Package expanded bytes exceed 512 MiB limit");
          if (directory && actualBytes) throw new Error("Invalid package ZIP directory data");
          if (/\.xml$/i.test(name) && actualBytes > MAX_XML_BYTES) throw new Error("Package XML size exceeds 32 MiB limit");
          checksum = crc32(data, checksum);
          const awaitingPrefix = prefix.length < 4;
          if (awaitingPrefix) {
            prefix = Buffer.concat([prefix, data.subarray(0, 4 - prefix.length)]);
            if (prefix.length === 4 && (prefix.readUInt32LE() === 0x04034b50 || prefix.readUInt32LE() === 0x06054b50)) retain = true;
          }
          if (retain || awaitingPrefix) chunks.push(data);
          if (!retain && prefix.length === 4) chunks.length = 0;
        }
      } finally {
        stream.destroy();
      }
      if (actualBytes !== entry.uncompressedSize || checksum !== entry.crc32)
        throw new Error("Package ZIP size or CRC32 integrity mismatch");
      const content = retain ? Buffer.concat(chunks, actualBytes) : undefined;
      const looksLikeZip = prefix.length === 4 && (prefix.readUInt32LE() === 0x04034b50 || prefix.readUInt32LE() === 0x06054b50);
      const nested = content && (/\.zip$/i.test(name) || looksLikeZip) ? await readArchive(content, depth + 1, budget) : undefined;
      const xml = content && /\.xml$/i.test(name) ? xmlDocument(content) : undefined;
      archive.set(name, { directory, ...(nested ? { archive: nested } : {}), ...(xml ? { xml } : {}) });
    }
  } finally {
    zip.close();
  }
  // File/directory overlaps also have different native interpretations across OSes.
  for (const name of portableNames.keys()) {
    let parent = posix.dirname(name);
    while (parent !== ".") {
      if (portableNames.get(parent) === false) throw new Error("Overlapping package ZIP paths");
      parent = posix.dirname(parent);
    }
  }
  return archive;
}

function fillObjects(part: PackageArchivePart, data: XmlNode, ids: Set<string>): void {
  if (data.name !== "data") throw new Error("Object package must contain data/update.xml");
  const basic = child(data, "basic")!;
  if (scalar(basic, "id") !== part.id) throw new Error("Object package ID does not match descriptor");
  const version = scalar(basic, "server_version", false);
  if (version) part.serverVersion = version;
  const sections = new Set<string>();
  for (const section of data.children) {
    if (sections.has(section.name)) throw new Error("Duplicate object package section");
    sections.add(section.name);
    switch (section.name) {
      case "basic":
        break;
      case "custom_templates":
        part.hasCustomTemplates = true;
        break;
      case "access_roles":
        part.hasAccessRoles = true;
        break;
      case "lists":
        part.hasLists = true;
        break;
      case "deleted_objects":
        for (const object of section.children) {
          if (object.name !== "object") throw new Error("Invalid deleted object entry");
          part.deletedObjectIds.push(addId(ids, scalar(object, "id")!));
        }
        break;
      default:
        if (!/^[a-z][a-z0-9_]*s$/.test(section.name) || section.text.trim()) throw new Error("Unsupported object package section");
        for (const object of section.children) {
          if (`${object.name}s` !== section.name) throw new Error("Object type does not match its catalog");
          part.objects.push({
            id: addId(ids, scalar(object, "id")!),
            type: object.name,
            name: scalar(object, "name", false) ?? scalar(object, "code", false) ?? "",
          });
        }
    }
  }
}

function inspectContents(archive: Archive): PackageArchivePart[] {
  const descriptor = archive.get("desc.xml")?.xml;
  const ids = new Set<string>();
  const packageIds = new Set<string>();
  const packages: PackageArchivePart[] = [];
  function part(id: string, type: string, url: string, baseUrl?: string): PackageArchivePart {
    if (!id || id.length > 256 || packageIds.has(id)) throw new Error("Invalid or duplicate package ID");
    packageIds.add(id);
    if (!TYPES.has(type)) throw new Error(`Unsupported package type ${type}`);
    return {
      id,
      type,
      url,
      ...(baseUrl ? { baseUrl } : {}),
      objects: [],
      hasCustomTemplates: false,
      hasAccessRoles: false,
      hasLists: false,
      deletedObjectIds: [],
    };
  }
  if (descriptor) {
    if (descriptor.name !== "download_packages" || descriptor.text.trim() || !descriptor.children.length)
      throw new Error("Invalid package descriptor");
    for (const entry of descriptor.children) {
      if (entry.name !== "download_package") throw new Error("Invalid package descriptor entry");
      if (entry.children.some((field) => !["id", "type", "url", "base_url", "package_date"].includes(field.name)))
        throw new Error("Unsupported package descriptor field");
      const url = scalar(entry, "url")!;
      const targetPath = archivePath(url);
      // Encoded aliases are unsafe when the server's URL resolver decodes differently.
      if (targetPath !== url) throw new Error("Encoded descriptor URL is not supported");
      const target = archive.get(targetPath);
      if (!target || target.directory) throw new Error("Package descriptor target is missing");
      const item = part(scalar(entry, "id")!, scalar(entry, "type")!, url, scalar(entry, "base_url", false));
      if (item.type === "objects") {
        const data = target.archive?.get("update.xml")?.xml ?? target.xml;
        if (!data) throw new Error("Object package update.xml is missing");
        fillObjects(item, data, ids);
      } else if (!target.archive) throw new Error("File package target must be a ZIP archive");
      packages.push(item);
    }
  } else {
    const data = archive.get("update.xml")?.xml;
    if (!data) throw new Error("Package archive descriptor is missing");
    const item = part(scalar(child(data, "basic")!, "id")!, "objects", "update.xml");
    fillObjects(item, data, ids);
    packages.push(item);
  }
  return packages;
}

/** Inspect bounded ZIP bytes in memory. Entry paths are never used as filesystem destinations. */
export async function inspectPackageArchive(localPath: string): Promise<PackageArchiveInspection> {
  if (!isAbsolute(localPath)) throw new Error("Package path must be absolute");
  if (!(await lstat(localPath)).isFile()) throw new Error("Package must be a regular file");
  const file = await open(localPath, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  const chunks: Buffer[] = [];
  let size = 0;
  try {
    const stat = await file.stat();
    if (!stat.isFile()) throw new Error("Package must be a regular file");
    if (stat.size > MAX_ARCHIVE_BYTES) throw new Error("Package ZIP size exceeds 128 MiB limit");
    for await (const chunk of file.createReadStream({ autoClose: false })) {
      const data = chunk as Buffer;
      size += data.length;
      if (size > MAX_ARCHIVE_BYTES) throw new Error("Package ZIP size exceeds 128 MiB limit");
      chunks.push(data);
    }
  } finally {
    await file.close();
  }
  const budget: Budget = { totalEntries: 0, expandedBytes: 0 };
  const archive = await readArchive(Buffer.concat(chunks, size), 1, budget);
  return { packages: inspectContents(archive), ...budget };
}
