import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { localStand } from "./stand.mjs";

// Explicit stand/DLL prerequisite, unique bounded fixtures, sequential calls, no native retry.
test("managed edit preserves bytes and refuses stale or ambiguous patches through real MCP/SOAP", { timeout: 120_000 }, async (t) => {
  const stand = localStand();
  const dll = "/WebsoftServer/dotnetcore/shared/BorisType.FileSystem.dll";
  stand.exec("test", "-f", dll);
  const baseline = new Set(stand.evaluators());
  const { client, transport } = stand.createClient();
  let owned;
  stand.exec("mkdir", "--", stand.directory);
  t.after(async () => {
    const errors = [];
    try {
      await client.close();
      const added = stand.evaluators().filter((name) => !baseline.has(name));
      if (owned && added.length === 1 && added[0] === owned) stand.removeEvaluator(owned);
      assert.deepEqual(added, [], "Evaluator must clean up without fallback");
    } catch (error) {
      errors.push(error);
    }
    try {
      stand.exec("rm", "-r", "--", stand.directory);
      assert.equal(stand.exists(stand.directory), false);
    } catch (error) {
      errors.push(error);
    }
    if (errors.length) throw new AggregateError(errors, "Edit native cleanup failed");
  });
  t.diagnostic(
    JSON.stringify({
      image: stand.image,
      imageId: stand.imageId,
      carrier: "CLI/stdio/SOAP/C-runtime/DotNetCoreHost",
      templateSha256: createHash("sha256")
        .update(readFileSync(new URL("../../resources/file-operation.bs", import.meta.url)))
        .digest("hex"),
      installedDllSha256: stand.exec("sha256sum", dll).toString("utf8").split(/\s/)[0],
    }),
  );
  try {
    await client.connect(transport, { timeout: 35_000 });
  } finally {
    const added = stand.evaluators().filter((name) => !baseline.has(name));
    if (added.length === 1) owned = added[0];
  }
  assert.ok(owned, "Use an exclusive stand; expected exactly one evaluator");
  async function call(tool, name, args = {}) {
    return client.callTool({ name: `wshcm_${tool}`, arguments: { path: stand.url + name, ...args } }, { timeout: 20_000 });
  }
  async function success(tool, name, args) {
    const result = await call(tool, name, args);
    assert.notEqual(result.isError, true, JSON.stringify(result.content));
    return JSON.parse(result.content[0].text);
  }
  for (const bom of [false, true]) {
    const name = (bom ? "bom" : "plain") + "-quote'-$&-${path}-Привет.txt";
    const text = "Привет\r\nalpha\rTAIL\n";
    const original = Buffer.from((bom ? "\uFEFF" : "") + text);
    stand.seed(name, original);
    const metadata = await success("read_file", name, {});
    assert.equal(metadata.content, text);
    assert.equal(metadata.bom, bom);
    assert.equal(metadata.sha256, createHash("sha256").update(original).digest("hex"));
    const edits = [
      { oldText: "alpha", newText: "beta" },
      { oldText: "beta\rTAIL", newText: "gamma\rTAIL" },
    ];
    const preview = await success("edit_file", name, {
      edits,
      dryRun: true,
      expectedSha256: metadata.sha256,
      readToken: metadata.readToken,
    });
    assert.equal(preview.status, "dry_run");
    assert.equal(preview.content, "Привет\r\ngamma\rTAIL\n");
    assert.deepEqual(stand.readBytes(name), original);
    const applied = await success("edit_file", name, { edits, expectedSha256: preview.previousSha256, readToken: metadata.readToken });
    assert.equal(applied.status, "applied");
    assert.equal(applied.editsCount, 2);
    assert.deepEqual(stand.readBytes(name), Buffer.from((bom ? "\uFEFF" : "") + preview.content));
    const consumed = await call("edit_file", name, { edits: [], readToken: metadata.readToken });
    assert.equal(consumed.isError, true);
    assert.match(consumed.content[0].text, /ReadRequired/);
    const fresh = await success("read_file", name);
    stand.seed(name, (bom ? "\uFEFF" : "") + "changed externally");
    const stale = await call("edit_file", name, { edits: [{ oldText: "gamma", newText: "lost" }], readToken: fresh.readToken });
    assert.equal(stale.isError, true);
    assert.match(stale.content[0].text, /Conflict/);
    assert.deepEqual(stand.readBytes(name), Buffer.from((bom ? "\uFEFF" : "") + "changed externally"));
  }
  stand.seed("overlap", "start aaa end");
  for (const [oldText, code] of [
    ["aa", "EditAmbiguous"],
    ["missing", "EditNotFound"],
  ]) {
    const snapshot = await success("read_file", "overlap");
    const failed = await call("edit_file", "overlap", {
      readToken: snapshot.readToken,
      edits: [
        { oldText: "start", newText: "changed" },
        { oldText, newText: "x" },
      ],
    });
    assert.equal(failed.isError, true);
    assert.match(failed.content[0].text, new RegExp(`Edit #2: ${code}`));
    assert.deepEqual(stand.readBytes("overlap"), Buffer.from("start aaa end"));
  }
  stand.seed("binary", Buffer.from([65, 0, 66]));
  const binary = await call("read_file", "binary");
  assert.equal(binary.isError, true);
  assert.match(binary.content[0].text, /BinaryFile/);
  stand.seed("invalid", Buffer.from([0xff, 0xfe]));
  const invalid = await call("read_file", "invalid");
  assert.equal(invalid.isError, true);
  assert.match(invalid.content[0].text, /InvalidEncoding/);
  stand.exec("ln", "-s", "--", `${stand.directory}/overlap`, `${stand.directory}/alias`);
  const linked = await call("delete_file", "alias");
  assert.equal(linked.isError, true);
  assert.match(linked.content[0].text, /LinkNotAllowed/);
  assert.deepEqual(stand.readBytes("overlap"), Buffer.from("start aaa end"));
  const listing = await success("list_directory", "");
  assert.equal(listing.find(({ name }) => name === "alias").isSymbolicLink, true);
  assert.equal(
    listing.some(({ name }) => name.startsWith(".boristype-")),
    false,
  );
  t.diagnostic(
    "PASS: BOM/no-BOM, preview/apply/hash conflict, sequential rollback, overlap, invalid encoding/binary, links and no temp debris",
  );
});
