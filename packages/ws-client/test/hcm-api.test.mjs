import assert from "node:assert/strict";
import { test } from "node:test";
import * as sdk from "../build/index.js";

const path = "x-local://wt/data.bs";
const hash = "a".repeat(64);
const slice = (partial = false) => ({
  apiVersion: 2,
  content: partial ? "a" : "ab",
  sha256: hash,
  bom: false,
  startLine: 1,
  endLine: 1,
  totalLines: 1,
  startOffset: 0,
  endOffset: partial ? 1 : 2,
  totalLength: 2,
});
const evaluator = (body) => ({ eval: async () => JSON.stringify(JSON.stringify(body)) });

test("SDK overwrite requires a read grant covering the full file", async () => {
  assert.equal(typeof sdk.WshcmApi, "function", "WshcmApi must be exported from the SDK");
  const api = new sdk.WshcmApi(evaluator(slice(true)));
  const { readToken } = await api.files.read({ path });
  await assert.rejects(api.files.write({ path, mode: "overwrite", content: "new", readToken }), /ReadRequired/);
});

test("SDK rejects a read token issued by a different API instance", async () => {
  assert.equal(typeof sdk.WshcmApi, "function", "WshcmApi must be exported from the SDK");
  const first = new sdk.WshcmApi(evaluator(slice()));
  const { readToken } = await first.files.read({ path });
  const second = new sdk.WshcmApi({ eval: async () => assert.fail("Foreign token reached evaluator") });
  await assert.rejects(second.files.write({ path, mode: "overwrite", content: "new", readToken }), /ReadRequired/);
});

for (const [method, input] of [
  ["read", { path: "file:///tmp" }],
  ["write", { path, content: "\0" }],
  ["edit", { path, readToken: "guess", edits: [], unexpected: true }],
  ["list", { path, unexpected: true }],
  ["delete", { path: "file:///tmp" }],
  ["mkdir", { path: "file:///tmp" }],
  ["move", { source: path, destination: "file:///tmp" }],
  ["info", { path, unknown: true }],
  ["search", { path, regex: true }],
]) {
  test(`SDK files.${method} validates input before evaluation`, async () => {
    const api = new sdk.WshcmApi({ eval: async () => assert.fail("Invalid input reached evaluator") });
    await assert.rejects(api.files[method](input));
  });
}

for (const [method, input] of [
  ["getForm", { formUrl: "https://example.org/form.xmd" }],
  ["get", { id: 7349577710243911718 }],
  ["save", { mode: "replace", id: "7349577710243911718", xml: "<cost_center/>" }],
]) {
  test(`SDK objects.${method} validates input before evaluation`, async () => {
    const api = new sdk.WshcmApi({ eval: async () => assert.fail("Invalid input reached evaluator") });
    await assert.rejects(api.objects[method](input));
  });
}

test("SDK xquery preserves original large integer and decimal JSON tokens", async () => {
  const json = '{"rows":[{"id":7349577710243911718,"n":0.1234567890123456789}],"returnedRows":1,"truncated":false,"limitReason":null}';
  const api = new sdk.WshcmApi({ eval: async () => JSON.stringify(json) });
  assert.equal(await api.xquery({ query: "sql: SELECT id" }), json);
});

test("SDK xquery rejects invalid input and incompatible response without retry", async () => {
  let calls = 0;
  const api = new sdk.WshcmApi({
    eval: async () => {
      calls++;
      return JSON.stringify("{}");
    },
  });
  await assert.rejects(api.xquery({ query: " " }));
  assert.equal(calls, 0);
  await assert.rejects(api.xquery({ query: "sql: SELECT id" }));
  assert.equal(calls, 1);
});

const formUrl = "x-local://wtv/wtv_cost_center.xmd";
const id = "7349577710243911718";

test("SDK exposes native object error phase and known persisted ID as structured details", async () => {
  const details = { ok: false, id, phase: "readback", writeStatus: "saved", error: { code: "ReadbackError", message: "readback failed" } };
  const api = new sdk.WshcmApi(evaluator(details));
  await assert.rejects(api.objects.save({ mode: "create", formUrl, xml: "<cost_center/>" }), (error) => {
    assert.ok(error instanceof sdk.WshcmObjectError);
    assert.deepEqual(error.details, details);
    return true;
  });
});

test("SDK marks lost save responses as unknown and does not retry", async () => {
  let calls = 0;
  const api = new sdk.WshcmApi({
    eval: async () => {
      calls++;
      throw new Error("timeout");
    },
  });
  await assert.rejects(api.objects.save({ mode: "create", formUrl, xml: "<cost_center/>" }), (error) => {
    assert.ok(error instanceof sdk.WshcmObjectError);
    assert.equal(error.details.phase, "transport");
    assert.equal(error.details.writeStatus, "unknown");
    assert.equal(error.details.id, undefined);
    return true;
  });
  assert.equal(calls, 1);
});

test("SDK rejects object replace grants from another API instance", async () => {
  const first = new sdk.WshcmApi(
    evaluator({ ok: true, id, formUrl, root: "cost_center", xml: "<cost_center/>", schemaXml: "<cost_center/>" }),
  );
  const { readToken } = await first.objects.get({ id });
  const second = new sdk.WshcmApi({ eval: async () => assert.fail("Foreign object grant reached evaluator") });
  await assert.rejects(second.objects.save({ mode: "replace", id, readToken, xml: "<cost_center/>" }), (error) => {
    assert.ok(error instanceof sdk.WshcmObjectError);
    assert.equal(error.details.phase, "input");
    assert.equal(error.details.writeStatus, "not_attempted");
    assert.match(error.details.error.message, /ReadRequired/);
    return true;
  });
});

test("constructing the API leaves evaluator initialization and cleanup to the caller", () => {
  const api = new sdk.WshcmApi({
    eval: async () => assert.fail("Constructor evaluated platform code"),
    initialize() {
      assert.fail("Constructor initialized evaluator");
    },
    close() {
      assert.fail("Constructor closed evaluator");
    },
  });
  assert.ok(api.files);
  assert.ok(api.objects);
});
