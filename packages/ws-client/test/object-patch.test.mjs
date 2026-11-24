import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { z } from "zod";
import { WshcmApi, wshcmSchemas } from "../build/index.js";
import * as xmlTools from "../build/hcm/object-xml.js";

const id = "7349585223810462098";
const formUrl = "x-local://wtv/probe.xmd";
const definitions = [
  ["id", "integer"],
  ["keep", "string"],
  ["name", "string"],
  ["stamp", "date"],
  ["n", "integer"],
  ["flag", "bool"],
  ["r", "real"],
  ["opaque", "unrecognized"],
  [
    "row",
    "",
    [
      ["key", "string"],
      ["value", "string"],
      ["secret", "string"],
    ],
    true,
    "key",
  ],
  ["tag", "string", [], true],
  [
    "nested",
    "",
    [
      ["stamp", "date"],
      ["part", "", [["name", "string"]], true],
    ],
  ],
];
class Form {
  constructor([name, type, children = [], multiple = false, key = ""]) {
    Object.assign(this, {
      Name: name,
      Type: type,
      IsMultiple: multiple,
      PrimaryKeyName: key,
      SubType: "",
      DefaultValue: "",
      children: children.map((f) => new Form(f)),
    });
  }
  OptChild(name) {
    return this.children.find((c) => c.Name === name);
  }
  Child(name) {
    return typeof name === "number" ? this.children[name] : this.OptChild(name);
  }
  get Xml() {
    return "<form/>";
  }
}
// Platform boundary only. XM children have typed scalar values and snapshots of independently opened docs.
class Elem {
  constructor(form, parent, data) {
    this.FormElem = form;
    this.Name = form.Name;
    this.parent = parent;
    this.Clear();
    if (form.Type) {
      this.Value = data ?? null;
      return;
    }
    for (const [name, value] of Object.entries(data ?? {})) {
      const f = form.OptChild(name);
      if (f.IsMultiple) for (const item of value) this.AddChildElem(new Elem(f, this, item));
      else this.children[this.children.indexOf(this.Child(name))] = new Elem(f, this, value);
    }
  }
  Clear() {
    this.Value = null;
    this.children = this.FormElem.children.filter((f) => !f.IsMultiple).map((f) => new Elem(f, this));
  }
  Child(name) {
    const found = typeof name === "number" ? this.children[name] : this.children.find((c) => c.Name === name);
    if (!found) throw Error("no child " + name);
    return found;
  }
  AddChildElem(elem) {
    elem.parent = this;
    this.children.push(elem);
  }
  LoadData(xml) {
    assert.equal(xml, this.Xml);
  }
  AssignElem(other) {
    const fresh = new Elem(this.FormElem, this.parent, other.snapshot());
    this.Value = fresh.Value;
    this.children = fresh.children;
    for (const c of this.children) c.parent = this;
  }
  Delete() {
    this.parent.children.splice(this.parent.children.indexOf(this), 1);
  }
  get Xml() {
    const value = this.Value;
    const body = this.FormElem.Type
      ? value instanceof Date
        ? value.toISOString().replace(".000", "")
        : value === null
          ? ""
          : String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;")
      : this.children.map((c) => c.Xml).join("");
    return body ? "<" + this.Name + ">" + body + "</" + this.Name + ">" : "<" + this.Name + "/>";
  }
  snapshot() {
    if (this.FormElem.Type) return this.Value;
    const out = {};
    for (const child of this.children) {
      if (child.FormElem.IsMultiple) (out[child.Name] ??= []).push(child.snapshot());
      else out[child.Name] = child.snapshot();
    }
    return out;
  }
}
function platformFixture(extra = {}) {
  const form = new Form(["probe", "", definitions]);
  let data = {
    id: BigInt(id),
    keep: "sentinel",
    stamp: new Date("2025-02-03T04:05:06Z"),
    row: [
      { key: "a", value: "old", secret: "retain" },
      { key: "b", value: "B" },
    ],
    tag: ["one", "two"],
    ...extra,
  };
  const platform = { saveCount: 0, dispatches: 0, opens: 0 };
  function doc(initial) {
    const TopElem = new Elem(form, null, initial);
    return {
      TopElem,
      DocID: BigInt(id),
      FormUrl: formUrl,
      Save() {
        platform.saveCount++;
        if (platform.saveError) throw Error("Save failed");
        data = TopElem.snapshot();
      },
    };
  }
  Object.defineProperty(form, "Xml", { get: () => platform.schemaXml ?? "<form/>" });
  const api = new WshcmApi({
    async eval(code) {
      platform.dispatches++;
      const context = {
        OpenDoc() {
          platform.opens++;
          platform.beforeOpen?.(platform.opens, data);
          if (platform.missing || platform.opens === platform.failOpen) throw Error("unavailable");
          return doc(data);
        },
        FetchForm: () => ({ Url: formUrl, TopElem: form }),
        OpenNewDoc: () => doc({}),
        UrlFromDocID: String,
        Int: BigInt,
        StrInt: (x) => BigInt.asUintN(64, BigInt(x)).toString(),
        StrSignedInt: String,
        Trim: (s) => s.trim(),
        Real: Number,
        OptReal: (x) => Number(x),
        OptDate: (x) => new Date(x + "Z"),
        StrXmlDate: (x) => x.toISOString().replace(".000Z", "+00:00"),
        StrCharCount: (s) => s.length,
        StrLen: (s) => Buffer.byteLength(s),
        StrOptSubStrPos: (s, sub) => s.indexOf(sub),
        StrLeftCharRange: (s, n) => s.slice(0, n),
        ArrayCount: (a) => a.children?.length ?? a.length,
        CreateElemByFormElem: (f) => new Elem(f),
        ParseJson: JSON.parse,
        EncodeJson: JSON.stringify,
        DataType: (x) =>
          x === null ? "null" : x instanceof Date ? "date" : typeof x === "bigint" ? "integer" : typeof x === "number" ? "real" : typeof x,
      };
      const wire = runInNewContext("(function(){" + code + "})()", context);
      if (platform.loseAck) throw Error("connection lost");
      if (platform.response) return JSON.stringify(JSON.stringify(platform.response));
      if (platform.badAck) {
        const ack = JSON.parse(JSON.parse(wire));
        delete ack.xml;
        return JSON.stringify(JSON.stringify(ack));
      }
      return wire;
    },
  });
  const patch = async (body, opts = {}) =>
    api.objects.patch({ id, readToken: (await api.objects.get({ id })).readToken, xml: "<probe>" + body + "</probe>", ...opts });
  return { api, platform, patch };
}
test("same native date value skips Save despite distinct date instances", async () => {
  const { api, platform } = platformFixture();
  const before = await api.objects.get({ id });
  const result = await api.objects.patch({ id, readToken: before.readToken, xml: "<probe><stamp>2025-02-03T04:05:06Z</stamp></probe>" });
  assert.equal(result.changed, false);
  assert.equal(result.writeStatus, "not_attempted");
  assert.equal(platform.saveCount, 0);
  assert.match(result.xml, /<keep>sentinel<\/keep>/);
});
test("strict JSON schema, parent occurrence and ordinal, full save rejects controls", () => {
  const schema = wshcmSchemas.objects.patch;
  assert.equal(z.toJSONSchema(schema).additionalProperties, false);
  const xml = '<probe><row bt-mode="replace-array"><key>a</key></row><tag>x</tag><row><key>b</key></row></probe>';
  const nodes = xmlTools.inspectObjectPatchXml(xml, { formUrl, id }).nodes;
  assert.deepEqual(
    nodes.map((n) => [n.name, n.parentIndex, n.ordinal, n.mode]),
    [
      ["probe", -1, 0, "auto"],
      ["row", 0, 0, "replace-array"],
      ["key", 1, 0, "auto"],
      ["tag", 0, 0, "auto"],
      ["row", 0, 1, "auto"],
      ["key", 4, 0, "auto"],
    ],
  );
  assert.throws(() => xmlTools.inspectObjectXml(xml, { formUrl, id }), /attribute/);
});
test("keyed upsert, replace, remove and nested unkeyed arrays affect only selected fields", async () => {
  const { patch, platform } = platformFixture();
  for (const [input, expected, absent] of [
    [
      "<row><key>a</key><value>new</value></row><row><key>c</key></row>",
      /<key>a<\/key><value>new<\/value><secret>retain<\/secret>.*<key>b<\/key>.*<key>c<\/key>/,
    ],
    ['<row bt-mode="replace"><key>a</key></row>', /<key>a<\/key><value\/><secret\/>.*<key>b<\/key>/, /retain/],
    ['<row bt-mode="remove"><key>b</key></row>', /<key>c<\/key>/, /<key>b<\/key>/],
    [
      '<row bt-mode="replace-array"><key>z</key></row><tag>only</tag><row><key>x</key></row>',
      /<key>z<\/key>.*<key>x<\/key>/,
      /<key>c<\/key>/,
    ],
    ['<row bt-mode="replace-array"><key>a</key></row>', /<tag>only<\/tag>/, /<key>z<\/key>/],
    ["<nested><part><name>P</name></part><part><name>Q</name></part></nested>", /<name>P<\/name>.*<name>Q<\/name>/],
    ['<nested bt-mode="clear"/>', /<tag>only<\/tag>/, /<name>P<\/name>/],
    ['<row bt-mode="clear"/>', /<tag>only<\/tag>/, /<row>/],
  ]) {
    const result = await patch(input);
    assert.equal(result.changed, true);
    assert.match(result.xml, expected);
    if (absent) assert.doesNotMatch(result.xml, absent);
    assert.match(result.xml, /<keep>sentinel<\/keep>/);
    const count = platform.saveCount;
    assert.equal((await patch(input)).changed, false);
    assert.equal(platform.saveCount, count);
  }
});
test("scalar assignment preserves text, exact integers and XML clock dates", async () => {
  const { patch } = platformFixture();
  for (const [body, expected] of [
    ["<name>  А\r\n<![CDATA[<&]]>  </name>", "<name>  А\n&lt;&amp;  </name>"],
    ["<n>0xffffffffffffffff</n>", "<n>18446744073709551615</n>"],
    ["<n>-2</n>", "<n>-2</n>"],
    ["<flag>false</flag>", "<flag>false</flag>"],
    ["<r>-1.5e2</r>", "<r>-150</r>"],
    ["<nested><stamp>2025-03-01T00:30:00+00:00</stamp></nested>", "2025-03-01T00:30:00Z"],
  ]) {
    assert.ok((await patch(body)).xml.includes(expected));
    assert.equal((await patch(body)).changed, false);
  }
});
test("negative inputs never save and consume tokens", async () => {
  const { api, platform, patch } = platformFixture();
  for (const body of [
    "<row/>",
    "<row><key>a</key></row><row><key>a</key></row>",
    '<row bt-mode="remove"><key>a</key><secret/></row>',
    '<row bt-mode="replace-array"><key>a</key></row><row bt-mode="merge"><key>b</key></row>',
    '<tag>a</tag><tag bt-mode="replace-array"/>',
    '<tag bt-mode="merge"/>',
    '<tag bt-mode="clear"/><tag/>',
    '<name bt-mode="remove"/>',
    '<name bt-mode="clear">x</name>',
    '<name bt-mode="replace-array"/>',
    '<name default="true"/>',
    '<name bt-mode="bad"/>',
    '<id bt-mode="merge">' + id + "</id>",
    "<id>2</id>",
    "<n>x</n>",
    "<r>1e309</r>",
    "<flag>maybe</flag>",
    "<stamp>2025-02-29</stamp>",
    "<stamp>2025-02-03T04:05:06.1Z</stamp>",
    "<name/><name/>",
    "<unknown/>",
    "<nested>mixed<part/></nested>",
  ]) {
    const args = { id, readToken: (await api.objects.get({ id })).readToken, xml: "<probe>" + body + "</probe>" };
    await assert.rejects(api.objects.patch(args), (e) => e.details.writeStatus === "not_attempted", body);
    await assert.rejects(api.objects.patch(args), /ReadRequired/);
  }
  assert.equal(platform.saveCount, 0);
  const dup = platformFixture({ row: [{ key: "a" }, { key: "a" }] });
  await assert.rejects(dup.patch("<row><key>a</key></row>"));
  assert.equal(dup.platform.saveCount, 0);
  assert.equal((await patch("<nested/>")).changed, false);
});
test("no-op and preview consume grants, return candidate, preserve persistent object", async () => {
  const { api, platform } = platformFixture();
  for (const [body, dryRun, changed] of [
    ["<name>preview</name>", true, true],
    ["", false, false],
  ]) {
    const before = await api.objects.get({ id });
    const args = { id, readToken: before.readToken, xml: "<probe>" + body + "</probe>", dryRun };
    const result = await api.objects.patch(args);
    assert.equal(result.dryRun, dryRun);
    assert.equal(result.changed, changed);
    assert.equal(result.writeStatus, "not_attempted");
    if (dryRun) assert.match(result.xml, /preview/);
    assert.equal(platform.saveCount, 0);
    await assert.rejects(api.objects.patch(args), /ReadRequired/);
    assert.equal((await api.objects.get({ id })).xml, before.xml);
  }
});
test("reopens just before Save and success of no-op/preview", async () => {
  for (const [body, options] of [
    ["", {}],
    ["<name>x</name>", {}],
    ["<name>x</name>", { dryRun: true }],
  ]) {
    const { platform, patch } = platformFixture();
    platform.beforeOpen = (n, data) => {
      if (n === 3) data.keep = "concurrent";
    };
    await assert.rejects(patch(body, options), (e) => e.details.error.code === "Conflict" && e.details.writeStatus === "not_attempted");
    assert.equal(platform.saveCount, 0);
  }
});
test("one dispatch per patch, uncertainty and saved acknowledgement survive failures", async () => {
  for (const [fault, phase, status, saves] of [
    ["missing", "read", "not_attempted", 0],
    ["saveError", "save", "unknown", 1],
    ["failOpen", "readback", "saved", 1],
    ["loseAck", "transport", "unknown", 1],
    ["badAck", "readback", "saved", 1],
  ]) {
    const { api, platform } = platformFixture();
    const { readToken } = await api.objects.get({ id });
    platform[fault] = fault === "failOpen" ? 4 : true;
    await assert.rejects(
      api.objects.patch({ id, readToken, xml: "<probe><name>save</name></probe>" }),
      (e) => e.details.id === id && e.details.phase === phase && e.details.writeStatus === status,
    );
    assert.equal(platform.saveCount, saves);
    assert.equal(platform.dispatches, 2);
  }
});

test("oversized document, metadata and malformed XML consume a grant before dispatch", async () => {
  const { api, platform } = platformFixture();
  for (const [xml, pattern] of [
    ["<probe>" + "中".repeat(90000) + "</probe>", /InvalidInput/],
    ["<probe>" + "<x>".repeat(64) + "a" + "</x>".repeat(64) + "</probe>", /depth/],
    ["<probe>" + "<tag/>".repeat(8192) + "</probe>", /element limit/],
    ["<probe>" + "<long_branch>".repeat(40) + "<tag/>".repeat(4000) + "</long_branch>".repeat(40) + "</probe>", /2 MiB/],
    ["<probe", /XML/],
  ]) {
    const { readToken } = await api.objects.get({ id });
    const count = platform.dispatches;
    await assert.rejects(api.objects.patch({ id, readToken, xml }), pattern);
    await assert.rejects(api.objects.patch({ id, readToken, xml: "<probe/>" }), /ReadRequired/);
    assert.equal(platform.dispatches, count);
  }
});
test("input schema failures with an identifiable grant and full replace share the grant", async () => {
  const { api, platform } = platformFixture();
  const { readToken } = await api.objects.get({ id });
  await assert.rejects(api.objects.patch({ id, readToken, xml: "<probe/>", extra: true }), (e) => e.details.phase === "input");
  await assert.rejects(api.objects.save({ id, readToken, xml: "<probe/>", mode: "replace" }), /ReadRequired/);
  const next = (await api.objects.get({ id })).readToken;
  const results = await Promise.allSettled([1, 2].map(() => api.objects.patch({ id, readToken: next, xml: "<probe/>" })));
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(platform.saveCount, 0);
});
test("scalar controls are validated even when their parent is being removed", async () => {
  for (const mode of ["remove", "replace-array"]) {
    const { patch, platform } = platformFixture();
    await assert.rejects(
      patch('<row bt-mode="remove"><key bt-mode="' + mode + '">a</key></row>'),
      (e) => e.details.writeStatus === "not_attempted",
    );
    assert.equal(platform.saveCount, 0);
  }
});
test("schema changes on independent recheck invalidate a candidate", async () => {
  const { platform, patch } = platformFixture();
  platform.beforeOpen = (n) => {
    if (n === 3) platform.schemaXml = "<new-form/>";
  };
  await assert.rejects(patch("<name>x</name>"), (e) => e.details.error.code === "Conflict");
  assert.equal(platform.saveCount, 0);
});
test("patch inspection bounds repeated ancestor names before serializing the plan", () => {
  const ancestor = "n".repeat(5000);
  assert.throws(
    () =>
      xmlTools.inspectObjectPatchXml("<probe><" + ancestor + ">" + "<tag/>".repeat(500) + "</" + ancestor + "></probe>", { formUrl, id }),
    /2 MiB/,
  );
});
test("native XML date clock accepts zero offset, rejects nonzero offsets without saving", async () => {
  const { patch, platform } = platformFixture();
  for (const suffix of ["+01:00", "-04:30"]) {
    await assert.rejects(patch("<stamp>2025-02-03T04:05:06" + suffix + "</stamp>"), /date|offset/i);
  }
  for (const suffix of ["Z", "+00:00", "-00:00", ""])
    assert.equal((await patch("<stamp>2025-02-03T04:05:06" + suffix + "</stamp>")).changed, false);
  assert.equal(platform.saveCount, 0);
});

test("whole-group replacement can repair old duplicate keys and keeps other groups", async () => {
  const { patch, platform } = platformFixture({
    row: [
      { key: "dup", secret: "first" },
      { key: "dup", secret: "second" },
    ],
  });
  for (const malformed of ['<row bt-mode="replace-array"/>', '<row bt-mode="replace-array"><key>x</key></row><row><key>x</key></row>']) {
    await assert.rejects(patch(malformed), /explicitly non-empty|Duplicate input/);
  }
  const body = '<row bt-mode="replace-array"><key>x</key></row><row><key>y</key></row>';
  const saved = await patch(body);
  assert.equal(saved.changed, true);
  assert.equal(saved.writeStatus, "saved");
  assert.match(saved.xml, /<key>x<\/key>.*<key>y<\/key>/);
  assert.match(saved.xml, /<tag>one<\/tag><tag>two<\/tag>/);
  assert.match(saved.xml, /<keep>sentinel<\/keep>/);
  assert.doesNotMatch(saved.xml, /dup|first|second/);
  const repeated = await patch(body);
  assert.equal(repeated.changed, false);
  assert.equal(repeated.xml, saved.xml);
  assert.equal(platform.saveCount, 1);
});
test("early calendar years accept the native unpadded readback clock and reject other abbreviated forms", async () => {
  const { patch, platform } = platformFixture();
  for (const [padded, rendered] of [
    ["0001", "1"],
    ["0099", "99"],
    ["0999", "999"],
    ["1000", "1000"],
    ["0400", "400"],
  ]) {
    const calendar = padded === "0400" ? "02-29" : "01-02";
    const canonical = padded + "-" + calendar + "T12:34:56Z";
    const native = rendered + "-" + calendar + "T12:34:56+00:00";
    assert.equal((await patch("<stamp>" + canonical + "</stamp>")).changed, true);
    const repeated = await patch("<stamp>" + native + "</stamp>");
    assert.equal(repeated.changed, false);
    assert.equal(repeated.writeStatus, "not_attempted");
  }
  for (const value of ["0-01-02T12:34:56+00:00", "001-01-02T12:34:56+00:00", "1-01-02", "99-01-02T12:34:56Z", "999-02-29T12:34:56+00:00"])
    await assert.rejects(patch("<stamp>" + value + "</stamp>"), /date/);
  assert.equal(platform.saveCount, 5);
});

test("patch outcomes require acknowledgements for the requested ID", async () => {
  for (const responseId of ["222", "", undefined]) {
    for (const dryRun of [false, true]) {
      const success = { ok: true, formUrl, root: "probe", xml: "<probe/>", dryRun, changed: false, writeStatus: "not_attempted" };
      const failure = { ok: false, phase: "readback", writeStatus: "saved", error: { code: "PlatformError", message: "unrelated" } };
      for (const response of [success, failure]) {
        const { api, platform } = platformFixture();
        const { readToken } = await api.objects.get({ id });
        platform.response = { ...response, id: responseId };
        await assert.rejects(api.objects.patch({ id, readToken, xml: "<probe/>", dryRun }), (error) => {
          assert.equal(error.details.id, id);
          assert.equal(error.details.writeStatus, dryRun ? "not_attempted" : "unknown");
          assert.equal(error.details.phase, "transport");
          assert.equal(error.details.error.code, "TransportError");
          return true;
        });
        assert.equal(platform.dispatches, 2);
      }
    }
  }
});

test("a dry run retains its local outcome on a contradictory acknowledgement", async () => {
  for (const response of [
    { ok: true, id, formUrl, root: "probe", xml: "<probe/>", dryRun: true, changed: true, writeStatus: "saved" },
    { ok: false, id, phase: "readback", writeStatus: "saved", error: { code: "PlatformError", message: "invalid ack" } },
  ]) {
    const { api, platform } = platformFixture();
    const { readToken } = await api.objects.get({ id });
    platform.response = response;
    await assert.rejects(
      api.objects.patch({ id, readToken, xml: "<probe/>", dryRun: true }),
      (error) => error.details.id === id && error.details.phase === "transport" && error.details.writeStatus === "not_attempted",
    );
  }
});

test("only a requested duplicate target key is ambiguous", async () => {
  const { patch, platform } = platformFixture({
    row: [
      { key: "a", value: "first" },
      { key: "a", value: "second" },
      { key: "b", value: "last" },
    ],
  });
  const saved = await patch("<row><key>b</key><value>updated</value></row>");
  assert.equal(saved.writeStatus, "saved");
  assert.match(saved.xml, /<key>a<\/key><value>first<\/value>.*<key>a<\/key><value>second<\/value>.*<key>b<\/key><value>updated<\/value>/);
  const absent = await patch('<row bt-mode="remove"><key>c</key></row>');
  assert.equal(absent.writeStatus, "not_attempted");
  assert.equal(absent.changed, false);
  assert.equal(absent.xml, saved.xml);
  for (const mode of ["merge", "replace", "remove"]) {
    await assert.rejects(patch('<row bt-mode="' + mode + '"><key>a</key></row>'), /Ambiguous target array primary key/);
  }
  assert.equal(platform.saveCount, 1);
});

test("clear of an unknown scalar type fails before Save", async () => {
  const { patch, platform } = platformFixture({ opaque: "keep" });
  await assert.rejects(patch('<opaque bt-mode="clear"/>'), /Unsupported scalar XML type/);
  assert.equal(platform.saveCount, 0);
});

test("scalar classification trims only XML whitespace and preserves internal runs", () => {
  const space = " \t".repeat(1024);
  const body =
    "<s>" +
    space +
    "a" +
    space +
    "b" +
    space +
    "</s>" +
    "<n> &#13;\t+00016\n</n><r>\t.5&#13;</r><d> 2024-02-29\t</d>" +
    "<n>1\u00a0</n><r>\u00851</r><d>2024-02-29\uFEFF</d><blank> &#13;\n\t</blank>";
  const xml = "<probe>" + body + "</probe>";
  const [, s, n, r, d, badN, badR, badD, blank] = xmlTools.inspectObjectPatchXml(xml, { formUrl, id }).nodes;
  assert.equal(s.text, space + "a" + space + "b" + space);
  assert.deepEqual([s.hasText, s.integerValid, s.realValid, s.date], [true, false, false, ""]);
  assert.deepEqual([n.integer, r.realValid, d.date], ["16", true, "2024-02-29T00:00:00"]);
  assert.deepEqual([badN.integerValid, badR.realValid, badD.date, blank.hasText], [false, false, "", false]);
  assert.deepEqual(
    xmlTools.inspectObjectXml(xml, { formUrl, id }).nodes.map((node) => node.integerValid),
    [true, false, true, false, false, false, false, false, true],
  );
});

test("startup defaults distinguish existing and newly inserted keyed rows and reject destructive array operations", () => {
  const nodesFor = (body) => {
    const nodes = xmlTools.inspectObjectPatchXml("<probe>" + body + "</probe>", { formUrl, id }).nodes;
    for (const node of nodes) if (node.name === "value" || node.name === "name") node.mode = "default";
    return nodes;
  };
  const context = { ArrayCount: (v) => v.children?.length ?? v.length, CreateElemByFormElem: (f) => new Elem(f) };
  runInNewContext(readFileSync(new URL("../resources/object-patch.bs", import.meta.url), "utf8"), context);
  const form = new Form(["probe", "", definitions]);
  const initial = {
    row: [
      { key: "a", value: "", secret: "keep" },
      { key: "other", value: "untouched" },
    ],
  };
  const target = new Elem(form, null, initial);
  function apply(body) {
    const nodes = nodesFor(body);
    const source = new Elem(form);
    context.BtPatchLoadSource(source, nodes);
    context.BtPatchDocument(target, source, nodes, false, false);
    context.BtPatchDocument(target, source, nodes, false, true);
  }
  const patch = "<row><key>a</key><value>proxy</value><secret>new</secret></row><row><key>b</key><value>initial</value></row>";
  apply(patch);
  assert.deepEqual(
    target.snapshot().row.map(({ key, value, secret }) => [key, value, secret]),
    [
      ["a", "", "new"],
      ["other", "untouched", null],
      ["b", "initial", null],
    ],
  );
  apply(patch);
  for (const body of [
    '<nested bt-mode="replace"><part><name>X</name></part></nested>',
    "<nested><part><name>X</name></part></nested>",
    '<row bt-mode="replace"><key>a</key><value>X</value></row>',
    '<row bt-mode="replace-array"><key>other</key></row><row><key>a</key><value>X</value></row>',
  ])
    assert.throws(() => apply(body), /default.*replac/i);
});
