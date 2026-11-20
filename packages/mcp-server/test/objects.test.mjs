import assert from "node:assert/strict";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { WshcmDispatchError } from "@boristype/ws-client";
import { createServer } from "../build/index.js";

const formUrl = "x-local://wtv/wtv_cost_center.xmd";
const id = "7349577710243911718";
const xml = "<cost_center><name>Привет &amp; 'quoted' ${request}</name><n>42</n></cost_center>";

async function connect(t, evaluate = () => assert.fail("Unexpected platform call")) {
  const server = createServer({ evaluator: { eval: evaluate } });
  const client = new Client({ name: "object-test", version: "1" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  t.after(async () => {
    await client.close();
    await server.close();
  });
  await server.connect(b);
  await client.connect(a);
  return client;
}

// Local platform doubles execute the shipped BS resource. They are not C-runtime evidence.
function platform() {
  const state = {
    value: xml,
    schema: '<cost_center><name TYPE="string"/><n TYPE="integer"/></cost_center>',
    saves: 0,
    deletes: [],
    calls: 0,
    parsed: [],
    saveError: false,
    readbackError: false,
  };
  const field = (name, type = "", children = {}, multiple = false) => ({
    Name: name,
    Type: type,
    IsMethod: false,
    IsMultiple: multiple,
    children,
    OptChild: (key) => children[key],
  });
  const root = field("cost_center", "", {
    id: field("id", "integer"),
    name: field("name", "string"),
    n: field("n", "integer"),
    rows: field("rows", "", { row: field("row", "", { s: field("s", "string") }, true) }),
  });
  const form = { Url: formUrl, TopElem: root };
  Object.defineProperty(root, "Xml", { get: () => state.schema });
  const doc = (value) => {
    let text = value;
    return {
      FormUrl: formUrl,
      DocID: id,
      Url: "object:" + id,
      TopElem: {
        Name: "cost_center",
        get Xml() {
          return text;
        },
        LoadData(raw) {
          state.parsed.push(raw);
          text = raw;
        },
      },
      BindToDb() {},
      Save() {
        state.saves++;
        state.value = text;
        if (state.saveError) throw Error("after-save-failure");
      },
    };
  };
  state.evaluate = (script) => {
    state.calls++;
    return runInNewContext(`(function () { ${script} })()`, {
      ParseJson: JSON.parse,
      EncodeJson: JSON.stringify,
      FetchForm: () => form,
      OpenNewDoc: () => doc("<cost_center/>"),
      OpenDocFromStr(raw) {
        state.parsed.push(raw);
        return doc(raw);
      },
      OpenDoc(url) {
        assert.equal(url, "object:" + id);
        if (state.readbackError && state.saves) throw Error("readback-failure");
        return doc(state.value);
      },
      DeleteDoc(url, permanent) {
        assert.equal(url, "object:" + id);
        state.deletes.push({ url, permanent });
      },
      UrlFromDocID: (value) => "object:" + value,
      Int: BigInt,
      StrInt: String,
      StrCharCount: (value) => value.length,
      ArrayCount: (value) => (Array.isArray(value) ? value.length : Object.keys(value.children).length),
      DefaultDb: {},
      Trim: (text) => text.trim(),
      StrLeftCharRange: (text, count) => text.slice(0, count),
    });
  };
  return state;
}

async function call(client, name, args, error = false) {
  const result = await client.callTool({ name: `wshcm_${name}`, arguments: args });
  assert.equal(result.isError === true, error, JSON.stringify(result));
  return JSON.parse(result.content[0].text);
}

test("object tools expose XML transport and honest mutation annotations", async (t) => {
  const client = await connect(t);
  const { tools } = await client.listTools();
  for (const name of ["get_form", "get_object", "save_object"]) assert.ok(tools.some((tool) => tool.name === `wshcm_${name}`));
  const save = tools.find((tool) => tool.name === "wshcm_save_object");
  assert.equal(save.annotations.destructiveHint, true);
  assert.equal(save.annotations.idempotentHint, false);
  assert.match(save.description, /replace|omitted/);
});

test("list_object_types exposes separate object and catalog entries with registry coverage", async (t) => {
  const page = {
    total: 2,
    offset: 0,
    limit: 100,
    items: [
      { kind: "object", name: "cost_center", isCustom: false, formUrl },
      { kind: "catalog", name: "cost_centers", isCustom: false, isHier: true },
    ],
    sources: { exchangeObjectTypes: "available", registeredCatalogs: "available" },
  };
  const client = await connect(t, () => JSON.stringify(JSON.stringify({ ok: true, ...page })));
  assert.deepEqual(await call(client, "list_object_types", {}), page);
  const { tools } = await client.listTools();
  const registry = tools.find((tool) => tool.name === "wshcm_list_object_types");
  assert.equal(Object.hasOwn(registry.inputSchema.properties, "includeCustomFields"), false);
});

test("custom field lookup advertises a compact list and accepts a direct scope", async (t) => {
  const listing = {
    objectType: "request",
    common: null,
    templateType: "request_type",
    templateSelector: "request_type_id",
    offset: 0,
    limit: 50,
    total: 1,
    templates: [{ templateId: id, fieldCount: 0, pageCount: 1 }],
  };
  let calls = 0;
  const client = await connect(t, (script) => {
    calls++;
    const invocation = script.match(/ParseJson\(\s*('[\s\S]*')\s*\)\)\)\);\s*$/);
    const input = JSON.parse(runInNewContext(invocation[1]));
    if (input.operation === "list") {
      assert.deepEqual(input, { operation: "list", objectType: "request", offset: 0, limit: 50 });
      return JSON.stringify(JSON.stringify({ ok: true, listing }));
    }
    assert.deepEqual(input, { operation: "get", scope: { objectType: "request_type", templateId: id } });
    return JSON.stringify(
      JSON.stringify({
        ok: true,
        snapshot: { url: "x-local://wt_data/lists/wtv_custom_templates.xml", xml: "<custom_templates/>" },
        definition: { exists: true, fields: [], pages: [{ id: "main", title: "Details" }], fieldTypes: [] },
      }),
    );
  });
  const { tools } = await client.listTools();
  const lookup = tools.find((tool) => tool.name === "wshcm_get_custom_field_definitions");
  assert.equal(lookup.inputSchema.type, "object");
  assert.ok(lookup.inputSchema.properties.mode);
  const mixed = await client.callTool({
    name: lookup.name,
    arguments: { mode: "list", objectType: "request", scope: { objectType: "request_type", templateId: id } },
  });
  assert.equal(mixed.isError, true);
  assert.equal(calls, 0);
  const found = await call(client, "get_custom_field_definitions", { mode: "list", objectType: "request" });
  assert.deepEqual(found, listing);
  const definitions = await call(client, "get_custom_field_definitions", {
    scope: { objectType: found.templateType, templateId: found.templates[0].templateId },
  });
  assert.deepEqual(definitions.pages, [{ id: "main", title: "Details" }]);
  assert.match(definitions.revision, /^[a-f0-9]{64}$/);
});

test("form/get/create/replace execute native API with original XML", async (t) => {
  const state = platform();
  const client = await connect(t, state.evaluate);
  assert.deepEqual(await call(client, "get_form", { formUrl }), { formUrl, root: "cost_center", xml: state.schema });
  const created = await call(client, "save_object", { mode: "create", formUrl, xml });
  assert.equal(created.id, id);
  assert.equal(created.writeStatus, "saved");
  assert.equal(created.xml, xml);
  const read = await call(client, "get_object", { id });
  assert.equal(read.id, id);
  assert.equal(read.xml, xml);
  assert.equal(typeof read.readToken, "string");
  const replaced = await call(client, "save_object", {
    mode: "replace",
    id,
    readToken: read.readToken,
    xml: "<cost_center><name>replacement</name></cost_center>",
  });
  assert.equal(replaced.xml, "<cost_center><name>replacement</name></cost_center>");
  assert.equal(state.saves, 2);
  assert.deepEqual(state.parsed, [xml, replaced.xml]);
  await call(client, "save_object", { mode: "replace", id, readToken: read.readToken, xml }, true);
  assert.equal(state.saves, 2);
});

for (const badXml of [
  "<wrong><name>lost</name></wrong>",
  "<cost_center><unknown>lost</unknown></cost_center>",
  "<cost_center><n>NaN</n></cost_center>",
  "<cost_center><name>a</name><name>b</name></cost_center>",
  "<cost_center><n><name>x</name></n></cost_center>",
  "<cost_center>mixed<name>x</name></cost_center>",
]) {
  test(`native form validation prevents Save: ${badXml}`, async (t) => {
    const state = platform();
    const client = await connect(t, state.evaluate);
    const result = await call(client, "save_object", { mode: "create", formUrl, xml: badXml }, true);
    assert.equal(result.writeStatus, "not_attempted");
    assert.equal(result.phase, "validate");
    assert.equal(state.saves, 0);
    assert.deepEqual(state.parsed, []);
  });
}

test("stale full XML and stale schema both prevent replace", async (t) => {
  const state = platform();
  const client = await connect(t, state.evaluate);
  for (const property of ["value", "schema"]) {
    const read = await call(client, "get_object", { id });
    state[property] += " ";
    const result = await call(client, "save_object", { mode: "replace", id, readToken: read.readToken, xml }, true);
    assert.equal(result.error.code, "Conflict");
    assert.equal(result.writeStatus, "not_attempted");
  }
  assert.equal(state.saves, 0);
});

test("delete checks the fresh XML snapshot and moves only the selected object to trash", async (t) => {
  const state = platform();
  const client = await connect(t, state.evaluate);
  const first = await call(client, "get_object", { id });
  state.value += " ";
  const conflict = await call(client, "delete_object", { id, readToken: first.readToken }, true);
  assert.equal(conflict.error.code, "Conflict");
  assert.equal(conflict.deleteStatus, "not_attempted");
  assert.deepEqual(state.deletes, []);

  const fresh = await call(client, "get_object", { id });
  const args = { id, readToken: fresh.readToken };
  assert.deepEqual(await call(client, "delete_object", args), { id, mode: "trash", deleteStatus: "deleted" });
  const callsAfterDelete = state.calls;
  const consumed = await call(client, "delete_object", args, true);
  assert.equal(consumed.deleteStatus, "not_attempted");
  assert.equal(state.calls, callsAfterDelete);
  assert.deepEqual(state.deletes, [{ url: "object:" + id, permanent: false }]);
});

test("delete distinguishes failed preparation from an unacknowledged native mutation", async (t) => {
  const state = platform();
  let failure;
  const client = await connect(t, (script) => {
    if (!failure) return state.evaluate(script);
    if (failure === "preflight") throw new WshcmDispatchError("Unavailable", false);
    state.evaluate(script);
    throw new WshcmDispatchError("Response lost", true);
  });
  for (const failedPhase of ["preflight", "response"]) {
    failure = undefined;
    const read = await call(client, "get_object", { id });
    failure = failedPhase;
    const error = await call(client, "delete_object", { id, readToken: read.readToken }, true);
    assert.equal(error.id, id);
    assert.equal(error.deleteStatus, failedPhase === "preflight" ? "not_attempted" : "unknown");
  }
  assert.deepEqual(state.deletes, [{ url: "object:" + id, permanent: false }]);
});

test("multiple elements remain valid with the same schema path", async (t) => {
  const state = platform();
  const client = await connect(t, state.evaluate);
  const xml = "<cost_center><rows><row><s>a</s></row><row><s>b</s></row></rows></cost_center>";
  assert.equal((await call(client, "save_object", { mode: "create", formUrl, xml })).xml, xml);
});

test("read tokens belong to an object and MCP instance, and local errors consume replace grants", async (t) => {
  const state = platform();
  const first = await connect(t, state.evaluate);
  const second = await connect(t, state.evaluate);
  const read = await call(first, "get_object", { id });
  await call(second, "save_object", { mode: "replace", id, readToken: read.readToken, xml }, true);
  await call(first, "save_object", { mode: "replace", id, readToken: read.readToken, xml: "<bad" }, true);
  await call(first, "save_object", { mode: "replace", id, readToken: read.readToken, xml }, true);
  assert.equal(state.saves, 0);
});

for (const failure of ["saveError", "readbackError", "transport"]) {
  test(`${failure} reports save outcome conservatively without retry`, async (t) => {
    const state = platform();
    state[failure] = true;
    const client = await connect(
      t,
      failure === "transport"
        ? () => {
            state.calls++;
            throw Error("timeout");
          }
        : state.evaluate,
    );
    const result = await call(client, "save_object", { mode: "create", formUrl, xml }, true);
    assert.equal(result.writeStatus, failure === "readbackError" ? "saved" : "unknown");
    assert.equal(state.calls, 1);
    if (failure !== "transport") assert.equal(result.id, id);
  });
}

for (const args of [
  { mode: "create", formUrl, xml, id },
  { mode: "replace", id, xml },
  { mode: "create", formUrl: formUrl + ";other=x", xml },
  { mode: "create", formUrl, xml, options: "other" },
]) {
  test(`invalid save contract cannot reach platform: ${JSON.stringify(args)}`, async (t) => {
    const client = await connect(t);
    const result = await client.callTool({ name: "wshcm_save_object", arguments: args });
    assert.equal(result.isError, true);
  });
}

test("invalid readback after a valid save acknowledgement retains known ID and saved status", async (t) => {
  const client = await connect(t, () =>
    JSON.stringify(JSON.stringify({ ok: true, id, formUrl, root: "cost_center", xml: "中".repeat(100000), writeStatus: "saved" })),
  );
  const result = await call(client, "save_object", { mode: "create", formUrl, xml }, true);
  assert.equal(result.id, id);
  assert.equal(result.writeStatus, "saved");
});

test("long native failure diagnostics cannot discard known ID, phase and save status", async (t) => {
  const client = await connect(t, () =>
    JSON.stringify(
      JSON.stringify({
        ok: false,
        id,
        phase: "readback",
        writeStatus: "saved",
        error: { code: "PlatformError", message: "x".repeat(65537) },
      }),
    ),
  );
  const result = await call(client, "save_object", { mode: "create", formUrl, xml }, true);
  assert.equal(result.id, id);
  assert.equal(result.writeStatus, "saved");
  assert.equal(result.phase, "readback");
  assert.equal(result.error.message.length, 2000);
});

for (const xml of ["<cost_center/>trailing-text", "<![CDATA[text]]><cost_center/>"]) {
  test(`malformed top-level XML never reaches native import: ${xml}`, async (t) => {
    const client = await connect(t);
    const result = await call(client, "save_object", { mode: "create", formUrl, xml }, true);
    assert.equal(result.phase, "input");
    assert.equal(result.writeStatus, "not_attempted");
  });
}

for (const payload of [
  undefined,
  "{}",
  "not json",
  JSON.stringify("not json"),
  JSON.stringify(JSON.stringify({ ok: true, id: "2", formUrl, root: "cost_center", xml, schemaXml: "<cost_center/>" })),
]) {
  test(`invalid/mismatched read response grants no replace token: ${String(payload).slice(0, 60)}`, async (t) => {
    const client = await connect(t, () => payload);
    await call(client, "get_object", { id }, true);
  });
}

const patchXml = "<cost_center><name>patched</name></cost_center>";
const patchFixture = { id, formUrl, root: "cost_center", xml };
const schemaXml = '<cost_center><name TYPE="string"/><n TYPE="integer"/></cost_center>';
const wire = (body) => JSON.stringify(JSON.stringify(body));

async function patchClient(t, evaluatePatch = () => assert.fail("Unexpected patch dispatch")) {
  let reads = 0;
  let patches = 0;
  const client = await connect(t, (script) => {
    const payload = script.match(/BtObjectOperation\(ParseJson\(('.*')\)\)\)\);\s*$/)?.[1];
    assert.ok(payload, "SDK sent an object operation request");
    const request = JSON.parse(runInNewContext(payload));
    if (request.operation === "get_object") {
      reads++;
      return wire({ ok: true, ...patchFixture, schemaXml });
    }
    assert.equal(request.operation, "patch_object");
    patches++;
    return evaluatePatch(request);
  });
  const { readToken } = await call(client, "get_object", { id });
  return { client, args: { id, readToken, xml: patchXml }, reads: () => reads, patches: () => patches };
}

test("patch advertises a strict shared schema and write hints", async (t) => {
  const client = await connect(t);
  const { tools } = await client.listTools();
  const patch = tools.find(({ name }) => name === "wshcm_patch_object");
  assert.ok(patch, "patch tool is registered");
  const { type, required, additionalProperties, properties } = patch.inputSchema;
  assert.equal(type, "object");
  assert.deepEqual([...required].sort(), ["id", "readToken", "xml"]);
  assert.equal(additionalProperties, false);
  assert.deepEqual(Object.keys(properties).sort(), ["dryRun", "id", "readToken", "xml"]);
  assert.equal(properties.id.type, "string");
  assert.equal(properties.readToken.format, "uuid");
  assert.equal(properties.xml.maxLength, 256 * 1024);
  assert.equal(properties.dryRun.type, "boolean");
  assert.equal(properties.dryRun.default, false);
  assert.deepEqual(patch.annotations, { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true });
});

test("patch rejects bad arguments before dispatch and forwards the XML with the shared default", async (t) => {
  const body = { ...patchFixture, xml: patchXml, changed: true, dryRun: false, writeStatus: "saved" };
  const { client, args, reads, patches } = await patchClient(t, (request) => {
    assert.equal(request.dryRun, false);
    assert.equal(request.xml, patchXml);
    return wire({ ok: true, ...body });
  });
  for (const bad of [
    { ...args, mode: "replace" },
    { ...args, id: Number(id) },
    { ...args, id: "18446744073709551616" },
    { ...args, readToken: "invalid" },
    { ...args, dryRun: "false" },
    { ...args, xml: "中".repeat(100000) },
    { id, xml: patchXml },
  ]) {
    const result = await client.callTool({ name: "wshcm_patch_object", arguments: bad });
    assert.equal(result.isError, true);
  }
  assert.equal(patches(), 0);
  assert.deepEqual(await call(client, "patch_object", args), body);
  assert.equal(reads(), 1);
  assert.equal(patches(), 1);
});

test("patch preview preserves its result fields and consumes its full-read token", async (t) => {
  const body = { ...patchFixture, xml: patchXml, changed: true, dryRun: true, writeStatus: "not_attempted" };
  const { client, args, patches } = await patchClient(t, (request) => {
    assert.equal(request.dryRun, true);
    return wire({ ok: true, ...body });
  });
  assert.deepEqual(await call(client, "patch_object", { ...args, dryRun: true }), body);
  const used = await call(client, "patch_object", args, true);
  assert.equal(used.id, id);
  assert.equal(used.phase, "input");
  assert.equal(used.writeStatus, "not_attempted");
  assert.match(used.error.message, /ReadRequired: Read the full object again/);
  assert.equal(patches(), 1);
});

test("patch invalid XML consumes the grant without dispatching", async (t) => {
  const { client, args, patches } = await patchClient(t);
  const error = await call(client, "patch_object", { ...args, xml: "<cost_center>" }, true);
  assert.equal(error.id, id);
  assert.equal(error.phase, "input");
  assert.equal(error.writeStatus, "not_attempted");
  assert.equal(error.error.code, "InvalidInput");
  const used = await call(client, "patch_object", args, true);
  assert.match(used.error.message, /ReadRequired/);
  assert.equal(patches(), 0);
});

const conflict = {
  ok: false,
  id,
  phase: "validate",
  writeStatus: "not_attempted",
  error: { code: "Conflict", message: "Object or schema changed" },
};
for (const [name, response, expected] of [
  ["conflict", () => wire(conflict), conflict],
  [
    "long readback diagnostic",
    () =>
      wire({
        ok: false,
        id,
        phase: "readback",
        writeStatus: "saved",
        error: { code: "PlatformError", message: "x".repeat(65537) },
      }),
    { ok: false, id, phase: "readback", writeStatus: "saved", error: { code: "PlatformError", message: "x".repeat(2000) } },
  ],
  [
    "invalid saved readback",
    () => wire({ ok: true, ...patchFixture, xml: "中".repeat(100000), changed: true, dryRun: false, writeStatus: "saved" }),
    { id, phase: "readback", writeStatus: "saved" },
  ],
  [
    "lost response",
    () => {
      throw new Error("timeout");
    },
    { id, phase: "transport", writeStatus: "unknown", error: { code: "TransportError", message: "Error: timeout" } },
  ],
]) {
  test(`patch preserves known identity and write status on ${name}`, async (t) => {
    const { client, args, patches } = await patchClient(t, response);
    const result = await call(client, "patch_object", args, true);
    if (name === "invalid saved readback") {
      assert.equal(result.error.code, "TransportError");
      delete result.error;
    }
    assert.deepEqual(result, expected);
    assert.equal(patches(), 1);
  });
}
