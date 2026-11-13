import assert from "node:assert/strict";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { readFileSync } from "node:fs";
import { Client, InMemoryTransport, ProtocolErrorCode } from "@modelcontextprotocol/client";
import { createServer } from "../build/index.js";

async function connect(t, evaluate = () => assert.fail("Unexpected evaluation")) {
  const server = createServer({
    client: { callMethod: () => assert.fail("File tools must use the DLL bridge") },
    evaluator: { eval: evaluate },
  });
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

const hash = "a".repeat(64);

test("MCP initialization advertises the installed package version", async (t) => {
  const client = await connect(t);
  const { version } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  assert.deepEqual(client.getServerVersion(), { name: "boristype-wshcm", version });
});
const wire = (body) => JSON.stringify(JSON.stringify(body));
const readBody = (content) => ({
  apiVersion: 2,
  content,
  sha256: hash,
  bom: false,
  startLine: 1,
  endLine: content.split(/\r\n|\r|\n/).length,
  totalLines: content.split(/\r\n|\r|\n/).length,
  startOffset: 0,
  endOffset: content.length,
  totalLength: content.length,
});

async function primed(t, evaluate, content = "abc") {
  let reading = true;
  const client = await connect(t, (script) => (reading ? wire(readBody(content)) : evaluate(script)));
  const result = await client.callTool({ name: "wshcm_read_file", arguments: { path } });
  assert.notEqual(result.isError, true, JSON.stringify(result));
  reading = false;
  return { client, readToken: JSON.parse(result.content[0].text).readToken };
}

test("MCP advertises nine file tools, xquery and three XML object tools", async (t) => {
  const client = await connect(t);
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map(({ name }) => name).sort(), [
    "wshcm_create_directory",
    "wshcm_delete_file",
    "wshcm_edit_file",
    "wshcm_get_file_info",
    "wshcm_get_form",
    "wshcm_get_object",
    "wshcm_list_directory",
    "wshcm_move_file",
    "wshcm_read_file",
    "wshcm_save_object",
    "wshcm_search_files",
    "wshcm_write_file",
    "wshcm_xquery",
  ]);
  assert.equal(tools.find(({ name }) => name === "wshcm_edit_file").annotations.idempotentHint, false);
  for (const tool of tools) {
    assert.equal(tool.inputSchema.type, "object");
    assert.ok(
      tool.inputSchema.required.includes(
        { wshcm_get_form: "formUrl", wshcm_get_object: "id", wshcm_save_object: "xml", wshcm_xquery: "query", wshcm_move_file: "source" }[
          tool.name
        ] ?? "path",
      ),
    );
  }
});

test("unknown tools reject with a protocol error", async (t) => {
  const client = await connect(t);
  await assert.rejects(client.callTool({ name: "wshcm_unknown", arguments: {} }), { code: ProtocolErrorCode.InvalidParams });
});

const path = "x-local://wt/a$&'\\${other}.bs";
const content = "  001\r\n'quoted'\\\n${path}\nПривет";
for (const fixture of [
  { tool: "read_file", method: "ReadJson", input: {}, request: {}, body: readBody(content), json: readBody(content) },
  {
    tool: "write_file",
    method: "WriteJson",
    input: { content },
    request: { content, mode: "create" },
    body: { apiVersion: 2, bytesWritten: 44, sha256: hash },
    text: `File written: ${path}`,
  },
  {
    tool: "list_directory",
    method: "ListJson",
    input: {},
    request: {},
    body: { apiVersion: 2, entries: [{ name: "folder", isDirectory: true }] },
    json: [{ name: "folder", isDirectory: true }],
  },
  {
    tool: "delete_file",
    method: "DeleteJson",
    input: {},
    request: {},
    body: { apiVersion: 2, deleted: true },
    text: `File deleted: ${path}`,
  },
  {
    tool: "edit_file",
    method: "EditJson",
    input: { edits: [{ oldText: "a'\\${x}", newText: content }], dryRun: true, expectedSha256: hash },
    request: {
      edits: [{ oldText: "a'\\${x}", newText: content }],
      dryRun: true,
      expectedSha256: hash,
      allowedRanges: [{ start: 0, end: content.length }],
    },
    body: { apiVersion: 2, status: "dry_run", editsCount: 1, previousSha256: hash, sha256: hash, content },
    json: { apiVersion: 2, status: "dry_run", editsCount: 1, previousSha256: hash, sha256: hash, content },
  },
]) {
  test(`${fixture.tool} preserves the public result and executes the physical-path DLL ABI (${fixture.method})`, async (t) => {
    let calls = 0;
    const evaluate = async (script) =>
      runInNewContext(`(function () { ${script} })()`, {
        UrlToFilePath(url) {
          assert.equal(url, path);
          return "/server/physical";
        },
        EncodeJson: JSON.stringify,
        tools: {
          dotnet_host: {
            Object: {
              GetAssembly(name) {
                assert.equal(name, "BorisType.FileSystem.dll");
                return {
                  CallClassStaticMethod(type, method, args) {
                    calls++;
                    assert.equal(type, "BorisType.FileSystem.Files");
                    assert.equal(method, fixture.method);
                    assert.equal(args[0], "/server/physical");
                    assert.deepEqual(JSON.parse(args[1]), fixture.request);
                    return JSON.stringify(fixture.body);
                  },
                };
              },
            },
          },
        },
      });
    const { client, readToken } =
      fixture.tool === "edit_file" ? await primed(t, evaluate, content) : { client: await connect(t, evaluate) };
    const result = await client.callTool({
      name: `wshcm_${fixture.tool}`,
      arguments: { path, ...fixture.input, ...(readToken ? { readToken } : {}) },
    });
    assert.notEqual(result.isError, true, JSON.stringify(result));
    if (fixture.json) {
      const actual = JSON.parse(result.content[0].text);
      if (fixture.tool === "read_file") {
        assert.equal(typeof actual.readToken, "string");
        delete actual.readToken;
      }
      assert.deepEqual(actual, fixture.json);
    } else assert.equal(result.content[0].text, fixture.text);
    assert.equal(calls, 1);
  });
}

for (const content of ["", "\n\t", "  a\r\nb\rc\n  ", "\uFEFFabc"]) {
  test(`read accepts exact managed text without stripping a second BOM: ${JSON.stringify(content)}`, async (t) => {
    const client = await connect(t, async () => wire(readBody(content)));
    const result = await client.callTool({ name: "wshcm_read_file", arguments: { path } });
    assert.notEqual(result.isError, true);
    assert.equal(JSON.parse(result.content[0].text).content, content);
  });
}

const operations = [
  ["read_file", {}],
  ["write_file", { content: "x" }],
  ["list_directory", {}],
  ["delete_file", {}],
  ["edit_file", { edits: [] }],
];
for (const [name, extra] of operations) {
  for (const value of [undefined, 123, "not json", "null", JSON.stringify("{}"), wire({ apiVersion: 99 }), wire({ apiVersion: 2 })]) {
    test(`${name} rejects malformed or incompatible DLL payload ${String(value)}`, async (t) => {
      const { client, readToken } =
        name === "edit_file" ? await primed(t, async () => value) : { client: await connect(t, async () => value) };
      const result = await client.callTool({ name: `wshcm_${name}`, arguments: { path, ...extra, ...(readToken ? { readToken } : {}) } });
      assert.equal(result.isError, true);
    });
  }
  test(`${name} exposes structured DLL errors as tool errors`, async (t) => {
    const evaluate = async () => wire({ apiVersion: 2, error: { code: "AccessDenied", message: "Access denied" } });
    const { client, readToken } = name === "edit_file" ? await primed(t, evaluate) : { client: await connect(t, evaluate) };
    const result = await client.callTool({ name: `wshcm_${name}`, arguments: { path, ...extra, ...(readToken ? { readToken } : {}) } });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /AccessDenied.*Access denied/);
  });
}

for (const [name, extra] of [
  ["read_file", { path: "file:///tmp" }],
  ["write_file", { content: "a\0b" }],
  ["write_file", { content: "中".repeat(400000) }],
  ["edit_file", { edits: [{ oldText: "", newText: "x" }] }],
  ["edit_file", { edits: [], expectedSha256: "bad" }],
  ["delete_file", { unknown: true }],
]) {
  test(`invalid ${name} input never reaches HCM: ${Object.keys(extra)}`, async (t) => {
    let calls = 0;
    const client = await connect(t, async () => {
      calls++;
      return wire(readBody(""));
    });
    const result = await client.callTool({ name: `wshcm_${name}`, arguments: { path, ...extra } });
    assert.equal(result.isError, true);
    assert.equal(calls, 0);
  });
}

test("edit error includes the failing patch number", async (t) => {
  const { client, readToken } = await primed(t, async () =>
    wire({ apiVersion: 2, error: { code: "EditAmbiguous", message: "More than one match", editIndex: 2 } }),
  );
  const result = await client.callTool({ name: "wshcm_edit_file", arguments: { path, edits: [], readToken } });
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /Edit #2.*EditAmbiguous/);
});

test("missing DLL is reported clearly", async (t) => {
  const client = await connect(t, async () => {
    throw new Error("Cannot load BorisType.FileSystem.dll");
  });
  const result = await client.callTool({ name: "wshcm_read_file", arguments: { path } });
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /BorisType.FileSystem.dll/);
});

test("aggregate edit JSON budget is enforced before any evaluator call", async (t) => {
  let calls = 0;
  const { client, readToken } = await primed(t, async () => {
    calls++;
    return wire(readBody(""));
  });
  const edits = Array.from({ length: 100 }, () => ({ oldText: "a".repeat(90000), newText: "b" }));
  const result = await client.callTool({ name: "wshcm_edit_file", arguments: { path, edits, readToken } });
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /Request JSON exceeds/);
  assert.equal(calls, 0);
});
