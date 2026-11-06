import assert from "node:assert/strict";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { Client, InMemoryTransport, ProtocolErrorCode } from "@modelcontextprotocol/client";
import { createServer } from "../build/index.js";

async function connect(t, connection) {
  const server = createServer(connection);
  const client = new Client({ name: "mcp-test", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  t.after(async () => {
    await client.close();
    await server.close();
  });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return client;
}

const unusedConnection = {
  client: { callMethod: () => assert.fail("Unexpected SOAP call") },
  evaluator: { eval: () => assert.fail("Unexpected evaluation") },
};

test("MCP initializes and advertises only the four implemented tools", { timeout: 10_000 }, async (t) => {
  const client = await connect(t, unusedConnection);
  assert.deepEqual(client.getServerVersion(), { name: "boristype-wshcm", version: "0.1.0-alpha.1" });
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map(({ name }) => name).sort(), [
    "wshcm_delete_file",
    "wshcm_list_directory",
    "wshcm_read_file",
    "wshcm_write_file",
  ]);
  for (const tool of tools) {
    assert.equal(tool.inputSchema.type, "object");
    assert.equal(tool.inputSchema.properties.path.type, "string");
    assert.match(tool.inputSchema.properties.path.description, /Server .*URL/);
    assert.ok(tool.inputSchema.required.includes("path"));
  }
});

test("unknown tools reject with a protocol error", { timeout: 10_000 }, async (t) => {
  const client = await connect(t, unusedConnection);
  await assert.rejects(client.callTool({ name: "wshcm_move_file", arguments: {} }), {
    code: ProtocolErrorCode.InvalidParams,
  });
});

test("read preserves exact string content and passes a literal path to the script", { timeout: 10_000 }, async (t) => {
  const path = "x-local://wt/a$&'\\${other}.bs";
  const content = "  000123\nПривет 👋\n";
  const client = await connect(t, {
    ...unusedConnection,
    evaluator: {
      eval: async (script) =>
        runInNewContext(`(function () { ${script} })()`, {
          EncodeJson: JSON.stringify,
          LoadUrlData: (receivedPath) => {
            assert.equal(receivedPath, path);
            return content;
          },
          DecodeCharset: (data, charset) => {
            assert.equal(charset, "utf-8");
            return data;
          },
        }),
    },
  });
  const result = await client.callTool({ name: "wshcm_read_file", arguments: { path } });
  assert.notEqual(result.isError, true);
  assert.deepEqual(result.content, [{ type: "text", text: content }]);
});

for (const content of ["", "\n\t", "  a\r\nb\rc\n  "]) {
  test(`read accepts a valid empty or whitespace-only file: ${JSON.stringify(content)}`, { timeout: 10_000 }, async (t) => {
    const client = await connect(t, { ...unusedConnection, evaluator: { eval: async () => JSON.stringify(content) } });
    const result = await client.callTool({ name: "wshcm_read_file", arguments: { path: "x-local://wt/file.bs" } });
    assert.notEqual(result.isError, true);
    assert.equal(result.content[0].text, content);
  });
}

for (const wire of ["not json", "null", "123", "[]", "{}"]) {
  test(`read rejects a malformed or non-string JSON payload: ${wire}`, { timeout: 10_000 }, async (t) => {
    const client = await connect(t, { ...unusedConnection, evaluator: { eval: async () => wire } });
    const result = await client.callTool({ name: "wshcm_read_file", arguments: { path: "x-local://wt/file.bs" } });
    assert.equal(result.isError, true);
  });
}

test("read strips one UTF-8 signature from the decoded file", { timeout: 10_000 }, async (t) => {
  const client = await connect(t, { ...unusedConnection, evaluator: { eval: async () => JSON.stringify("\uFEFFПривет\r\n") } });
  const result = await client.callTool({ name: "wshcm_read_file", arguments: { path: "x-local://wt/file.bs" } });
  assert.notEqual(result.isError, true);
  assert.equal(result.content[0].text, "Привет\r\n");
});

for (const name of ["wshcm_read_file", "wshcm_list_directory"]) {
  for (const value of [undefined, null, 123, {}]) {
    test(`${name} rejects a non-string server result: ${JSON.stringify(value)}`, { timeout: 10_000 }, async (t) => {
      const client = await connect(t, { ...unusedConnection, evaluator: { eval: async () => value } });
      const result = await client.callTool({ name, arguments: { path: "x-local://wt/" } });
      assert.equal(result.isError, true);
      assert.match(result.content[0].text, /Expected a string/);
    });
  }
}

test("write passes content as a separate SOAP argument without modification", { timeout: 10_000 }, async (t) => {
  const path = "x-local://wt/a$&'file.bs";
  const content = "  001\r\n'quoted'\\\n${path}\nПривет";
  let calls = 0;
  const client = await connect(t, {
    ...unusedConnection,
    client: {
      callMethod: async (lib, method, args) => {
        calls++;
        assert.equal(lib, "tools");
        assert.equal(method, "put_url_text_server");
        assert.deepEqual(args, [path, content]);
      },
    },
  });
  const result = await client.callTool({ name: "wshcm_write_file", arguments: { path, content } });
  assert.notEqual(result.isError, true);
  assert.equal(calls, 1);
});

test("list forwards a JSON string result", { timeout: 10_000 }, async (t) => {
  const listing = '[{"name":"folder","isDirectory":true}]';
  const client = await connect(t, { ...unusedConnection, evaluator: { eval: async () => listing } });
  const result = await client.callTool({ name: "wshcm_list_directory", arguments: { path: "x-local://wt/" } });
  assert.notEqual(result.isError, true);
  assert.equal(result.content[0].text, listing);
});

test("delete passes an exact path to the script", { timeout: 10_000 }, async (t) => {
  const path = "x-local://wt/a$&'file.bs";
  let calls = 0;
  const client = await connect(t, {
    ...unusedConnection,
    evaluator: {
      eval: async (script) =>
        runInNewContext(`(function () { ${script} })()`, {
          DeleteFile: (receivedPath) => {
            calls++;
            assert.equal(receivedPath, path);
          },
        }),
    },
  });
  const result = await client.callTool({ name: "wshcm_delete_file", arguments: { path } });
  assert.notEqual(result.isError, true);
  assert.equal(calls, 1);
});

test("platform errors become MCP tool errors", { timeout: 10_000 }, async (t) => {
  const client = await connect(t, {
    ...unusedConnection,
    evaluator: {
      eval: async () => {
        throw new Error("Access denied");
      },
    },
  });
  const result = await client.callTool({ name: "wshcm_read_file", arguments: { path: "x-local://wt/file.bs" } });
  assert.equal(result.isError, true);
  assert.equal(result.content[0].text, "Access denied");
});

test("invalid input is rejected before calling the platform", { timeout: 10_000 }, async (t) => {
  const client = await connect(t, unusedConnection);
  const result = await client.callTool({ name: "wshcm_read_file", arguments: { path: 123 } });
  assert.equal(result.isError, true);
});
