import assert from "node:assert/strict";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { createServer } from "../build/index.js";

async function connect(t, evaluate) {
  const server = createServer({ evaluator: { eval: evaluate } });
  const client = new Client({ name: "search-test", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  t.after(async () => {
    await client.close();
    await server.close();
  });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return client;
}

function response(overrides = {}) {
  return {
    apiVersion: 2,
    matches: [{ path: "lib/код.bs", line: 2, column: 1, text: "needle 中文 👋" }],
    limitReason: null,
    stats: { visitedEntries: 2, filesRead: 1, readBytes: 42 },
    skipped: { links: 0, depth: 0, tooLarge: 0, binary: 0, invalidEncoding: 0, longLines: 0, ioErrors: 0 },
    ...overrides,
  };
}

test("search tool executes the BS resolver and string DLL ABI without changing arguments", async (t) => {
  const path = "x-local://wt/a$&'${other}/";
  const query = "needle ' \\ ${path}\t中文";
  let calls = 0;
  const resultBody = response();
  const client = await connect(t, async (script) =>
    runInNewContext(`(function () { ${script} })()`, {
      UrlToFilePath(url) {
        assert.equal(url, path);
        return "/server/wt/physical";
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
                  assert.equal(type, "BorisType.FileSystem.Search");
                  assert.equal(method, "FindJson");
                  assert.equal(args[0], "/server/wt/physical");
                  const options = JSON.parse(args[1]);
                  assert.equal(options.query, query);
                  assert.equal(options.pattern, "**/*.bs");
                  assert.deepEqual(options.excludePatterns, ["vendor/**"]);
                  return JSON.stringify(resultBody);
                },
              };
            },
          },
        },
      },
    }),
  );
  const result = await client.callTool({
    name: "wshcm_search_files",
    arguments: { path, query, pattern: "**/*.bs", excludePatterns: ["vendor/**"] },
  });
  assert.notEqual(result.isError, true, JSON.stringify(result));
  assert.deepEqual(JSON.parse(result.content[0].text), { root: path, ...resultBody });
  assert.equal(calls, 1);
});

test("name-only search returns relative paths and explicit partial-result information", async (t) => {
  const body = response({ matches: [{ path: "a.bs" }], limitReason: "entries", stats: { visitedEntries: 1, filesRead: 0, readBytes: 0 } });
  const client = await connect(t, async () => JSON.stringify(JSON.stringify(body)));
  const result = await client.callTool({ name: "wshcm_search_files", arguments: { path: "x-local://wt/" } });
  assert.notEqual(result.isError, true);
  assert.deepEqual(JSON.parse(result.content[0].text), { root: "x-local://wt/", ...body });
});

for (const name of ["folder/a\\b.bs", "C:foo.bs"]) {
  test(`relative Linux filename is preserved as data: ${name}`, async (t) => {
    const body = response({ matches: [{ path: name }] });
    const client = await connect(t, async () => JSON.stringify(JSON.stringify(body)));
    const result = await client.callTool({ name: "wshcm_search_files", arguments: { path: "x-local://wt/" } });
    assert.notEqual(result.isError, true, JSON.stringify(result));
    assert.equal(JSON.parse(result.content[0].text).matches[0].path, name);
  });
}

test("MCP response budget includes the root URL envelope", async (t) => {
  const root = "x-local://" + "中".repeat(4086);
  const body = response({
    matches: Array.from({ length: 32 }, (_, index) => ({ path: "a.bs", line: index + 1, column: 1, text: "needle" + "x".repeat(7894) })),
  });
  const client = await connect(t, async () => JSON.stringify(JSON.stringify(body)));
  const result = await client.callTool({ name: "wshcm_search_files", arguments: { path: root, query: "needle" } });
  assert.notEqual(result.isError, true);
  assert.ok(Buffer.byteLength(result.content[0].text, "utf8") <= 262144);
  const parsed = JSON.parse(result.content[0].text);
  assert.equal(parsed.limitReason, "output");
  assert.ok(parsed.matches.length > 0 && parsed.matches.length < 32);
});

for (const wire of [
  undefined,
  123,
  "not json",
  "null",
  "{}",
  JSON.stringify("not json"),
  JSON.stringify("null"),
  JSON.stringify(JSON.stringify(response({ apiVersion: 99 }))),
  JSON.stringify(JSON.stringify(response({ matches: [{ path: "../escape" }] }))),
  JSON.stringify(JSON.stringify(response({ matches: [{ path: "a", line: 1 }] }))),
  JSON.stringify(JSON.stringify(response({ stats: {} }))),
]) {
  test(`search rejects malformed or incompatible DLL response: ${String(wire).slice(0, 90)}`, async (t) => {
    const client = await connect(t, async () => wire);
    const result = await client.callTool({ name: "wshcm_search_files", arguments: { path: "x-local://wt/" } });
    assert.equal(result.isError, true);
  });
}

test("unavailable DLL is a tool error", async (t) => {
  const client = await connect(t, async () => {
    throw new Error("Cannot load BorisType.FileSystem.dll");
  });
  const result = await client.callTool({ name: "wshcm_search_files", arguments: { path: "x-local://wt/" } });
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /BorisType.FileSystem.dll/);
});

for (const args of [
  { path: "file:///tmp" },
  { path: "x-local://wt/", maxResults: 0 },
  { path: "x-local://wt/", regex: true },
  { path: "x-local://wt/", unknown: true },
]) {
  test(`invalid search arguments never reach HCM: ${JSON.stringify(args)}`, async (t) => {
    const client = await connect(t, () => assert.fail("Invalid input reached evaluator"));
    const result = await client.callTool({ name: "wshcm_search_files", arguments: args });
    assert.equal(result.isError, true);
  });
}
