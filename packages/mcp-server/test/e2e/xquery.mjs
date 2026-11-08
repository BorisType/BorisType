import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { localStand } from "./stand.mjs";

const hash = (text) => createHash("sha256").update(text).digest("hex");

test("XQuery passthrough through CLI/stdio/SOAP on the existing local stand", { timeout: 120000 }, async (t) => {
  const stand = localStand();
  const baseline = new Set(stand.evaluators());
  const { client, transport } = stand.createClient();
  let ownedEvaluator;
  let failed = false;
  t.diagnostic(JSON.stringify({ image: stand.image, imageId: stand.imageId, carrier: "CLI/stdio/SOAP/XQuery; no BorisType DLL" }));
  t.after(async () => {
    try {
      await client.close();
    } finally {
      const added = stand.evaluators().filter((name) => !baseline.has(name));
      if (added.length) {
        if (ownedEvaluator && added.length === 1 && added[0] === ownedEvaluator) stand.removeEvaluator(ownedEvaluator);
        assert.fail("CLI did not clean up its temporary evaluator");
      }
    }
  });
  try {
    await client.connect(transport, { timeout: 35000 });
  } finally {
    const added = stand.evaluators().filter((name) => !baseline.has(name));
    if (added.length === 1) ownedEvaluator = added[0];
  }
  assert.ok(ownedEvaluator, "Expected exactly one new evaluator; use an exclusive stand");

  // All acceptance queries are read-only and small. Never retry after a failed native request.
  async function check(name, body) {
    await t.test(name, { skip: failed ? "Earlier native failure; series stopped" : false }, async () => {
      try {
        await body();
      } catch (error) {
        failed = true;
        throw error;
      }
    });
  }
  async function query(query, maxRows = 10) {
    const result = await client.callTool({ name: "wshcm_xquery", arguments: { query, maxRows } }, { timeout: 35000 });
    assert.notEqual(result.isError, true, JSON.stringify(result));
    return { text: result.content[0].text, body: JSON.parse(result.content[0].text) };
  }

  await check("catalog XQuery with an empty result", async () => {
    const { body } = await query("for $elem in collaborators where $elem/id = 0 return $elem");
    assert.deepEqual(body, { rows: [], returnedRows: 0, truncated: false, limitReason: null });
  });
  await check("catalog XML rows serialize with their fields", async () => {
    const { body } = await query("for $elem in collaborators where $elem/id > 0 return $elem", 1);
    assert.equal(body.returnedRows, 1);
    assert.ok(body.rows[0].id);
    assert.equal(typeof body.rows[0].fullname, "string");
  });
  await check("SQL prefix, quotes, Unicode and large integer tokens", async () => {
    // On the tested C/PG bridge, negative integer fields are empty before serialization.
    // Cast in SQL to preserve signed values; do not require a lossless integer mapping here.
    const { body } = await query(
      "sql: SELECT 9007199254740993 AS big, CAST(-9007199254740993 AS VARCHAR(32)) AS negative_text, 'Привет ''quoted'' ${maxRows}' AS label",
    );
    assert.equal(body.returnedRows, 1);
    assert.equal(body.truncated, false);
    assert.equal(body.rows[0].big, "9007199254740993");
    assert.equal(body.rows[0].label, "Привет 'quoted' ${maxRows}");
    assert.equal(body.rows[0].negative_text, "-9007199254740993");
  });
  await check("query string escapes survive the BS parser and SQL literal", async () => {
    const value = "'quoted' \"double\" \\ \r\n\t\u2028\u2029 $& ${query} Привет 👋";
    const { body } = await query("sql: SELECT '" + value.replaceAll("'", "''") + "' AS label");
    assert.equal(body.rows[0].label, value);
  });
  await check("row limit and lookahead on a three-row SQL result", async () => {
    const { body } = await query("sql: SELECT 1 AS n UNION ALL SELECT 2 AS n UNION ALL SELECT 3 AS n ORDER BY n", 2);
    assert.deepEqual(
      body.rows.map((row) => String(row.n)),
      ["1", "2"],
    );
    assert.equal(body.returnedRows, 2);
    assert.equal(body.truncated, true);
    assert.equal(body.limitReason, "rows");
  });
  await check("exact row limit and an empty SQL result are complete", async () => {
    const exact = await query("sql: SELECT 1 AS n UNION ALL SELECT 2 AS n", 2);
    assert.equal(exact.body.returnedRows, 2);
    assert.equal(exact.body.truncated, false);
    const empty = await query("sql: SELECT 1 AS n WHERE 1 = 0");
    assert.deepEqual(empty.body, { rows: [], returnedRows: 0, truncated: false, limitReason: null });
  });
  await check("output limit omits an oversized row and retains complete preceding rows (PostgreSQL)", async () => {
    const oversized = await query("sql: SELECT repeat('x', 70000) AS payload");
    assert.deepEqual(oversized.body, { rows: [], returnedRows: 0, truncated: true, limitReason: "output" });
    const partial = await query("sql: SELECT repeat('中', 40000) AS payload FROM generate_series(1, 2)");
    assert.equal(partial.body.returnedRows, 1);
    assert.equal(hash(partial.body.rows[0].payload), hash("中".repeat(40000)));
    assert.equal(partial.body.truncated, true);
    assert.equal(partial.body.limitReason, "output");
    assert.ok(Buffer.byteLength(partial.text, "utf8") <= 262144);
  });
  await check("astral characters fit the final UTF-8 envelope (PostgreSQL)", async () => {
    const { body, text } = await query("sql: SELECT repeat('👋', 64000) AS payload");
    assert.equal(hash(body.rows[0].payload), hash("👋".repeat(64000)));
    assert.equal(body.truncated, false);
    assert.ok(Buffer.byteLength(text, "utf8") <= 262144);
  });
  await check("SQL execution errors reach the caller", async () => {
    const result = await client.callTool({ name: "wshcm_xquery", arguments: { query: "sql: SELECT FROM" } }, { timeout: 35000 });
    assert.equal(result.isError, true);
  });
});
