import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

test("SDK v2 stdio exchanges legacy initialize/list/call messages with a local fixture", { timeout: 10_000 }, async (t) => {
  const client = new Client({ name: "stdio-test", version: "1.0.0" }, { supportedProtocolVersions: ["2025-11-25"] });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [fileURLToPath(new URL("./fixtures/stdio-server.mjs", import.meta.url))],
    stderr: "pipe",
  });
  t.after(() => client.close());

  await client.connect(transport, { timeout: 5_000 });
  assert.equal(client.getServerVersion().name, "boristype-wshcm");
  // Cross-tool guidance must reach clients during initialization, including over stdio.
  assert.equal(typeof client.getInstructions(), "string");
  assert.ok(client.getInstructions().trim().length > 0);
  const { tools } = await client.listTools();
  assert.equal(tools.length, 13);
  const result = await client.callTool({ name: "wshcm_read_file", arguments: { path: "x-local://wt/fixture.bs" } });
  assert.notEqual(result.isError, true);
  assert.equal(JSON.parse(result.content[0].text).content, "  000123\r\nПривет 👋\n");
});
