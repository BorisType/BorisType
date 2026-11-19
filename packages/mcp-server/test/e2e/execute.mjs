import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { test } from "node:test";
import { WshcmApi, WshcmClient } from "@boristype/ws-client";
import { localStand } from "./stand.mjs";

test("BorisScript execution through CLI/stdio/SOAP on the existing local stand", { timeout: 120000 }, async (t) => {
  const stand = localStand();
  const baseline = new Set(stand.evaluators());
  const { client, transport } = stand.createClient();
  let ownedEvaluator;
  let failed = false;
  let fixtureCreated = false;
  t.after(async () => {
    try {
      await client.close();
    } finally {
      if (fixtureCreated) stand.exec("rm", "-rf", "--", stand.directory);
      const added = stand.evaluators().filter((name) => !baseline.has(name));
      if (added.length) {
        if (ownedEvaluator && added.length === 1 && added[0] === ownedEvaluator) stand.removeEvaluator(ownedEvaluator);
        assert.fail("CLI did not clean up its temporary evaluator");
      }
      assert.equal(stand.exists(stand.directory), false);
    }
  });
  await client.connect(transport, { timeout: 35000 });
  t.diagnostic(JSON.stringify({ image: stand.image, imageId: stand.imageId, carrier: "CLI/stdio/SOAP; no BorisType DLL" }));
  async function check(name, body) {
    await t.test(name, { skip: failed ? "Earlier native failure; series stopped" : false }, async () => {
      try {
        await body();
      } catch (error) {
        failed = true;
        throw error;
      }
    });
  }
  async function execute(code, error = false) {
    let result;
    try {
      result = await client.callTool({ name: "wshcm_execute", arguments: { code } }, { timeout: 35000 });
    } finally {
      if (!ownedEvaluator) {
        const added = stand.evaluators().filter((name) => !baseline.has(name));
        if (added.length === 1) ownedEvaluator = added[0];
      }
    }
    assert.ok(ownedEvaluator, "Expected exactly one new evaluator; use an exclusive stand");
    assert.equal(result.isError === true, error, JSON.stringify(result));
    return JSON.parse(result.content[0].text);
  }
  const options = {
    host: stand.host,
    port: 80,
    overHttps: false,
    username: process.env.WSHCM_E2E_USERNAME,
    password: process.env.WSHCM_E2E_PASSWORD,
    requestTimeout: 15000,
  };
  const soap = new WshcmClient(options);
  await soap.initialize();

  await check("library call and diagnostic output", async () => {
    const version = await soap.callMethod("tools", "get_version", ["wtv", false]);
    assert.deepEqual(await execute('print("before"); return tools.get_version("wtv", false);'), {
      ok: true,
      value: version,
      output: ["before"],
      outputTruncated: false,
    });
  });
  await check("typed integer/real, reusable values and exact text", async () => {
    const text = '  Я中👋\r\n\r\n\t"\\ ${codeLiteral} $& \u2028\u2029  ';
    const result = await execute(
      `print(${JSON.stringify(text)}); return {small:-7,big:Int("-9007199254740993"),real:Real("1.25"),text:${JSON.stringify(text)},missing:undefined};`,
    );
    assert.deepEqual(result, {
      ok: true,
      value: { small: -7, big: "-9007199254740993", real: 1.25, text, missing: null },
      output: [text],
      outputTruncated: false,
    });
  });
  await check("print keeps the sign and returns its argument; implicit return is undefined", async () => {
    assert.deepEqual(await execute("return print(-7);"), { ok: true, value: -7, output: ["-7"], outputTruncated: false });
    assert.deepEqual(await execute("var n=1;"), { ok: true, value: null, output: [], outputTruncated: false });
  });
  await check("runtime and syntax errors retain diagnostics and native context", async () => {
    const runtime = await execute('print("before");\nthrow "native-probe-failure";', true);
    assert.equal(runtime.error.phase, "execution");
    assert.match(runtime.error.message, /native-probe-failure/);
    assert.deepEqual(runtime.output, ["before"]);
    const syntax = await execute("return (;", true);
    assert.equal(syntax.error.phase, "execution");
    assert.match(syntax.error.message, /syntax|line/i);
    assert.deepEqual(syntax.output, []);
  });
  await check("diagnostic message and character limits do not abort the script", async () => {
    const many = await execute('for(var i=0;i<260;i++) print("line"); return 7;');
    assert.equal(many.value, 7);
    assert.equal(many.output.length, 256);
    assert.equal(many.outputTruncated, true);
    const large = await execute('print("before"); var s="x"; for(var i=0;i<15;i++) s=s+s; print(s); return 8;');
    assert.equal(large.value, 8);
    assert.deepEqual(large.output, ["before"]);
    assert.equal(large.outputTruncated, true);
  });
  await check("oversized or cyclic return values fail in result phase after execution", async () => {
    for (const body of ['var s="x";for(var i=0;i<16;i++)s=s+s;return s;', "var v={};v.self=v;return v;"]) {
      const result = await execute('print("executed");' + body, true);
      assert.equal(result.error.phase, "result");
      assert.match(result.error.message, /limit|depth/i);
      assert.deepEqual(result.output, ["executed"]);
    }
  });
  await check("native XML/date use the shared XQuery projection", async () => {
    const xml = await execute('return OpenDocFromStr("<row><label>hello</label><item>one</item><item>two</item></row>").TopElem;');
    assert.deepEqual(xml.value, { label: "hello", item: ["one", "two"] });
    const date = await execute('return OptDate("2025-02-03T04:05:06");');
    assert.match(date.value, /^2025-02-03T04:05:06/);
  });
  await check("nonfinite real is a presentation error with prior diagnostics", async () => {
    const result = await execute('print("executed");return Real("NaN");', true);
    assert.equal(result.error.phase, "presentation");
    assert.match(result.error.message, /nonfinite/i);
    assert.deepEqual(result.output, ["executed"]);
  });
  await check("client timeout does not stop bounded native execution", async () => {
    stand.exec("mkdir", "--", stand.directory);
    fixtureCreated = true;
    const short = new WshcmClient({ ...options, requestTimeout: 150 });
    const api = new WshcmApi({ eval: (source) => short.callMethod(`x-local://wt/${ownedEvaluator}`, "execute", [source]) });
    await assert.rejects(
      api.execute({
        code: `PutUrlText(${JSON.stringify(stand.url + "started.txt")},"started");Sleep(1200);PutUrlText(${JSON.stringify(stand.url + "finished.txt")},"completed");return 1;`,
      }),
      (error) => {
        assert.equal(error.details.phase, "transport");
        assert.equal(error.details.executionStatus, "unknown");
        assert.match(error.message, /timed out/);
        return true;
      },
    );
    assert.equal(stand.exists(`${stand.directory}/started.txt`), true, "Server code started before timeout");
    // No execution retry. Independently observe the bounded script finishing
    // before deleting its fixture/evaluator; timeout itself proves no cleanup.
    const deadline = Date.now() + 5000;
    while (!stand.exists(`${stand.directory}/finished.txt`) && Date.now() < deadline) await delay(100);
    assert.equal(
      stand
        .readBytes("finished.txt")
        .toString("utf8")
        .replace(/^\uFEFF/, ""),
      "completed",
    );
    assert.equal(stand.exec("find", stand.directory, "-maxdepth", "1", "-type", "f").toString("utf8").trim().split("\n").length, 2);
  });
});
