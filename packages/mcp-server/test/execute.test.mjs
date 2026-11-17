import assert from "node:assert/strict";
import { test } from "node:test";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { createServer } from "../build/index.js";

async function connect(t, evaluate) {
  const server = createServer({ evaluator: { eval: evaluate } });
  const client = new Client({ name: "execute-test", version: "1" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  t.after(async () => {
    await client.close();
    await server.close();
  });
  await server.connect(b);
  await client.connect(a);
  return client;
}

test("execute advertises arbitrary mutation, not read-only/idempotent execution", async (t) => {
  const client = await connect(t, () => assert.fail("Unexpected execution"));
  const tool = (await client.listTools()).tools.find(({ name }) => name === "wshcm_execute");
  assert.ok(tool);
  assert.deepEqual(tool.inputSchema.required, ["code"]);
  assert.equal(tool.annotations.readOnlyHint, false);
  assert.equal(tool.annotations.destructiveHint, true);
  assert.equal(tool.annotations.idempotentHint, false);
});

test("execute returns MCP JSON with safe/large integers, undefined and diagnostics", async (t) => {
  let calls = 0;
  const client = await connect(t, async () => {
    calls++;
    return {
      ok: true,
      value: {
        entries: [
          ['"small"', -7n],
          ['"big"', -9007199254740993n],
          ['"absent"', undefined],
        ],
      },
      output: ['"before\\r\\n"'],
      outputTruncated: false,
      error: null,
    };
  });
  const result = await client.callTool({ name: "wshcm_execute", arguments: { code: "return -7;" } });
  assert.notEqual(result.isError, true);
  assert.deepEqual(JSON.parse(result.content[0].text), {
    ok: true,
    value: { small: -7, big: "-9007199254740993", absent: null },
    output: ["before\r\n"],
    outputTruncated: false,
  });
  assert.equal(calls, 1);
});

test("execute reports native errors with isError while keeping prior diagnostics", async (t) => {
  const client = await connect(t, async () => ({
    ok: false,
    value: null,
    output: ['"before"'],
    outputTruncated: false,
    error: { phase: "execution", message: '"failed at line 2"' },
  }));
  const result = await client.callTool({ name: "wshcm_execute", arguments: { code: "throw 'failure';" } });
  assert.equal(result.isError, true);
  assert.deepEqual(JSON.parse(result.content[0].text), {
    ok: false,
    output: ["before"],
    outputTruncated: false,
    error: { phase: "execution", message: "failed at line 2" },
  });
});

test("execute exposes timeout as unknown without retrying", async (t) => {
  let calls = 0;
  const client = await connect(t, async () => {
    calls++;
    throw new Error("request timed out");
  });
  const result = await client.callTool({ name: "wshcm_execute", arguments: { code: "return 1;" } });
  assert.equal(result.isError, true);
  const body = JSON.parse(result.content[0].text);
  assert.equal(body.executionStatus, "unknown");
  assert.equal(body.phase, "transport");
  assert.match(body.error.message, /timed out/);
  assert.equal(calls, 1);
});

test("execute rejects nonfinite MCP values while preserving diagnostic output", async (t) => {
  const client = await connect(t, async () => ({ ok: true, value: NaN, output: ['"before"'], outputTruncated: false, error: null }));
  const result = await client.callTool({ name: "wshcm_execute", arguments: { code: "return Real('NaN');" } });
  assert.equal(result.isError, true);
  const body = JSON.parse(result.content[0].text);
  assert.equal(body.error.phase, "presentation");
  assert.match(body.error.message, /nonfinite/i);
  assert.deepEqual(body.output, ["before"]);
});

test("execute rejects invalid input before calling HCM", async (t) => {
  const client = await connect(t, async () => assert.fail("Invalid input reached HCM"));
  const result = await client.callTool({ name: "wshcm_execute", arguments: { code: "" } });
  assert.equal(result.isError, true);
});

test("execute bounds transport error diagnostics within the response budget", async (t) => {
  const client = await connect(t, async () => {
    throw new Error("x".repeat(300000));
  });
  const result = await client.callTool({ name: "wshcm_execute", arguments: { code: "return 1;" } });
  assert.equal(result.isError, true);
  const text = result.content[0].text;
  assert.ok(Buffer.byteLength(text) <= 262144);
  const body = JSON.parse(text);
  assert.equal(body.executionStatus, "unknown");
  assert.ok(body.error.message.length <= 2000);
});
