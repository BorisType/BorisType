import { crc32, deflateRawSync } from "node:zlib";
function unicodePathExtra(name, value) {
  const unicodeName = Buffer.from(value);
  const extra = Buffer.alloc(9 + unicodeName.length);
  extra.writeUInt16LE(0x7075, 0);
  extra.writeUInt16LE(5 + unicodeName.length, 2);
  extra.writeUInt8(1, 4);
  extra.writeUInt32LE(crc32(Buffer.from(name)), 5);
  unicodeName.copy(extra, 9);
  return extra;
}

// Actual ZIP headers, including deliberately inconsistent/unsafe metadata.
export function zip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name);
    const extra = entry.unicodeName ? unicodePathExtra(name, entry.unicodeName) : Buffer.alloc(0);
    const localExtra = entry.localExtra ?? extra;
    const centralExtra = entry.centralExtra ?? extra;
    const data = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data ?? "");
    const compressed = entry.deflate ? deflateRawSync(data) : data;
    const checksum = entry.crc ?? crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(entry.localFlags ?? entry.flags ?? 0, 6);
    local.writeUInt16LE(entry.deflate ? 8 : 0, 8);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(entry.declaredSize ?? data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(localExtra.length, 28);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50);
    central.writeUInt16LE(0x0314, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(entry.flags ?? 0, 8);
    central.writeUInt16LE(entry.deflate ? 8 : 0, 10);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(entry.declaredSize ?? data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(centralExtra.length, 30);
    central.writeUInt32LE(((entry.mode ?? 0o100600) << 16) >>> 0, 38);
    central.writeUInt32LE(offset, 42);
    locals.push(local, name, localExtra, compressed);
    centrals.push(central, name, centralExtra);
    offset += local.length + name.length + localExtra.length + compressed.length;
  }
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(
    centrals.reduce((sum, part) => sum + part.length, 0),
    12,
  );
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...centrals, end]);
}

export function objectPackage({ id = "9007199254740993", version = "2025.2.1333", type = "cost_center", padding } = {}) {
  return zip([
    {
      name: "desc.xml",
      data: "<download_packages><download_package><id>pkg-one</id><type>objects</type><url>objects.zip</url></download_package></download_packages>",
    },
    {
      name: "objects.zip",
      data: zip([
        {
          name: "update.xml",
          data: `<data><basic><id>pkg-one</id><server_version>${version}</server_version></basic><${type}s><${type}><id>${id}</id><name>fixture</name></${type}></${type}s></data>`,
        },
      ]),
    },
    ...(padding ? [{ name: "padding.bin", data: padding }] : []),
  ]);
}
