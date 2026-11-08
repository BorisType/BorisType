import assert from "node:assert/strict";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { createServer } from "../build/index.js";

async function connect(t, evaluate = () => assert.fail("Unexpected evaluation")) {
  const server = createServer({ evaluator: { eval: evaluate } });
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

// The platform boundary is a local double: these are protocol/JS checks, not C-runtime evidence.
function platform(query, rows, serialize = JSON.stringify, countChars = (value) => value.length) {
  return (script) =>
    runInNewContext(`(function () { ${script} })()`, {
      XQuery(actual) {
        assert.equal(actual, query);
        return rows;
      },
      ArrayRange(source, start, count) {
        assert.equal(start, 0);
        assert.ok(count >= 2 && count <= 1001);
        return (function* () {
          let index = 0;
          for (const row of source) {
            yield row;
            if (++index === count) break;
          }
        })();
      },
      ArraySelectAll: (source) => Array.from(source),
      ArrayCount(source) {
        assert.ok(Array.isArray(source), "Must not count the original lazy query result");
        return source.length;
      },
      StrCharCount: countChars,
      EncodeJson: JSON.stringify,
      tools: {
        object_to_text(row, format, depth) {
          assert.equal(format, "json");
          assert.equal(depth, 5);
          return serialize(row);
        },
      },
    });
}

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
  test(`query text reaches XQuery unchanged: ${JSON.stringify(query)}`, async (t) => {
    const client = await connect(t, platform(query, [{ id: "9007199254740993", label: "Привет", empty: "", missing: null }]));
    const { body } = await call(client, query);
    assert.deepEqual(body, {
      rows: [{ id: "9007199254740993", label: "Привет", empty: "", missing: null }],
      returnedRows: 1,
      truncated: false,
      limitReason: null,
    });
  });
}

test("empty query results remain a complete empty array", async (t) => {
  const client = await connect(t, platform("empty", []));
  assert.deepEqual((await call(client, "empty")).body, { rows: [], returnedRows: 0, truncated: false, limitReason: null });
});

test("row limit consumes at most one extra row without counting the original query", async (t) => {
  let consumed = 0;
  const rows = (function* () {
    for (let i = 0; i < 4; i++) {
      consumed++;
      if (i === 3) assert.fail("Read beyond limit + 1");
      yield { n: i };
    }
  })();
  const client = await connect(t, platform("bounded", rows));
  assert.deepEqual((await call(client, "bounded", { maxRows: 2 })).body, {
    rows: [{ n: 0 }, { n: 1 }],
    returnedRows: 2,
    truncated: true,
    limitReason: "rows",
  });
  assert.equal(consumed, 3);
});

test("exactly maxRows is complete, and the default returns at most 100 rows", async (t) => {
  const client = await connect(t, platform("exact", [{ n: 1 }, { n: 2 }]));
  assert.equal((await call(client, "exact", { maxRows: 2 })).body.truncated, false);
  const defaultClient = await connect(
    t,
    platform(
      "default",
      Array.from({ length: 101 }, (_, n) => ({ n })),
    ),
  );
  const { body } = await call(defaultClient, "default");
  assert.equal(body.returnedRows, 100);
  assert.equal(body.limitReason, "rows");
});

test("output limit keeps whole rows and reports an omitted oversized first row", async (t) => {
  const row = { text: "中".repeat(40000) };
  const client = await connect(t, platform("large", [row, row]));
  const { result, body } = await call(client, "large");
  assert.deepEqual(body.rows, [row]);
  assert.equal(body.returnedRows, 1);
  assert.equal(body.limitReason, "output");
  assert.equal(body.truncated, true);
  assert.ok(Buffer.byteLength(result.content[0].text, "utf8") <= 262144);
  const oversized = await connect(t, platform("oversized", [{ text: "x".repeat(70000) }]));
  assert.deepEqual((await call(oversized, "oversized")).body, {
    rows: [],
    returnedRows: 0,
    truncated: true,
    limitReason: "output",
  });
});

test("output budget leaves envelope space even when the platform counts astral code points", async (t) => {
  // StrCharCount's native counting unit is unverified. The bound must work for either counting convention.
  const client = await connect(
    t,
    platform("astral", [{ text: "👋".repeat(65525) }], JSON.stringify, (value) => Array.from(value).length),
  );
  const { result, body } = await call(client, "astral");
  assert.deepEqual(body, { rows: [], returnedRows: 0, truncated: true, limitReason: "output" });
  assert.ok(Buffer.byteLength(result.content[0].text, "utf8") <= 262144);
});

test("platform JSON numeric tokens are returned without Node parse/stringify rounding", async (t) => {
  const client = await connect(
    t,
    platform("numbers", [{}], () => '{"negative":-9007199254740993,"decimal":0.1234567890123456789}'),
  );
  const { result } = await call(client, "numbers");
  assert.match(result.content[0].text, /"negative":-9007199254740993/);
  assert.match(result.content[0].text, /"decimal":0\.1234567890123456789/);
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

for (const stage of ["query", "enumeration", "serialization", "timeout"]) {
  test(`${stage} failures become tool errors without retry`, async (t) => {
    let calls = 0;
    const query = "fail";
    const client = await connect(t, (script) => {
      assert.equal(++calls, 1, "Must not retry a query with unknown side effects");
      if (stage === "query" || stage === "timeout") throw new Error(stage + " failed");
      const rows =
        stage === "enumeration"
          ? {
              *[Symbol.iterator]() {
                throw new Error("enumeration failed");
              },
            }
          : [{}];
      return platform(query, rows, () => {
        throw new Error("serialization failed");
      })(script);
    });
    const result = await client.callTool({ name: "wshcm_xquery", arguments: { query } });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, new RegExp(stage + " failed"));
    assert.equal(calls, 1);
  });
}

const wire = (body) => JSON.stringify(typeof body === "string" ? body : JSON.stringify(body));
for (const payload of [
  undefined,
  123,
  "not json",
  "null",
  "{}",
  JSON.stringify({ rows: [] }),
  wire("not json"),
  wire("null"),
  wire({ rows: [], returnedRows: 1, truncated: false, limitReason: null }),
  wire({ rows: [], returnedRows: 0, truncated: false, limitReason: "rows" }),
  wire({ rows: [{}, {}], returnedRows: 2, truncated: true, limitReason: "rows" }),
  wire({ rows: [{ value: "x".repeat(262144) }], returnedRows: 1, truncated: false, limitReason: null }),
]) {
  test(`malformed or out-of-budget query response is rejected: ${String(payload).slice(0, 90)}`, async (t) => {
    const client = await connect(t, () => payload);
    const result = await client.callTool({ name: "wshcm_xquery", arguments: { query: "q", maxRows: 1 } });
    assert.equal(result.isError, true);
  });
}
