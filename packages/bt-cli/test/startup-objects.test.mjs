import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { basename, dirname } from "node:path";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { readStartupXml } from "./fixtures/startup-xml-reader.mjs";

const id = "9007199254740993";
const formUrl = "x-local://wtv/wtv_cost_center.xmd";
const xml = "<cost_center><name>Изменён</name></cost_center>";
const rootUrl = "x-local://wt/deploy/objects";

function platform() {
  const records = new Map();
  const files = new Map();
  const logs = [];
  const saves = [];
  const controls = {};
  const fields = Object.fromEntries(
    ["id", "name", "keep"].map((name) => [
      name,
      {
        Name: name,
        Type: name === "id" ? "integer" : "string",
        IsMultiple: false,
        SubType: "",
        DefaultValue: "",
      },
    ]),
  );
  const form = { Name: "cost_center", Type: "", Xml: "<schema/>", Child: (name) => fields[name], OptChild: (name) => fields[name] };
  function top(values = {}) {
    const valuesByName = { ...values };
    return {
      FormElem: form,
      Name: form.Name,
      values: valuesByName,
      get Xml() {
        return JSON.stringify(valuesByName);
      },
      Clear() {
        for (const key of Object.keys(valuesByName)) delete valuesByName[key];
      },
      Child(name) {
        assert.ok(fields[name]);
        return {
          FormElem: fields[name],
          get Value() {
            return valuesByName[name];
          },
          set Value(value) {
            valuesByName[name] = value;
          },
          get Xml() {
            return String(valuesByName[name]);
          },
          LoadData() {},
        };
      },
    };
  }
  function document(record) {
    const target = top(record.values);
    return {
      TopElem: target,
      DocID: record.id,
      FormUrl: record.url ?? formUrl,
      BindToDb(db, boundId) {
        assert.equal(db, "wt_data");
        this.DocID = String(boundId);
        this.TopElem.Child("id").Value = String(boundId);
      },
      Save() {
        if (controls.saveError) throw Error("save failed");
        saves.push(this.DocID);
        records.set(this.DocID, { id: this.DocID, url: this.FormUrl, values: { ...target.values } });
        controls.afterSave?.(records.get(this.DocID));
      },
    };
  }
  const context = {
    BtReadStartupXml: readStartupXml,
    UrlFromDocID: (n) => String(BigInt.asUintN(63, n)),
    DocIDFromUrl: BigInt,
    UrlExists: (url) => records.has(url),
    OpenDoc(url) {
      controls.beforeOpen?.(url);
      if (controls.openError) throw Error("cannot read");
      if (!records.has(url)) throw "unibridge error: spxml_err:#2 Object not found...\r\noperation: `LoadObjectUrl: " + url + "`";
      return document(records.get(url));
    },
    OpenNewDoc: (url) => document({ url, values: { keep: "native default" } }),
    FetchForm(url) {
      controls.beforeForm?.(url);
      return { Url: url, TopElem: form, IsCatalog: false };
    },
    common: {
      exchange_object_types: { GetOptChildByKey: (type) => (type === "cost_center" ? { form_url: { Value: formUrl } } : undefined) },
    },
    DefaultDb: "wt_data",
    tools: { get_object_form_url: () => formUrl },
    CreateElemByFormElem: () => top(),
    StrContains: (s, part) => s.includes(part),
    StrBegins: (s, part) => s.startsWith(part),
    StrCharRangePos: (s, a, b) => s.slice(a, b),
    StrInt: String,
    Int: BigInt,
    Trim: (s) => s.trim(),
    StrLeftCharRange: (s, n) => s.slice(0, n),
    StrEnds: (s, suffix) => s.endsWith(suffix),
    StrLen: (s) => Buffer.byteLength(s),
    StrCharCount: (s) => s.length,
    DataType: (v) => typeof v,
    ArrayCount: (a) => (a === form ? 3 : (a.length ?? 0)),
    ArraySort: (entries, key) =>
      [...entries].sort((a, b) => {
        const left = key === "This" ? a : a[key.slice(5)];
        const right = key === "This" ? b : b[key.slice(5)];
        return left < right ? -1 : left > right ? 1 : 0;
      }),
    UrlToFilePath: (url) => url.replace("x-local://", "/"),
    FileName: basename,
    FilePathExists: (name) => files.has(name),
    IsDirectory: (path) => files.get(path) === null,
    ReadDirectoryByPath: (path) => [...files.keys()].filter((item) => dirname(item) === path),
    LoadFileData(path) {
      if (controls.maxReadSize && Buffer.byteLength(files.get(path)) > controls.maxReadSize) throw Error("unbounded file read");
      return files.get(path);
    },
    LoadFileDataRange: (path, start, end) => Buffer.from(files.get(path)).subarray(start, end).toString(),
    alert: (line) => logs.push(line),
  };
  for (const path of ["../../ws-client/resources/object-patch.bs", "../resources/startup-objects.bs"]) {
    runInNewContext(readFileSync(new URL(path, import.meta.url), "utf8"), context);
  }
  function putFile(path, data) {
    files.set(path, data);
    let parent = dirname(path);
    while (parent !== "/") {
      files.set(parent, null);
      parent = dirname(parent);
    }
  }
  return { ...context, records, putFile, controls, saves, logs };
}

test("fixed ID preview, create with form defaults, partial update, and a second boot without Save", () => {
  const p = platform();
  const apply = (input, preview) => p.BtApplyStartupObject(input, "cost_center", id, preview);
  assert.equal(apply(xml, true).status, "would_create");
  assert.equal(p.records.size, 0);
  assert.equal(apply(xml, false).status, "created");
  assert.deepEqual(p.records.get(id).values, { keep: "native default", id, name: "Изменён" });
  p.records.get(id).values.keep = "admin";
  const update = xml.replace("Изменён", "новый");
  assert.equal(apply(update, true).status, "would_update");
  assert.equal(p.records.get(id).values.name, "Изменён");
  assert.equal(apply(update, false).status, "updated");
  assert.equal(p.records.get(id).values.keep, "admin");
  assert.equal(apply(update, false).status, "unchanged");
  assert.deepEqual(p.saves, [id, id]);
});

test("collision, unreadable existing object and optimistic conflict all prevent Save", () => {
  const p = platform();
  const record = { id, url: "x-local://wtv/other.xmd", values: { id, name: "first" } };
  p.records.set(id, record);
  const apply = () => p.BtApplyStartupObject(xml, "cost_center", id, false);
  assert.match(apply().error, /form/i);
  record.url = formUrl;
  p.controls.openError = true;
  assert.match(apply().error, /cannot read/i);
  p.controls.openError = false;
  let opens = 0;
  p.controls.beforeOpen = () => {
    if (++opens === 2) record.values.name = "concurrent";
  };
  const conflict = apply();
  assert.equal(conflict.ok, false);
  assert.match(conflict.error, /changed|conflict/i);
  assert.equal(conflict.writeStatus, "not_attempted");
  assert.deepEqual(p.saves, []);
});

test("Save failure distinguishes an unknown write from readback failure after Save", () => {
  const p = platform();
  p.controls.saveError = true;
  const result = () => p.BtApplyStartupObject(xml, "cost_center", id, false);
  assert.equal(result().writeStatus, "unknown");
  p.controls.saveError = false;
  p.controls.beforeOpen = () => {
    if (p.saves.length) throw Error("readback failed");
  };
  const failed = result();
  assert.equal(failed.id, id);
  assert.equal(failed.ok, false);
  assert.equal(failed.writeStatus, "saved");
});

test("scans deployed files, preflights later invalid patches and duplicate IDs before any saves", () => {
  const p = platform();
  p.putFile("/wt/deploy/objects/cost_center/1.xml", xml);
  const second = "/wt/deploy/objects/cost_center/2.xml";
  p.putFile(second, "<cost_center><bad/></cost_center>");
  assert.throws(() => p.BtLoadStartupObjects([rootUrl]), /2/);
  assert.deepEqual(p.saves, []);
  p.putFile(second, xml);
  p.putFile("/wt/other/objects/cost_center/1.xml", xml);
  assert.throws(() => p.BtLoadStartupObjects([rootUrl, "x-local://wt/other/objects"]), /duplicate.*1/i);
  assert.deepEqual(p.saves, []);
  const outcomes = p.BtLoadStartupObjects([rootUrl]);
  assert.deepEqual(
    Array.from(outcomes, (r) => [r.id, r.status]),
    [
      ["1", "created"],
      ["2", "created"],
    ],
  );
  assert.deepEqual(p.saves, ["1", "2"]);
  p.BtLoadStartupObjects([rootUrl]);
  assert.deepEqual(p.saves, ["1", "2"]);
  assert.ok(p.logs.some((l) => /unchanged/i.test(l)));
});

test("an explicit form must agree with the registered form before fetching its schema", () => {
  const p = platform();
  const fetched = [];
  p.controls.beforeForm = (url) => fetched.push(url);
  const other = '<cost_center SPXML-FORM="x-local://wt/unrelated.xmd"/>';
  const result = p.BtApplyStartupObject(other, "cost_center", id, false);
  assert.equal(result.ok, false);
  assert.match(result.error, /form/i);
  assert.ok(!fetched.includes("x-local://wt/unrelated.xmd"));
  assert.deepEqual(p.saves, []);
});

test("rejects a lossy native object URL before opening or writing an aliased ID", () => {
  const p = platform();
  let opens = 0;
  p.controls.beforeOpen = () => opens++;
  const result = p.BtApplyStartupObject(xml, "cost_center", "9223372036854775809", false);
  assert.equal(result.ok, false);
  assert.match(result.error, /identity|object ID/i);
  assert.equal(opens, 0);
  assert.deepEqual(p.saves, []);
});

test("readback detects a Save hook that rewrites a requested field, leaving saved status visible", () => {
  const p = platform();
  p.controls.afterSave = (rec) => {
    rec.values.name = "hook rewrite";
  };
  const result = p.BtApplyStartupObject(xml, "cost_center", id, false);
  assert.equal(result.ok, false);
  assert.equal(result.phase, "readback");
  assert.equal(result.writeStatus, "saved");
  assert.match(result.error, /patch|readback/i);
  assert.deepEqual(p.saves, [id]);
});

test("a missing deployed root is surfaced as incomplete deployment", () => {
  const p = platform();
  assert.throws(() => p.BtLoadStartupObjects([rootUrl]), /directory|missing/i);
  assert.deepEqual(p.saves, []);
});

test("the filename-based legacy resolver alone cannot authorize an unregistered object type", () => {
  const p = platform();
  let fetched = false;
  p.controls.beforeForm = () => {
    fetched = true;
  };
  const result = p.BtApplyStartupObject("<unregistered/>", "unregistered", id, true);
  assert.equal(result.ok, false);
  assert.match(result.error, /register/i);
  assert.equal(fetched, false);
});

test("an oversized deployed file is rejected without reading its full bytes into startup", () => {
  const p = platform();
  p.controls.maxReadSize = 262145;
  p.putFile("/wt/deploy/objects/cost_center/99.xml", "<cost_center>" + " ".repeat(301000) + "</cost_center>");
  assert.throws(() => p.BtLoadStartupObjects([rootUrl]), /262144 byte range/i);
  assert.deepEqual(p.saves, []);
});

test("a malformed deployed filename reports the exact source path and prevents all saves", () => {
  const p = platform();
  p.putFile("/wt/deploy/objects/cost_center/1.xml", xml);
  p.putFile("/wt/deploy/objects/cost_center/12x.xml", xml);
  assert.throws(() => p.BtLoadStartupObjects([rootUrl]), /cost_center\/12x\.xml/);
  assert.deepEqual(p.saves, []);
});

test("scalar defaults use owner creation, preserve manual edits and empty values, and verify Save hooks", () => {
  const p = platform();
  const input = '<cost_center><name default="true">Seed</name><keep>managed</keep></cost_center>';
  const apply = (xml, dryRun = false) => p.BtApplyStartupObject(xml, "cost_center", id, dryRun);
  assert.equal(apply(input, true).status, "would_create");
  assert.equal(apply(input).status, "created");
  assert.equal(p.records.get(id).values.name, "Seed");
  for (const value of ["Renamed", ""]) {
    const values = p.records.get(id).values;
    values.name = value;
    values.keep = "outdated";
    assert.equal(apply(input, true).status, "would_update");
    assert.equal(values.keep, "outdated");
    assert.equal(apply(input).status, "updated");
    assert.equal(p.records.get(id).values.name, value);
    assert.equal(apply(input).writeStatus, "not_attempted");
  }
  p.controls.afterSave = (rec) => {
    rec.values.name = "changed by hook";
  };
  const broken = apply(input.replace("managed", "v2"));
  assert.equal(broken.ok, false);
  assert.equal(broken.phase, "readback");
  assert.equal(broken.writeStatus, "saved");
});

test("form validation rejects defaults on an empty structure, a repeated scalar and an array key", () => {
  const p = platform();
  const scalar = { Type: "string", IsMultiple: false };
  const row = { Type: "", IsMultiple: true, PrimaryKeyName: "key", OptChild: () => scalar };
  const fields = { id: { Type: "integer" }, group: { Type: "" }, tag: { Type: "string", IsMultiple: true }, row };
  const form = { TopElem: { Type: "", OptChild: (key) => fields[key] } };
  for (const [body, message] of [
    ['<group default="true"/>', /singleton scalar/],
    ['<tag default="true"/>', /singleton scalar/],
    ['<row><key default="true">a</key></row>', /primary key/],
  ]) {
    const { nodes } = readStartupXml("<cost_center>" + body + "</cost_center>", "cost_center", id);
    assert.throws(() => p.BtStartupCheckFields(form, nodes), message);
  }
});
