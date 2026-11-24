import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

test("btc download uses project connection settings, saves binary bytes, and closes the evaluator on success and failure", async (t) => {
  const cwd = await mkdtemp(join(tmpdir(), "btc-download-"));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  let closed = 0;
  let reads = 0;
  const server = createServer(async (req, res) => {
    let body = "";
    for await (const part of req) body += part;
    if (req.method === "GET") return res.end();
    let result = '<Result VALUE-TYPE="bool">1</Result>';
    if (body.includes("<MethodName>execute</MethodName>")) {
      const reply = [
        { kind: "file", size: 2, modified: "v1" },
        { data: "AP8=" },
        { kind: "file", size: 2, modified: "v1" },
        { error: "Missing source" },
      ][reads++];
      result = '<Result VALUE-TYPE="string">' + JSON.stringify(reply) + "</Result>";
    }
    if (body.includes("<MethodName>drop_self</MethodName>")) closed++;
    res.end("<ResultData>" + result + "</ResultData>");
  });
  await new Promise((ready) => server.listen(0, "127.0.0.1", ready));
  t.after(() => new Promise((done) => server.close(done)));
  await writeFile(join(cwd, "btconfig.properties"), "host=127.0.0.1\nport=" + server.address().port + "\n");
  const run = (out) =>
    promisify(execFile)(
      process.execPath,
      [fileURLToPath(new URL("../build/index.js", import.meta.url)), "download", "x-local://wt/example.bin", out],
      { cwd },
    );
  assert.equal(JSON.parse((await run("copy.bin")).stdout).bytes, 2);
  assert.deepEqual(await readFile(join(cwd, "copy.bin")), Buffer.from([0, 255]));
  await assert.rejects(run("missing.bin"), (error) => error.code === 1 && /Missing source/.test(error.stderr));
  assert.equal(closed, 2);
});
