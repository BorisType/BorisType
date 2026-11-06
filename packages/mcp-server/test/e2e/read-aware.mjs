import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { localStand } from "./stand.mjs";

test("read grants, line ranges and nine file tools on the local C runtime", { timeout: 120000 }, async (t) => {
  const stand = localStand();
  const baseline = new Set(stand.evaluators());
  const first = stand.createClient();
  const second = stand.createClient();
  stand.exec("mkdir", "--", stand.directory);
  t.after(async () => {
    const errors = [];
    for (const { client } of [first, second])
      try {
        await client.close();
      } catch (error) {
        errors.push(error);
      }
    try {
      assert.deepEqual(
        stand.evaluators().filter((name) => !baseline.has(name)),
        [],
      );
    } catch (error) {
      errors.push(error);
    }
    try {
      stand.exec("rm", "-r", "--", stand.directory);
      assert.equal(stand.exists(stand.directory), false);
    } catch (error) {
      errors.push(error);
    }
    if (errors.length) throw new AggregateError(errors, "Native read-aware cleanup failed");
  });
  const dll = "/WebsoftServer/dotnetcore/shared/BorisType.FileSystem.dll";
  t.diagnostic(
    JSON.stringify({
      image: stand.image,
      imageId: stand.imageId,
      carrier: "CLI/stdio/SOAP/C-runtime/DotNetCoreHost",
      installedDllSha256: stand.exec("sha256sum", dll).toString().split(/\s/)[0],
      templateSha256: createHash("sha256")
        .update(readFileSync(new URL("../../resources/file-operation.bs", import.meta.url)))
        .digest("hex"),
    }),
  );
  await first.client.connect(first.transport, { timeout: 35000 });
  await second.client.connect(second.transport, { timeout: 35000 });
  const call = (tool, args, client = first.client) => client.callTool({ name: "wshcm_" + tool, arguments: args }, { timeout: 20000 });
  const json = async (tool, args, client) => {
    const result = await call(tool, args, client);
    assert.notEqual(result.isError, true, JSON.stringify(result));
    return JSON.parse(result.content[0].text);
  };
  const denied = async (tool, args, code, client) => {
    const result = await call(tool, args, client);
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, new RegExp(code));
  };
  const path = stand.url + "lines.bs";
  const original = "first\r\n👋 known\rhidden\n";
  stand.seed("lines.bs", "\uFEFF" + original);
  await denied("edit_file", { path, readToken: "guess", edits: [{ oldText: "first", newText: "lost" }] }, "ReadRequired");
  const line = await json("read_file", { path, startLine: 2, endLine: 2 });
  assert.equal(line.content, "👋 known\r");
  assert.equal(line.startOffset, 7);
  assert.equal(line.endOffset, 16);
  assert.equal(
    line.sha256,
    createHash("sha256")
      .update(Buffer.from("\uFEFF" + original))
      .digest("hex"),
  );
  await denied("edit_file", { path, readToken: line.readToken, edits: [] }, "ReadRequired", second.client);
  await denied("write_file", { path, mode: "overwrite", readToken: line.readToken, content: "lost" }, "ReadRequired");
  await denied(
    "edit_file",
    {
      path,
      readToken: line.readToken,
      edits: [
        { oldText: "known", newText: "seen" },
        { oldText: "hidden", newText: "lost" },
      ],
    },
    "ReadRequired",
  );
  assert.deepEqual(stand.readBytes("lines.bs"), Buffer.from("\uFEFF" + original));
  const reread = await json("read_file", { path, startLine: 2, endLine: 2 });
  const applied = await json("edit_file", {
    path,
    readToken: reread.readToken,
    edits: [
      { oldText: "known", newText: "seen" },
      { oldText: "seen", newText: "SEEN" },
    ],
  });
  assert.equal(applied.status, "applied");
  assert.deepEqual(stand.readBytes("lines.bs"), Buffer.from("\uFEFFfirst\r\n👋 SEEN\rhidden\n"));
  await denied("edit_file", { path, readToken: reread.readToken, edits: [] }, "ReadRequired");
  const external = await json("read_file", { path });
  stand.seed("lines.bs", "external");
  await denied("edit_file", { path, readToken: external.readToken, edits: [{ oldText: "first", newText: "lost" }] }, "Conflict");
  assert.deepEqual(stand.readBytes("lines.bs"), Buffer.from("external"));
  await denied("write_file", { path, content: "lost" }, "AlreadyExists");
  const full = await json("read_file", { path });
  const written = await call("write_file", { path, mode: "overwrite", readToken: full.readToken, content: "guarded" });
  assert.notEqual(written.isError, true);
  assert.deepEqual(stand.readBytes("lines.bs"), Buffer.from("\uFEFFguarded"));

  const folder = stand.url + "nested/child/";
  assert.equal((await json("create_directory", { path: folder })).created, true);
  assert.equal((await json("create_directory", { path: folder })).created, false);
  const bytes = Buffer.from([0xff, 0, 0xef, 0xbb, 0xbf, 10, 13]);
  const source = stand.url + "binary";
  const destination = folder + "Привет ' $&.dat";
  stand.seed("binary", bytes);
  const info = await json("get_file_info", { path: source });
  assert.equal(info.sizeBytes, 7);
  assert.equal(info.isDirectory, false);
  assert.equal(info.readToken, undefined);
  assert.equal((await json("move_file", { source, destination })).moved, true);
  assert.equal(stand.exists(stand.directory + "/binary"), false);
  assert.deepEqual(stand.readBytes("nested/child/Привет ' $&.dat"), bytes);
  stand.seed("other", Buffer.from([1, 2, 3]));
  await denied("move_file", { source: stand.url + "other", destination }, "AlreadyExists");
  assert.deepEqual(stand.readBytes("other"), Buffer.from([1, 2, 3]));
  const dirInfo = await json("get_file_info", { path: folder });
  assert.equal(dirInfo.isDirectory, true);
  assert.equal(dirInfo.sizeBytes, undefined);
  t.diagnostic(
    "PASS: absent/foreign/consumed tokens, UTF16 ranges/BOM/CRLF, unread patch rollback, external stale read, create-only/guarded overwrite, mkdir/info/binary rename/no-overwrite",
  );
});
