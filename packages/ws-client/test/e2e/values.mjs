import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { WshcmClient } from "../../build/index.js";

// Explicit opt-in, actual native SOAP execution; no database/business record writes.
test("SOAP values round-trip on the selected HCM runtime", { timeout: 120000 }, async (t) => {
  const { WSHCM_HOST: host, WSHCM_USERNAME: username, WSHCM_PASSWORD: password } = process.env;
  assert.ok(host && username && password, "Set WSHCM_HOST, WSHCM_USERNAME and WSHCM_PASSWORD");
  const client = new WshcmClient({
    host,
    username,
    password,
    port: Number(process.env.WSHCM_PORT ?? 80),
    overHttps: process.env.WSHCM_HTTPS === "true",
    requestTimeout: 15000,
  });
  const lib = `x-local://wt/soap_values_${randomUUID().replaceAll("-", "")}.bs`;
  const source = `"META:ALLOW-CALL-FROM-CLIENT:1"
function echo(value) { return value; }
"META:ALLOW-CALL-FROM-CLIENT:1"
function inspect(value) { return { value: value, kind: DataType(value), objectKind: ObjectType(value) }; }
"META:ALLOW-CALL-FROM-CLIENT:1"
function execute(code) { return eval(code); }
"META:ALLOW-CALL-FROM-CLIENT:1"
function drop_self() { DeleteFile("${lib}"); return true; }
`;
  await client.initialize();
  await client.callMethod("tools", "put_url_text_server", [lib, source]);
  try {
    await t.test("all integer signs and int64 boundaries preserve value and native type", async () => {
      for (const value of [0n, 42n, -7n, -1n, 9007199254740993n, -9007199254740993n, 9223372036854775807n, -9223372036854775808n]) {
        const result = await client.callMethod(lib, "inspect", [value]);
        assert.equal(result.kind, "integer");
        assert.equal(result.value, value);
        assert.equal(await client.callMethod(lib, "echo", [result.value]), value);
      }
    });
    await t.test("whole and fractional number values stay real", async () => {
      for (const value of [0, 1, -7, 1.25, -0, NaN, Infinity, -Infinity]) {
        const result = await client.callMethod(lib, "inspect", [value]);
        assert.equal(result.kind, "real");
        assert.ok(Object.is(result.value, value), `${String(value)} real changed`);
      }
    });
    await t.test("null, undefined, boolean and strings stay distinct", async () => {
      for (const [value, kind] of [
        [null, "null"],
        [undefined, "undefined"],
        [true, "bool"],
        [false, "bool"],
        ["", "string"],
        ["  001 Привет 👋 & <tag>  ", "string"],
      ]) {
        const result = await client.callMethod(lib, "inspect", [value]);
        assert.equal(result.kind, kind);
        assert.equal(result.value, value);
      }
    });
    await t.test("arrays and ordinary records recurse and returned data can be reused as input", async () => {
      const value = {
        id: -9007199254740993n,
        score: 1,
        values: [null, undefined, true, "001", -7n, { min: -9223372036854775808n }],
        singleton: [42n],
        emptyArray: [],
        emptyRecord: {},
      };
      const echoed = await client.callMethod(lib, "echo", [value]);
      assert.deepEqual(echoed, value);
      assert.deepEqual(await client.callMethod(lib, "echo", [echoed]), value);
    });
    await t.test("known real serializer precision loss is visible", async () => {
      const result = await client.callMethod(lib, "execute", ["return Real('1.2345678901234567');"]);
      assert.equal(typeof result, "number");
      // Observed Linux C 2025.2.1333 behavior; not a client precision guarantee.
      assert.equal(result, 1.2345678901);
    });
    await t.test("unsupported native date and XML raise explicit errors", async () => {
      for (const code of ["return OptDate('2025-02-03T04:05:06');", "return OpenDocFromStr('<root><n>42</n></root>').TopElem;"]) {
        await assert.rejects(client.callMethod(lib, "execute", [code]), /unsupported|VALUE-TYPE|Unexpected|Malformed/i);
      }
    });
  } finally {
    assert.equal(await client.callMethod(lib, "drop_self", []), true, "Temporary SOAP fixture cleanup failed");
  }
});
