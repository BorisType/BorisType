import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { localStand } from "./stand.mjs";

test("MCP CLI → stdio → SOAP → local HCM filesystem", { timeout: 180_000 }, async (t) => {
  const stand = localStand();
  stand.exec("test", "-f", "/WebsoftServer/dotnetcore/shared/BorisType.FileSystem.dll");
  const baseline = new Set(stand.evaluators());
  const { client, transport } = stand.createClient();
  let ownedEvaluator;
  let closed = false;
  let failed = false;
  stand.exec("mkdir", "--", stand.directory);

  // Always remove only this run's unique directory. A cleanup failure fails the suite.
  t.after(async () => {
    const errors = [];
    try {
      if (!closed) await client.close();
      const added = stand.evaluators().filter((name) => !baseline.has(name));
      if (added.length) {
        // Exclusive access to the stand is required. Never remove an ambiguous set or a wildcard.
        if (ownedEvaluator && added.length === 1 && added[0] === ownedEvaluator) {
          stand.removeEvaluator(ownedEvaluator);
          t.diagnostic(`Fallback removed this run's leaked evaluator: ${ownedEvaluator}`);
        }
        throw new Error(`CLI left temporary evaluator(s): ${added.join(", ")}`);
      }
      t.diagnostic("Evaluator cleanup confirmed by independent filesystem inspection");
    } catch (error) {
      errors.push(error);
    }
    try {
      stand.exec("rm", "-r", "--", stand.directory);
      assert.equal(stand.exists(stand.directory), false, "Fixture directory must be removed");
      t.diagnostic("Fixture directory cleanup confirmed");
    } catch (error) {
      errors.push(error);
    }
    if (errors.length) throw new AggregateError(errors, "E2E cleanup failed");
  });

  const hashes = Object.fromEntries(
    ["file-operation.bs"].map((name) => [
      name,
      createHash("sha256")
        .update(readFileSync(new URL(`../../resources/${name}`, import.meta.url)))
        .digest("hex"),
    ]),
  );
  t.diagnostic(
    JSON.stringify({
      image: stand.image,
      imageId: stand.imageId,
      carrier: "CLI/stdio/SOAP/C-runtime/DotNetCoreHost",
      hashes,
      installedDllSha256: stand
        .exec("sha256sum", "/WebsoftServer/dotnetcore/shared/BorisType.FileSystem.dll")
        .toString("utf8")
        .split(/\s/)[0],
    }),
  );
  try {
    await client.connect(transport, { timeout: 35_000 });
  } finally {
    const added = stand.evaluators().filter((name) => !baseline.has(name));
    if (added.length === 1) ownedEvaluator = added[0];
  }
  assert.ok(ownedEvaluator, "Expected exactly one new CLI evaluator; use an exclusive stand");

  /** Stop issuing native calls after the first failure; HTTP timeout does not cancel C execution. */
  async function check(name, callback) {
    await t.test(name, { skip: failed ? "Earlier failure; native series stopped" : false }, async () => {
      try {
        await callback();
      } catch (error) {
        failed = true;
        throw error;
      }
    });
  }
  async function call(name, args) {
    return client.callTool({ name, arguments: args }, { timeout: 35_000 });
  }
  async function text(name, args) {
    const result = await call(name, args);
    assert.notEqual(result.isError, true, `${name}: ${JSON.stringify(result.content)}`);
    assert.equal(result.content.length, 1);
    assert.equal(result.content[0].type, "text");
    return result.content[0].text;
  }

  await check("real CLI initializes and lists only implemented tools", async () => {
    assert.equal(client.getServerVersion().name, "boristype-wshcm");
    const { tools } = await client.listTools({}, { timeout: 5_000 });
    assert.deepEqual(tools.map(({ name }) => name).sort(), [
      "wshcm_delete_file",
      "wshcm_edit_file",
      "wshcm_list_directory",
      "wshcm_read_file",
      "wshcm_search_files",
      "wshcm_write_file",
    ]);
  });

  await check("empty directory lists as an empty JSON array", async () => {
    assert.deepEqual(JSON.parse(await text("wshcm_list_directory", { path: stand.url })), []);
  });

  const cases = [
    ["empty.txt", ""],
    ["whitespace.txt", "  \t\r\n  \n"],
    ["spaces.txt", "  x  "],
    ["line-endings.txt", "a\r\nb\rc\n  "],
    ["numeric.txt", "000123"],
    ["exponent.txt", "1e3"],
    ["boolean.txt", "false"],
    ["unicode.txt", "Привет 👋 中文 é\n"],
    ["escaped.txt", "<tag a=\"quoted\">& ' \\ ${path} $& $` $' $$ &#13; &#32;</tag>\r\nend\r\n"],
  ];
  for (const [name, content] of cases) {
    await check(`read independently seeded UTF-8 bytes: ${name}`, async () => {
      stand.seed(name, content);
      assert.equal(await text("wshcm_read_file", { path: stand.url + name }), content);
    });
    await check(`write and overwrite match independent UTF-8 bytes: ${name}`, async () => {
      const path = stand.url + `written-${name}`;
      await text("wshcm_write_file", { path, content: "stale longer content to be truncated" });
      await text("wshcm_write_file", { path, content });
      // The managed replacement preserves the established write tool UTF-8 BOM contract.
      assert.deepEqual(stand.readBytes(`written-${name}`), Buffer.from(`\uFEFF${content}`, "utf8"));
      assert.equal(await text("wshcm_read_file", { path }), content);
    });
  }

  await check("quoted, dollar and Unicode filename survives all four tools", async () => {
    const name = "quote'-$&-${path}-Привет.txt";
    const path = stand.url + name;
    const content = "literal filename and contents";
    await text("wshcm_write_file", { path, content });
    assert.deepEqual(stand.readBytes(name), Buffer.from(`\uFEFF${content}`));
    assert.equal(await text("wshcm_read_file", { path }), content);
    const entries = JSON.parse(await text("wshcm_list_directory", { path: stand.url }));
    assert.ok(entries.some((entry) => entry.name === name && entry.isDirectory === false));
    await text("wshcm_delete_file", { path });
    assert.equal(stand.exists(`${stand.directory}/${name}`), false);
  });

  await check("listing distinguishes files and directories without returning descendants", async () => {
    stand.exec("mkdir", "--", `${stand.directory}/folder`);
    stand.seed("folder/child.txt", "child");
    const entries = JSON.parse(await text("wshcm_list_directory", { path: stand.url }));
    const expected = cases.flatMap(([name]) => [
      { name, isDirectory: false },
      { name: `written-${name}`, isDirectory: false },
    ]);
    expected.push({ name: "folder", isDirectory: true });
    const sorted = (items) => items.sort((a, b) => a.name.localeCompare(b.name));
    assert.deepEqual(sorted(entries), sorted(expected));
  });

  await check("delete is visible independently and the next read is a tool error", async () => {
    const name = "to-delete.txt";
    stand.seed(name, "delete me");
    await text("wshcm_delete_file", { path: stand.url + name });
    assert.equal(stand.exists(`${stand.directory}/${name}`), false);
    const result = await call("wshcm_read_file", { path: stand.url + name });
    assert.equal(result.isError, true);
  });

  await check("schema rejects invalid arguments and connection remains usable", async () => {
    const result = await call("wshcm_read_file", { path: 123 });
    assert.equal(result.isError, true);
    assert.equal(await text("wshcm_read_file", { path: stand.url + "numeric.txt" }), "000123");
  });

  await check("normal stdio EOF removes the CLI evaluator", async () => {
    await client.close();
    closed = true;
    assert.deepEqual(
      stand.evaluators().filter((name) => !baseline.has(name)),
      [],
    );
  });

  for (const signal of ["SIGTERM", "SIGINT"]) {
    await check(`CLI removes its evaluator after ${signal} plus EOF`, async () => {
      const { client: signalClient, transport: signalTransport } = stand.createClient();
      let owned;
      try {
        try {
          await signalClient.connect(signalTransport, { timeout: 35_000 });
        } finally {
          const added = stand.evaluators().filter((name) => !baseline.has(name));
          if (added.length === 1) owned = added[0];
        }
        assert.ok(owned, "Expected exactly one new CLI evaluator; use an exclusive stand");
        const stopped = new Promise((resolve) => {
          signalClient.onclose = resolve;
        });
        process.kill(signalTransport.pid, signal);
        // A concurrent EOF must share cleanup rather than attempt another drop_self.
        await signalClient.close();
        await stopped;
      } finally {
        await signalClient.close();
        const added = stand.evaluators().filter((name) => !baseline.has(name));
        if (owned && added.length === 1 && added[0] === owned) {
          stand.removeEvaluator(owned);
          t.diagnostic(`Fallback removed this run's leaked evaluator: ${owned}`);
        }
        assert.deepEqual(added, [], "Signal shutdown must remove its evaluator without fallback");
      }
    });
  }
});
