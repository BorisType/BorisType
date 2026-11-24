import assert from "node:assert/strict";
import { execFile, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import http from "node:http";
import { promisify } from "node:util";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { startupObjectLibrary } from "../build/core/startup-object-library.js";

const cli = fileURLToPath(new URL("../build/index.js", import.meta.url));
const run = (args) => spawnSync(process.execPath, [cli, "objects", "apply", ...args], { encoding: "utf8" });

test("objects apply documents the preview switch and reads the same native library as the linker", () => {
  const help = run(["--help"]);
  assert.equal(help.status, 0);
  assert.match(help.stdout, /--dry-run/);
  const library = startupObjectLibrary();
  for (const name of ["BtApplyObjectPatch", "BtReadStartupXml", "BtLoadStartupObjects", "BtApplyStartupObject"]) {
    assert.ok(library.includes("function " + name + "("), name);
  }
});

test("invalid file identity and invalid UTF-8 fail before connecting", (t) => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "btc-apply-"));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const dir = path.join(base, "cost_center");
  fs.mkdirSync(dir);
  for (const [name, data, message] of [
    ["0002.xml", "<cost_center/>", /ID/],
    ["18446744073709551616.xml", "<cost_center/>", /ID/],
    ["21.xml", Buffer.from([255]), /UTF-8/i],
    ["22.xml", Buffer.alloc(262145), /256 KiB/],
  ]) {
    const file = path.join(dir, name);
    fs.writeFileSync(file, data);
    const result = run([file, "--port", "1", "--dry-run"]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, message);
  }
});

test("apply refuses an inconsistent acknowledgement or dropped response and never replays the write", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "btc-apply-wire-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const file = path.join(root, "cost_center/37.xml");
  fs.mkdirSync(path.dirname(file));
  fs.writeFileSync(file, "<cost_center><name>Центр</name></cost_center>");
  const receipt = {
    ok: true,
    id: "37",
    objectType: "cost_center",
    phase: "done",
    status: "updated",
    changed: true,
    dryRun: false,
    writeStatus: "saved",
  };
  let writes = 0;
  let closes = 0;
  const server = http.createServer(async (req, res) => {
    let body = "";
    for await (const part of req) body += part;
    if (req.method === "GET") return res.end();
    let result = '<Result VALUE-TYPE="bool">1</Result>';
    if (body.includes("<MethodName>execute</MethodName>")) {
      writes++;
      if (writes === 3) return res.destroy();
      const reply = writes === 1 ? receipt : { ...receipt, dryRun: true };
      result = '<Result VALUE-TYPE="string">' + JSON.stringify(reply) + "</Result>";
    } else if (body.includes("<MethodName>drop_self</MethodName>")) closes++;
    res.end("<ResultData>" + result + "</ResultData>");
  });
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  t.after(() => new Promise((done) => server.close(done)));
  const apply = () =>
    promisify(execFile)(process.execPath, [cli, "objects", "apply", file, "--host", "127.0.0.1", "--port", String(server.address().port)], {
      cwd: root,
    });
  assert.deepEqual(JSON.parse((await apply()).stdout), receipt);
  for (let i = 0; i < 2; i++) {
    await assert.rejects(apply(), (err) => err.code === 1 && /outcome unknown/i.test(err.stderr));
  }
  assert.equal(writes, 3);
  assert.equal(closes, 3);
});
