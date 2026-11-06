import assert from "node:assert/strict";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { createServer } from "../build/index.js";

const path = "x-local://wt/data.bs";
const hash = "a".repeat(64);
const slice = (startOffset = 0, endOffset = 8) => ({
  apiVersion: 2,
  content: "a\r\n👋\rb\n".slice(startOffset, endOffset),
  sha256: hash,
  bom: false,
  startLine: startOffset === 0 ? 1 : 2,
  endLine: endOffset === 8 ? 4 : 2,
  totalLines: 4,
  startOffset,
  endOffset,
  totalLength: 8,
});

async function connect(t, dispatch) {
  const server = createServer({
    evaluator: {
      eval: async (script) =>
        runInNewContext(`(function(){${script}})()`, {
          UrlToFilePath: (url) => "/server/" + url.slice(10),
          EncodeJson: JSON.stringify,
          tools: {
            dotnet_host: {
              Object: {
                GetAssembly: () => ({
                  CallClassStaticMethod: (_type, method, args) => JSON.stringify(dispatch(method, args[0], JSON.parse(args[1]))),
                }),
              },
            },
          },
        }),
    },
  });
  const client = new Client({ name: "guard-test", version: "1" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  t.after(async () => {
    await client.close();
    await server.close();
  });
  await server.connect(b);
  await client.connect(a);
  return async (tool, input = {}) =>
    client.callTool({ name: "wshcm_" + tool, arguments: tool === "move_file" ? input : { path, ...input } });
}
const data = (result) => {
  assert.notEqual(result.isError, true, JSON.stringify(result));
  return JSON.parse(result.content[0].text);
};

test("a guessed patch and correct hash cannot replace a read in this server", async (t) => {
  let calls = 0;
  const call = await connect(t, () => {
    calls++;
    return { apiVersion: 2, status: "applied", editsCount: 1, previousSha256: hash, sha256: hash };
  });
  const result = await call("edit_file", { expectedSha256: hash, readToken: "guessed", edits: [{ oldText: "a", newText: "A" }] });
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /ReadRequired/);
  assert.equal(calls, 0);
});

test("range reads return tokens and forward only granted coverage to the DLL", async (t) => {
  const requests = [];
  const call = await connect(t, (method, _physical, options) => {
    requests.push({ method, options });
    if (method === "ReadJson") return slice(3, 6);
    return { apiVersion: 2, status: "applied", editsCount: 1, previousSha256: hash, sha256: hash };
  });
  const read = data(await call("read_file", { startLine: 2, endLine: 2 }));
  assert.equal(read.content, "👋\r");
  assert.equal(typeof read.readToken, "string");
  data(await call("edit_file", { readToken: read.readToken, edits: [{ oldText: "👋", newText: "hi" }] }));
  assert.deepEqual(requests[0].options, { startLine: 2, endLine: 2 });
  assert.deepEqual(requests[1].options, {
    edits: [{ oldText: "👋", newText: "hi" }],
    dryRun: false,
    expectedSha256: hash,
    allowedRanges: [{ start: 3, end: 6 }],
  });
  const reused = await call("edit_file", { readToken: read.readToken, edits: [] });
  assert.equal(reused.isError, true);
  assert.match(reused.content[0].text, /ReadRequired/);
});

test("a token from another server instance is rejected even for identical bytes", async (t) => {
  const first = await connect(t, () => slice());
  const token = data(await first("read_file")).readToken;
  let calls = 0;
  const second = await connect(t, () => {
    calls++;
    return slice();
  });
  const result = await second("edit_file", { readToken: token, edits: [] });
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /ReadRequired/);
  assert.equal(calls, 0);
});

test("partial reading does not authorize whole-file overwrite", async (t) => {
  let calls = 0;
  const call = await connect(t, () => {
    calls++;
    return slice(3, 6);
  });
  const { readToken } = data(await call("read_file", { startLine: 2, endLine: 2 }));
  const result = await call("write_file", { mode: "overwrite", readToken, content: "replacement" });
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /ReadRequired/);
  assert.equal(calls, 1);
});

test("multiple reads of the same version merge coverage; a changed version revokes the previous token", async (t) => {
  let read = 0;
  const call = await connect(t, (method) => {
    assert.equal(method, "ReadJson");
    return read++ === 0 ? slice(0, 3) : read === 2 ? slice(3, 8) : { ...slice(), sha256: "b".repeat(64) };
  });
  const first = data(await call("read_file", { endLine: 1 }));
  const second = data(await call("read_file", { startLine: 2, readToken: first.readToken }));
  assert.notEqual(first.readToken, second.readToken);
  const third = data(await call("read_file"));
  assert.notEqual(third.readToken, first.readToken);
  const result = await call("edit_file", { readToken: first.readToken, edits: [] });
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /ReadRequired/);
});

test("a later read does not silently grant ranges from an earlier unacknowledged response", async (t) => {
  let count = 0;
  const call = await connect(t, () => (count++ === 0 ? slice(0, 3) : slice(3, 8)));
  const first = data(await call("read_file", { endLine: 1 }));
  const second = data(await call("read_file", { startLine: 2 }));
  assert.notEqual(first.readToken, second.readToken);
  const result = await call("write_file", { mode: "overwrite", readToken: second.readToken, content: "lost" });
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /ReadRequired/);
});

test("create defaults to no overwrite; overwrite passes the full read hash", async (t) => {
  const requests = [];
  const call = await connect(t, (method, _physical, options) => {
    requests.push({ method, options });
    return method === "ReadJson" ? slice() : { apiVersion: 2, bytesWritten: 4, sha256: hash };
  });
  assert.notEqual((await call("write_file", { content: "x" })).isError, true);
  assert.deepEqual(requests[0].options, { content: "x", mode: "create" });
  const { readToken } = data(await call("read_file"));
  assert.notEqual((await call("write_file", { mode: "overwrite", content: "x", readToken })).isError, true);
  assert.deepEqual(requests[2].options, { content: "x", mode: "overwrite", expectedSha256: hash });
});

test("response failure invalidates a mutation token but dryRun does not consume it", async (t) => {
  let fail = false;
  const call = await connect(t, (method) => {
    if (method === "ReadJson") return slice();
    if (fail) throw new Error("Response lost");
    return { apiVersion: 2, status: "dry_run", editsCount: 0, previousSha256: hash, sha256: hash, content: slice().content };
  });
  const { readToken } = data(await call("read_file"));
  data(await call("edit_file", { readToken, edits: [], dryRun: true }));
  fail = true;
  const result = await call("edit_file", { readToken, edits: [] });
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /Response lost/);
  fail = false;
  const retry = await call("edit_file", { readToken, edits: [] });
  assert.equal(retry.isError, true);
  assert.match(retry.content[0].text, /ReadRequired/);
});

test("mkdir and binary metadata use the managed bridge without granting a read token", async (t) => {
  const call = await connect(t, (method, _physical, options) => {
    assert.deepEqual(options, {});
    if (method === "CreateDirectoryJson") return { apiVersion: 2, created: true };
    assert.equal(method, "InfoJson");
    return { apiVersion: 2, name: "binary.dat", isDirectory: false, sizeBytes: 2000000, modifiedUtc: "2020-01-02T03:04:05Z" };
  });
  assert.equal(data(await call("create_directory")).created, true);
  const info = data(await call("get_file_info"));
  assert.equal(info.sizeBytes, 2000000);
  assert.equal(info.readToken, undefined);
});

test("move resolves both server URLs and consumes the source read grant", async (t) => {
  const destination = "x-local://wt/новый ' $&.bs";
  const call = await connect(t, (method, physical, options) => {
    assert.equal(physical, "/server/wt/data.bs");
    if (method === "ReadJson") return slice();
    assert.equal(method, "MoveJson");
    assert.deepEqual(options, { destination: "/server/wt/новый ' $&.bs" });
    return { apiVersion: 2, moved: true };
  });
  const { readToken } = data(await call("read_file"));
  assert.equal(data(await call("move_file", { source: path, destination })).moved, true);
  const result = await call("edit_file", { readToken, edits: [] });
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /ReadRequired/);
});

test("acknowledged adjacent reads authorize full overwrite with only the latest token", async (t) => {
  let reads = 0;
  const call = await connect(t, (method) => {
    if (method === "ReadJson") return reads++ === 0 ? slice(0, 3) : slice(3, 8);
    assert.equal(method, "WriteJson");
    return { apiVersion: 2, bytesWritten: 4, sha256: hash };
  });
  const first = data(await call("read_file", { endLine: 1 }));
  const second = data(await call("read_file", { startLine: 2, readToken: first.readToken }));
  const stale = await call("write_file", { mode: "overwrite", readToken: first.readToken, content: "x" });
  assert.equal(stale.isError, true);
  const valid = await call("write_file", { mode: "overwrite", readToken: second.readToken, content: "x" });
  assert.notEqual(valid.isError, true, JSON.stringify(valid));
});

test("concurrent mutations cannot both consume the same read token", async (t) => {
  let mutations = 0;
  const call = await connect(t, (method) => {
    if (method === "ReadJson") return slice();
    mutations++;
    return { apiVersion: 2, status: "applied", editsCount: 0, previousSha256: hash, sha256: hash };
  });
  const { readToken } = data(await call("read_file"));
  const results = await Promise.all([call("edit_file", { readToken, edits: [] }), call("edit_file", { readToken, edits: [] })]);
  assert.equal(results.filter((result) => result.isError !== true).length, 1);
  assert.equal(results.filter((result) => result.isError === true && /ReadRequired/.test(result.content[0].text)).length, 1);
  assert.equal(mutations, 1);
});
