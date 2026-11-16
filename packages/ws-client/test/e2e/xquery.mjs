import assert from "node:assert/strict";
import { WshcmClient } from "../../build/index.js";
import { executeXQuery } from "../../build/xquery.js";
import { inspect } from "node:util";
// Explicitly invoked against an existing PostgreSQL-backed HCM C-runtime stand.
// This file is outside the default unit-test glob. Never retry native failures.
const { WSHCM_USERNAME: username, WSHCM_PASSWORD: password } = process.env;
if (!username || !password) throw new Error("Set WSHCM_USERNAME and WSHCM_PASSWORD for the existing HCM stand");
const client = new WshcmClient({
  overHttps: process.env.WSHCM_HTTPS === "true",
  host: process.env.WSHCM_HOST || "127.0.0.1",
  port: process.env.WSHCM_PORT || "80",
  username,
  password,
  requestTimeout: 12000,
});
const e = client.createEvaluator();
const report = {
  runtime: "Existing HCM server; authenticated temporary evaluator (record server build separately)",
  records: [],
  cleanup: false,
};
await client.initialize();
async function check(label, action) {
  const record = { label };
  try {
    record.value = inspect(await action(), { depth: 6 });
    record.pass = true;
  } catch (error) {
    record.error = error.stack;
    record.pass = false;
    throw error;
  } finally {
    report.records.push(record);
  }
}
function owned(expression, setup = "") {
  return {
    async eval(code) {
      return e.eval(setup + "\n" + code.replace('XQuery("owned")', `[${expression}]`));
    },
  };
}
try {
  await check("SQL exact bigint, whole real, negative SQL loss, NULL empty mapping", async () => {
    const result = await e.xquery("sql:SELECT 9007199254740993::bigint AS id, 1::float8 AS score, -7::bigint AS negative, NULL AS missing");
    assert.deepEqual(result, {
      rows: [{ id: 9007199254740993n, score: 1, negative: null, missing: "" }],
      returnedRows: 1,
      truncated: false,
      limitReason: null,
    });
    return result;
  });
  await check("empty, exact and extra rows", async () => {
    const empty = await e.xquery("sql:SELECT 1 AS id WHERE FALSE");
    assert.deepEqual(empty, { rows: [], returnedRows: 0, truncated: false, limitReason: null });
    const exact = await e.xquery("sql:SELECT generate_series(1,2) AS id", { maxRows: 2 });
    assert.equal(exact.truncated, false);
    const extra = await e.xquery("sql:SELECT generate_series(1,3) AS id", { maxRows: 2 });
    assert.deepEqual(extra, { rows: [{ id: 1n }, { id: 2n }], returnedRows: 2, truncated: true, limitReason: "rows" });
    return { empty, exact, extra };
  });
  await check("SQL string query escaping and CRLF unicode", async () => {
    const result = await e.xquery("sql:SELECT E'Я中👋\\r\\n\\t\\\"\\\\' AS text");
    assert.equal(result.rows[0].text, 'Я中👋\r\n\t"\\');
    return result;
  });
  await check("actual XML recursive typed projection, dates, repeated nodes", async () => {
    const evaluator = owned(
      `OpenDocFromStr('<root><id TYPE="integer">9007199254740993</id><score TYPE="real">1</score><missing TYPE="integer"/><empty TYPE="string"/><nested><flag TYPE="bool">true</flag></nested><item>one</item><item>two</item><text>Я中👋&#13;&#10;line</text><date TYPE="date">2025-02-03T04:05:06Z</date></root>').TopElem`,
    );
    const result = await executeXQuery(evaluator, "owned");
    assert.deepEqual(result.rows, [
      {
        id: 9007199254740993n,
        score: 1,
        missing: null,
        empty: "",
        nested: { flag: true },
        item: ["one", "two"],
        text: "Я中👋\r\nline",
        date: "2025-02-03T04:05:06+00:00",
      },
    ]);
    return result;
  });
  await check("empty schema structure projects as record without Value access", async () => {
    const evaluator = owned("OpenNewDoc('x-local://wtv/wtv_collaborator.xmd').TopElem.files");
    const result = await executeXQuery(evaluator, "owned");
    assert.deepEqual(result.rows, [{}]);
    return result;
  });
  await check("schema singleton multiple field remains array", async () => {
    const setup =
      "var ownedDoc=OpenNewDoc('x-local://wtv/wtv_collaborator.xmd');var ownedFile=ownedDoc.TopElem.files.AddChild();ownedFile.file_id=42;";
    const evaluator = owned("ownedDoc.TopElem.files", setup);
    const result = await executeXQuery(evaluator, "owned");
    assert.ok(Array.isArray(result.rows[0].file));
    assert.equal(result.rows[0].file.length, 1);
    assert.equal(result.rows[0].file[0].file_id, 42n);
    return result;
  });
  await check("native ordinary object/array scalars and undefined", async () => {
    const evaluator = owned("{plain:[42,Real(1),undefined,null,true,'x\\r\\ny']}");
    const result = await executeXQuery(evaluator, "owned");
    assert.deepEqual(result.rows, [{ plain: [42n, 1, undefined, null, true, "x\r\ny"] }]);
    return result;
  });
  await check("output excludes oversized Unicode whole row", async () => {
    const result = await e.xquery("sql:SELECT repeat('中', 65001) AS text");
    assert.deepEqual(result, { rows: [], returnedRows: 0, truncated: true, limitReason: "output" });
    return result;
  });
  await check("depth rejects native finite owned nested arrays", async () => {
    const evaluator = owned(
      "ownedDeep",
      "var ownedDeep=1;var ownedIndex;for(ownedIndex=0;ownedIndex<34;ownedIndex++)ownedDeep=[ownedDeep];",
    );
    await assert.rejects(executeXQuery(evaluator, "owned"));
    return "rejected";
  });
  await check("values rejects native finite owned array", async () => {
    const evaluator = owned(
      "ownedValues",
      "var ownedValues=[];var ownedIndex;for(ownedIndex=0;ownedIndex<10001;ownedIndex++)ownedValues.push(1);",
    );
    await assert.rejects(executeXQuery(evaluator, "owned"));
    return "rejected";
  });
  await check("catalog native bool/bigint/date types", async () => {
    const result = await e.xquery("for $e in collaborators return $e", { maxRows: 1 });
    assert.equal(result.rows.length, 1);
    assert.equal(typeof result.rows[0].id, "bigint");
    assert.equal(typeof result.rows[0].web_banned, "boolean");
    assert.equal(typeof result.rows[0].birth_date, "string");
    assert.equal(result.limitReason, "rows");
    return {
      id: result.rows[0].id,
      web_banned: result.rows[0].web_banned,
      birth_date: result.rows[0].birth_date,
      limitReason: result.limitReason,
    };
  });
} finally {
  report.cleanup = await e.close();
  console.log(JSON.stringify(report, null, 2));
  assert.equal(report.cleanup, true, "Evaluator cleanup failed");
}
