import assert from "node:assert/strict";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
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
