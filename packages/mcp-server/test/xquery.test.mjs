import assert from "node:assert/strict";
import { test } from "node:test";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { createServer } from "../build/index.js";
import { McpServer } from "@modelcontextprotocol/server";
import { registerXQueryTool } from "../build/tools/xquery.js";

async function connect(t, xquery = () => assert.fail("Unexpected query"), evaluator) {
  // Presentation tests stub the shared typed SDK boundary. Carrier regressions
  // below use createServer and the real WshcmApi -> executeXQuery adapter.
  const server = evaluator ? createServer({ evaluator }) : new McpServer({ name: "query-test", version: "1" });
  if (!evaluator) registerXQueryTool(server, { xquery: ({ query, maxRows }) => xquery(query, { maxRows }) });
  const client = new Client({ name: "xquery-test", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  t.after(async () => {
    await client.close();
    await server.close();
  });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return client;
}

const complete = (rows = []) => ({ rows, returnedRows: rows.length, truncated: false, limitReason: null });
async function call(client, query, extra = {}) {
  const result = await client.callTool({ name: "wshcm_xquery", arguments: { query, ...extra } });
  assert.notEqual(result.isError, true, JSON.stringify(result));
  return { result, body: JSON.parse(result.content[0].text) };
}

test("xquery advertises unrestricted execution rather than read-only/idempotent guarantees", async (t) => {
  const client = await connect(t);
  const { tools } = await client.listTools();
  const tool = tools.find(({ name }) => name === "wshcm_xquery");
  assert.ok(tool, "Missing wshcm_xquery tool");
  assert.equal(tool.annotations.readOnlyHint, false);
  assert.equal(tool.annotations.destructiveHint, true);
  assert.equal(tool.annotations.idempotentHint, false);
  assert.deepEqual(tool.inputSchema.required, ["query"]);
});

for (const query of [
  "for $elem in collaborators return $elem",
  "sql: SELECT 'Привет 👋' AS label",
  "  sql: SELECT '${maxRows} $& \\ \" ''quoted''\r\n\t\u2028\u2029' AS label  ",
  "sql: UPDATE example SET value = 1 RETURNING value",
  "sql: SELECT '\\'; throw 'must remain query text'; //",
]) {
  test(`query text reaches shared SDK unchanged: ${JSON.stringify(query)}`, async (t) => {
    let calls = 0;
    const client = await connect(t, (actual, options) => {
      assert.equal(++calls, 1);
      assert.equal(actual, query);
      assert.deepEqual(options, { maxRows: 100 });
      return complete([{ id: 9007199254740993n, label: "Привет", empty: "", missing: null }]);
    });
    assert.deepEqual((await call(client, query)).body, complete([{ id: "9007199254740993", label: "Привет", empty: "", missing: null }]));
    assert.equal(calls, 1);
  });
}

test("empty query results remain a complete empty array", async (t) => {
  const client = await connect(t, () => complete());
  assert.deepEqual((await call(client, "empty")).body, complete());
});

test("explicit maxRows and row truncation metadata come from the adapter", async (t) => {
  const client = await connect(t, (query, options) => {
    assert.equal(query, "bounded");
    assert.deepEqual(options, { maxRows: 2 });
    return { rows: [{ n: 0n }, { n: 1n }], returnedRows: 2, truncated: true, limitReason: "rows" };
  });
  assert.deepEqual((await call(client, "bounded", { maxRows: 2 })).body, {
    rows: [{ n: 0 }, { n: 1 }],
    returnedRows: 2,
    truncated: true,
    limitReason: "rows",
  });
});

test("MCP presents safe bigint as JSON numbers and other bigint as exact decimal strings recursively", async (t) => {
  const row = {
    zero: 0n,
    small: 42n,
    negative: -7n,
    maxSafe: 9007199254740991n,
    minSafe: -9007199254740991n,
    large: 9007199254740992n,
    negativeLarge: -9007199254740993n,
    int64: [9223372036854775807n, -9223372036854775808n],
    score: 1,
    fractional: 1.25,
    nested: [{ enabled: true, empty: "", missing: null, omitted: undefined }],
    array: [undefined, null, "42"],
  };
  const client = await connect(t, () => complete([row]));
  assert.deepEqual(
    (await call(client, "numbers")).body,
    complete([
      {
        zero: 0,
        small: 42,
        negative: -7,
        maxSafe: 9007199254740991,
        minSafe: -9007199254740991,
        large: "9007199254740992",
        negativeLarge: "-9007199254740993",
        int64: ["9223372036854775807", "-9223372036854775808"],
        score: 1,
        fractional: 1.25,
        nested: [{ enabled: true, empty: "", missing: null }],
        array: [null, null, "42"],
      },
    ]),
  );
});

test("MCP output preserves own prototype-sensitive field names", async (t) => {
  const row = JSON.parse('{"__proto__":{"value":"kept"},"constructor":"own","prototype":null}');
  const client = await connect(t, () => complete([row]));
  assert.deepEqual((await call(client, "keys")).body, complete([row]));
  assert.equal({}.value, undefined);
});

for (const number of [NaN, Infinity, -Infinity]) {
  test(`nonfinite real ${number} causes an explicit JSON presentation error`, async (t) => {
    const client = await connect(t, () => complete([{ nested: [number] }]));
    const result = await client.callTool({ name: "wshcm_xquery", arguments: { query: "nonfinite" } });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /non.?finite/i);
  });
}

test("output truncation keeps whole rows and bounds the final JSON envelope", async (t) => {
  const row = { text: "中".repeat(40000) };
  const expected = { rows: [row], returnedRows: 1, truncated: true, limitReason: "output" };
  const client = await connect(t, () => expected);
  const { result, body } = await call(client, "large");
  assert.deepEqual(body, expected);
  assert.ok(Buffer.byteLength(result.content[0].text, "utf8") <= 262144);
  const oversized = await connect(t, () => ({ rows: [], returnedRows: 0, truncated: true, limitReason: "output" }));
  assert.deepEqual((await call(oversized, "oversized")).body, { rows: [], returnedRows: 0, truncated: true, limitReason: "output" });
});

for (const args of [
  {},
  { query: "" },
  { query: " \n\t" },
  { query: 123 },
  { query: "a\0b" },
  { query: "\ud800" },
  { query: "中".repeat(22000) },
  { query: "x".repeat(65537) },
  { query: "ok", maxRows: 0 },
  { query: "ok", maxRows: 1001 },
  { query: "ok", maxRows: 1.5 },
  { query: "ok", options: "lds-server=other" },
]) {
  test(`invalid query input does not reach HCM: ${JSON.stringify(args).slice(0, 100)}`, async (t) => {
    const client = await connect(t);
    const result = await client.callTool({ name: "wshcm_xquery", arguments: args });
    assert.equal(result.isError, true);
  });
}

for (const stage of ["query", "enumeration", "projection", "timeout"]) {
  test(`${stage} failures become tool errors without retry`, async (t) => {
    let calls = 0;
    const client = await connect(t, () => {
      assert.equal(++calls, 1, "Must not retry a query with unknown side effects");
      throw new Error(stage + " failed");
    });
    const result = await client.callTool({ name: "wshcm_xquery", arguments: { query: "fail" } });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, new RegExp(stage + " failed"));
    assert.equal(calls, 1);
  });
}

for (const payload of [
  undefined,
  123,
  "not json",
  null,
  {},
  { rows: [] },
  { rows: [], returnedRows: 1n, truncated: false, limitReason: null },
  { rows: [], returnedRows: 0n, truncated: false, limitReason: "rows" },
  { rows: [{ entries: [] }, { entries: [] }], returnedRows: 2n, truncated: true, limitReason: "rows" },
  { rows: [], returnedRows: 0n, truncated: true, limitReason: "rows" },
  { rows: [{ entries: [['"value"', JSON.stringify("x".repeat(262144))]] }], returnedRows: 1n, truncated: false, limitReason: null },
]) {
  test(`malformed or out-of-budget query response is rejected: ${String(payload).slice(0, 90)}`, async (t) => {
    let calls = 0;
    const client = await connect(t, undefined, {
      async eval() {
        calls++;
        return payload;
      },
    });
    const result = await client.callTool({ name: "wshcm_xquery", arguments: { query: "q", maxRows: 1 } });
    assert.equal(result.isError, true);
    assert.equal(calls, 1);
  });
}

test("MCP presents the shared SDK typed projection without requiring evaluator.xquery", async (t) => {
  let calls = 0;
  const client = await connect(t, undefined, {
    async eval() {
      calls++;
      return {
        rows: [
          {
            entries: [
              ['"id"', 9007199254740993n],
              ['"score"', 1],
              ['"text"', '"Я中👋\\r\\n"'],
            ],
          },
        ],
        returnedRows: 1n,
        truncated: false,
        limitReason: null,
      };
    },
  });
  assert.deepEqual((await call(client, "sql: SELECT id")).body, complete([{ id: "9007199254740993", score: 1, text: "Я中👋\r\n" }]));
  assert.equal(calls, 1);
});

test("JSON presentation enforces its final UTF-8 envelope bound", async (t) => {
  const client = await connect(t, () => complete([{ value: "中".repeat(90000) }]));
  const result = await client.callTool({ name: "wshcm_xquery", arguments: { query: "big" } });
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /256 KiB/);
});
