import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { localStand } from "./stand.mjs";

// Explicit command only: requires an already running stand and separately installed DLL.
test("MCP search → BS path resolver → installed .NET DLL", { timeout: 120_000 }, async (t) => {
  const stand = localStand();
  const dll = "/WebsoftServer/dotnetcore/shared/BorisType.FileSystem.dll";
  stand.exec("test", "-f", dll);
  const baseline = new Set(stand.evaluators());
  const { client, transport } = stand.createClient();
  let owned;
  stand.exec("mkdir", "-p", "--", `${stand.directory}/sub`, `${stand.directory}/vendor`);
  t.after(async () => {
    const errors = [];
    try {
      await client.close();
      const added = stand.evaluators().filter((name) => !baseline.has(name));
      if (owned && added.length === 1 && added[0] === owned) stand.removeEvaluator(owned);
      assert.deepEqual(added, [], "Search evaluator cleanup must succeed without fallback");
    } catch (error) {
      errors.push(error);
    }
    try {
      stand.exec("rm", "-r", "--", stand.directory);
      assert.equal(stand.exists(stand.directory), false);
    } catch (error) {
      errors.push(error);
    }
    if (errors.length) throw new AggregateError(errors, "Search fixture/evaluator cleanup failed");
  });
  stand.seed("main.bs", "\uFEFFПривет\r\nabc needle\rNEEDLE\n😀 needle");
  stand.seed("sub/deep.bs", "needle nested");
  stand.seed("vendor/ignored.bs", "needle excluded");
  stand.seed("binary.bin", "a\0b");
  stand.seed("codes.log", "id=AB-42\r\nid=ab-07");
  const quotedDirectory = "quote'-$&-${path}-Привет";
  const quotedQuery = "quote ' \\ ${request} $&";
  stand.exec("mkdir", "--", `${stand.directory}/${quotedDirectory}`);
  stand.seed(`${quotedDirectory}/escaped.txt`, quotedQuery);
  stand.exec("ln", "-s", "--", stand.directory, `${stand.directory}/cycle`);
  t.diagnostic(
    JSON.stringify({
      image: stand.image,
      imageId: stand.imageId,
      carrier: "CLI/stdio/SOAP/C-runtime/DotNetCoreHost",
      templateSha256: createHash("sha256")
        .update(readFileSync(new URL("../../resources/search-files.bs", import.meta.url)))
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
  assert.ok(owned, "Exclusive stand required: expected one new evaluator");
  async function search(options) {
    const result = await client.callTool({ name: "wshcm_search_files", arguments: { path: stand.url, ...options } }, { timeout: 20_000 });
    assert.notEqual(result.isError, true, JSON.stringify(result.content));
    return JSON.parse(result.content[0].text);
  }
  // Any failure throws and stops the series; no native retry after a timeout.
  const names = await search({ pattern: "**/*.bs", excludePatterns: ["vendor/**"] });
  assert.deepEqual(names.matches, [{ path: "main.bs" }, { path: "sub/deep.bs" }]);
  assert.equal(names.stats.readBytes, 0);
  assert.equal(names.skipped.links, 1);
  const content = await search({ pattern: "*.bs", query: "needle", ignoreCase: true, excludePatterns: ["vendor/**"] });
  assert.deepEqual(content.matches, [
    { path: "main.bs", line: 2, column: 5, text: "abc needle" },
    { path: "main.bs", line: 3, column: 1, text: "NEEDLE" },
    { path: "main.bs", line: 4, column: 4, text: "😀 needle" },
    { path: "sub/deep.bs", line: 1, column: 1, text: "needle nested" },
  ]);
  assert.equal(content.limitReason, null);
  const limited = await search({ query: "needle", ignoreCase: true, maxResults: 1 });
  assert.equal(limited.matches.length, 1);
  assert.equal(limited.limitReason, "results");
  const binary = await search({ query: "needle" });
  assert.equal(binary.skipped.binary, 1);
  const regex = await search({ pattern: "*.log", query: "[a-z]{2}-\\d+", regex: true, ignoreCase: true });
  assert.deepEqual(regex.matches, [
    { path: "codes.log", line: 1, column: 4, text: "id=AB-42" },
    { path: "codes.log", line: 2, column: 4, text: "id=ab-07" },
  ]);
  const quotedRoot = stand.url + quotedDirectory + "/";
  const quoted = await search({ path: quotedRoot, query: quotedQuery });
  assert.equal(quoted.root, quotedRoot);
  assert.deepEqual(quoted.matches, [{ path: "escaped.txt", line: 1, column: 1, text: quotedQuery }]);
  t.diagnostic(
    "PASS: name/content/Unicode/newline/link/result-limit/binary/regex/quoted-path-and-query checks; cleanup checked separately",
  );
});
