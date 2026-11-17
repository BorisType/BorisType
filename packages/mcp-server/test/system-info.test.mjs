import assert from "node:assert/strict";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { createServer } from "../build/index.js";
import { systemReport, systemSummary } from "../../ws-client/test/fixtures/system-info.mjs";

async function connect(t, evalCode) {
  const server = createServer({ evaluator: { eval: evalCode } });
  const client = new Client({ name: "system-info-test", version: "1" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  t.after(async () => {
    await client.close();
    await server.close();
  });
  await server.connect(b);
  await client.connect(a);
  return client;
}

for (const includeReport of [undefined, false, true]) {
  test(`MCP system info returns JSON and honors includeReport=${includeReport}`, async (t) => {
    let calls = 0;
    const client = await connect(t, async (code) =>
      runInNewContext(`(function () { ${code} })()`, {
        EncodeJson: JSON.stringify,
        tools_report: {
          gather_system_info() {
            calls++;
            return systemReport;
          },
        },
      }),
    );
    const tool = (await client.listTools()).tools.find(({ name }) => name === "wshcm_get_system_info");
    assert.ok(tool, "System information tool is registered");
    assert.equal(tool.annotations.readOnlyHint, true);
    assert.equal(tool.annotations.destructiveHint, false);
    assert.equal(tool.inputSchema.properties.includeReport.default, false);
    const result = await client.callTool({ name: tool.name, arguments: includeReport === undefined ? {} : { includeReport } });
    assert.notEqual(result.isError, true);
    assert.deepEqual(JSON.parse(result.content[0].text), {
      summary: systemSummary,
      ...(includeReport ? { report: systemReport } : {}),
    });
    assert.equal(calls, 1);
  });
}

test("MCP system info rejects invalid input before evaluation", async (t) => {
  let calls = 0;
  const client = await connect(t, async () => {
    calls++;
    return JSON.stringify(systemReport);
  });
  const result = await client.callTool({ name: "wshcm_get_system_info", arguments: { includeReport: "yes" } });
  assert.equal(result.isError, true);
  assert.equal(calls, 0);
});

test("MCP system info exposes unsupported platform methods as a tool error, without retry", async (t) => {
  let calls = 0;
  const client = await connect(t, async () => {
    calls++;
    throw new Error("gather_system_info unavailable");
  });
  const result = await client.callTool({ name: "wshcm_get_system_info", arguments: {} });
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /gather_system_info unavailable/);
  assert.equal(calls, 1);
});
