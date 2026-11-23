import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, truncate } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { crc32, deflateRawSync } from "node:zlib";
import { inspectPackageArchive } from "../build/hcm/packages/archive.js";

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
function zip(entries) {
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
const update = (
  extra = "",
  objects = "<cost_centers><cost_center><id>0x20000000000001</id><name>Exact &amp; intact</name></cost_center></cost_centers>",
) =>
  `<?xml version="1.0" encoding="utf-8"?><data><basic><id>pkg-one</id><server_version>2025.2.1333</server_version></basic>${objects}${extra}</data>`;
const part = (type = "objects", url = "objects.zip", extra = "", id = "pkg-one") =>
  `<download_package><id>${id}</id><type>${type}</type><url>${url}</url>${extra}</download_package>`;
const desc = (parts = part()) =>
  `<?xml version="1.0"?><download_packages SPXML-FORM="x-local://wtv/wtv_form_download_packages.xmd">${parts}</download_packages>`;
const inner = (xml = update(), more = []) => zip([{ name: "update.xml", data: xml }, ...more]);
const outer = (xml = desc(), nested = inner(), more = []) =>
  zip([{ name: "desc.xml", data: xml }, { name: "objects.zip", data: nested }, ...more]);
async function inspect(t, bytes) {
  const directory = await mkdtemp(join(tmpdir(), "bt-archive-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, "package.zip");
  await writeFile(path, bytes);
  return inspectPackageArchive(path);
}

test("desc.xml and nested update.xml preserve large IDs and expose actual package metadata", async (t) => {
  const xml = update(
    "<custom_templates><cost_center><fields><field><name>sample</name></field></fields></cost_center><request_type><items><item><id>0x20000000000004</id></item></items></request_type></custom_templates><access_roles><access_role><id>role</id></access_role></access_roles><lists><languages><language><id>ru</id></language></languages></lists><deleted_objects><object><id>0x20000000000002</id></object></deleted_objects>",
  );
  const nested = inner(xml);
  const result = await inspect(t, outer(desc(), nested));
  assert.deepEqual(result.packages, [
    {
      id: "pkg-one",
      type: "objects",
      url: "objects.zip",
      serverVersion: "2025.2.1333",
      objects: [{ id: "9007199254740993", type: "cost_center", name: "Exact & intact" }],
      hasCustomTemplates: true,
      customTemplateTypes: ["cost_center", "request_type"],
      hasAccessRoles: true,
      hasLists: true,
      deletedObjectIds: ["9007199254740994"],
    },
  ]);
  assert.equal(result.totalEntries, 3);
  assert.equal(result.expandedBytes, Buffer.byteLength(desc()) + nested.length + Buffer.byteLength(xml));
});

test("standalone object ZIP and direct XML descriptor targets are supported", async (t) => {
  const standalone = await inspect(t, inner());
  assert.equal(standalone.packages[0].id, "pkg-one");
  const direct = await inspect(
    t,
    zip([
      { name: "desc.xml", data: desc(part("objects", "folder/update.xml")) },
      { name: "folder/update.xml", data: update() },
    ]),
  );
  assert.equal(direct.packages[0].objects[0].id, "9007199254740993");
});

test("courses, web and custom_file packages retain destinations and do not invent objects", async (t) => {
  const parts = ["courses", "web", "custom_file"].map((type) =>
    part(type, `${type}.zip`, "<base_url>x-local://custom/example/</base_url>", type),
  );
  const result = await inspect(
    t,
    zip([
      { name: "desc.xml", data: desc(parts.join("")) },
      ...["courses", "web", "custom_file"].map((type) => ({ name: `${type}.zip`, data: zip([{ name: "content.txt", data: "body" }]) })),
    ]),
  );
  assert.deepEqual(
    result.packages.map(({ type, baseUrl, objects }) => ({ type, baseUrl, objects })),
    ["courses", "web", "custom_file"].map((type) => ({ type, baseUrl: "x-local://custom/example/", objects: [] })),
  );
});

for (const name of [
  "../escape",
  "/absolute",
  "C:/absolute",
  "dir\\escape",
  "%2e%2e/escape",
  "%252e%252e/escape",
  "dir/%2f../../escape",
  "a/../escape",
  "file:escape",
  "a\u0000b",
]) {
  test(`rejects unsafe archive path ${JSON.stringify(name)} at every ZIP level`, async (t) => {
    await assert.rejects(inspect(t, outer(desc(), inner(update(), [{ name, data: "bad" }]))));
    await assert.rejects(inspect(t, outer(desc(), inner(), [{ name, data: "bad" }])));
  });
}
for (const url of [
  "https://evil.test/archive.zip",
  "//evil.test/archive.zip",
  "../objects.zip",
  "%2e%2e/objects.zip",
  "objects.zip?x=1",
  "objects.zip#x",
  "objects\\zip",
]) {
  test(`rejects non-local descriptor target ${url}`, async (t) => {
    await assert.rejects(inspect(t, outer(desc(part("objects", url)))));
  });
}
for (const [label, bytes] of [
  ["duplicate entries", outer(desc(), inner(), [{ name: "desc.xml", data: desc() }])],
  ["duplicate nested entries", outer(desc(), inner(update(), [{ name: "update.xml", data: update() }]))],
  ["duplicate package IDs", outer(desc(part() + part()))],
  [
    "duplicate object IDs",
    outer(
      desc(),
      inner(
        update(
          "",
          "<cost_centers><cost_center><id>0x20000000000001</id></cost_center><cost_center><id>9007199254740993</id></cost_center></cost_centers>",
        ),
      ),
    ),
  ],
  [
    "duplicate ID across deletion and object",
    outer(desc(), inner(update("<deleted_objects><object><id>9007199254740993</id></object></deleted_objects>"))),
  ],
  ["encrypted entry", outer(desc(), inner(update(), [{ name: "secret", data: "x", flags: 1 }]))],
  ["local encrypted flag hidden from central directory", outer(desc(), inner(update(), [{ name: "secret", data: "x", localFlags: 1 }]))],
  ["symbolic link", outer(desc(), inner(update(), [{ name: "link", data: "../../escape", mode: 0o120777 }]))],
  ["CRC mismatch", outer(desc(), inner(update(), [{ name: "other", data: "wrong", crc: 0 }]))],
  ["unsupported package type", outer(desc(part("code_update")))],
  ["missing target", outer(desc(part("objects", "missing.zip")))],
  ["missing nested update", outer(desc(), zip([{ name: "nothing", data: "x" }]))],
  ["malformed XML", outer(desc(), inner("<data>"))],
  ["malformed ZIP", Buffer.from("not a ZIP")],
  ["missing descriptor", zip([{ name: "nothing", data: "x" }])],
  ["XML DTD", outer(desc(), inner('<!DOCTYPE data [<!ENTITY external SYSTEM "file:///etc/passwd">]>' + update()))],
  ["XML PI", outer(desc(), inner('<?native form="x-local://evil.xmd"?>' + update()))],
  ["unknown entity", outer(desc(), inner(update().replace("Exact &amp; intact", "&unknown;")))],
  ["descriptor form override", outer(desc().replace("wtv_form_download_packages.xmd", "evil.xmd"))],
  ["update form override", outer(desc(), inner(update().replace("<data>", '<data SPXML-FORM="x-local://evil.xmd">')))],
  ["nested form override", outer(desc(), inner(update().replace("<cost_center>", '<cost_center SPXML-FORM="x-local://evil.xmd">')))],
  ["inconsistent package ID", outer(desc().replace("pkg-one", "different"))],
  ["invalid object ID", outer(desc(), inner(update().replace("0x20000000000001", "9007199254740993.0")))],
  ["ZIP depth exceeded", outer(desc(), inner(update(), [{ name: "third.zip", data: zip([]) }]))],
]) {
  test(`rejects ${label}`, async (t) => assert.rejects(inspect(t, bytes)));
}

test("checks actual inflated data instead of trusting declared sizes", async (t) => {
  const dishonest = zip([{ name: "update.xml", data: update(), deflate: true, declaredSize: 1 }]);
  await assert.rejects(inspect(t, outer(desc(), dishonest)));
});

test("rejects XML beyond 32 MiB", async (t) => {
  const large = zip([{ name: "update.xml", data: `<data>${" ".repeat(32 * 1024 * 1024)}</data>`, deflate: true }]);
  await assert.rejects(inspect(t, outer(desc(), large)), /XML|limit|size/i);
});

test("shares expanded-byte and entry budgets across all nested ZIPs", async (t) => {
  const inflated = Buffer.alloc(16 * 1024 * 1024);
  const contents = Array.from({ length: 33 }, (_, i) => ({ name: `blob${i}`, data: inflated, deflate: true }));
  await assert.rejects(inspect(t, outer(desc(), inner(update(), contents))), /limit|size|expand/i);
  const entries = Array.from({ length: 10000 }, (_, i) => ({ name: `empty${i}`, data: "" }));
  await assert.rejects(inspect(t, outer(desc(), inner(update(), entries))), /entr|limit/i);
});

test("rejects oversized input and relative paths before archive processing", async (t) => {
  await assert.rejects(inspectPackageArchive("relative.zip"), /absolute/i);
  const directory = await mkdtemp(join(tmpdir(), "bt-archive-large-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, "large.zip");
  await writeFile(path, "");
  await truncate(path, 128 * 1024 * 1024 + 1);
  await assert.rejects(inspectPackageArchive(path), /size|large|limit/i);
});

test("rejects file/directory overlaps under case-insensitive extraction", async (t) => {
  await assert.rejects(
    inspect(
      t,
      outer(desc(), inner(), [
        { name: "Folder", data: "file" },
        { name: "folder/child", data: "child" },
      ]),
    ),
  );
});

test("rejects descriptor fields that could override native preview state", async (t) => {
  await assert.rejects(inspect(t, outer(desc(part("objects", "objects.zip", "<temp_package_url>x-local://foreign/</temp_package_url>")))));
});

test("rejects object ID collisions between distinct nested packages", async (t) => {
  const second = inner(update().replace("pkg-one", "pkg-two"));
  await assert.rejects(
    inspect(t, outer(desc(part() + part("objects", "second.zip", "", "pkg-two")), inner(), [{ name: "second.zip", data: second }])),
  );
});

test("rejects Unicode filename overrides hiding duplicate legacy extraction paths", async (t) => {
  await assert.rejects(
    inspect(
      t,
      outer(desc(), inner(), [
        { name: "objects.zip", unicodeName: "other.zip", data: inner(update().replace("0x20000000000001", "0x20000000000002")) },
      ]),
    ),
  );
});

for (const [label, localExtra] of [
  ["traversal", unicodePathExtra("safe.txt", "../escape.txt")],
  ["safe alias colliding with another entry", unicodePathExtra("safe.txt", "collision.txt")],
  ["truncated extra-field header", Buffer.from([0x75])],
  ["extra-field length overflow", Buffer.from([0x75, 0x70, 0x05, 0x00, 0x01])],
  [
    "second Unicode field hiding traversal",
    Buffer.concat([unicodePathExtra("safe.txt", "safe.txt"), unicodePathExtra("safe.txt", "../escape.txt")]),
  ],
]) {
  for (const level of ["outer", "nested"]) {
    test(`rejects local ZIP ${label} at ${level} level`, async (t) => {
      const entries = [
        { name: "safe.txt", data: "data", localExtra },
        { name: "collision.txt", data: "other" },
      ];
      const bytes = level === "outer" ? outer(desc(), inner(), entries) : outer(desc(), inner(update(), entries));
      await assert.rejects(inspect(t, bytes));
    });
  }
}

test("allows local Unicode metadata that agrees with the central filename", async (t) => {
  const bytes = outer(desc(), inner(update(), [{ name: "safe.txt", data: "data", localExtra: unicodePathExtra("safe.txt", "safe.txt") }]));
  const result = await inspect(t, bytes);
  assert.equal(result.packages[0].objects[0].id, "9007199254740993");
  assert.equal(result.totalEntries, 4);
});
