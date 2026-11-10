import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { WshcmClient } from "@boristype/ws-client";
import { localStand } from "./stand.mjs";

test("XML object MVP through CLI/stdio/SOAP on an exclusive local stand", { timeout: 120000 }, async (t) => {
  const stand = localStand();
  const baseline = new Set(stand.evaluators());
  const { client, transport } = stand.createClient();
  const independent = new WshcmClient({
    host: stand.host,
    port: 80,
    username: process.env.WSHCM_E2E_USERNAME,
    password: process.env.WSHCM_E2E_PASSWORD,
    overHttps: false,
    requestTimeout: 35000,
  });
  let ownedEvaluatorName;
  let independentReady = false;
  const callMethod = independent.callMethod.bind(independent);
  independent.callMethod = (library, method, args) => {
    if (library === "tools" && method === "put_url_text_server") {
      // Capture the exact owned URL before upload, including a lost acknowledgement.
      const match = /^x-local:\/\/wt\/(unsafe_eval_[a-zA-Z0-9]{32}\.bs)$/.exec(args[0]);
      assert.ok(match, "Unexpected independent evaluator upload URL");
      assert.ok(!baseline.has(match[1]), "Refusing to own a pre-existing evaluator");
      ownedEvaluatorName = match[1];
    }
    return callMethod(library, method, args);
  };
  const evaluator = independent.createEvaluator();
  const ownedIds = new Set();
  const marker = `bt-xml-e2e-${randomUUID()}`;
  let failed = false;
  t.diagnostic(
    JSON.stringify({ image: stand.image, imageId: stand.imageId, carrier: "CLI/stdio/SOAP/native XML API; no BorisType DLL", marker }),
  );
  t.after(async () => {
    try {
      // Do not call eval after initialization failure: that would retry the upload.
      if (!independentReady) return;
      // Reconcile a create whose response was lost using this run's unique code only.
      const discovered = JSON.parse(
        await evaluator.eval(
          `var ids = []; var item; for (item in XQuery('for $c in cost_centers where $c/code = "${marker}" return $c')) {ids.push(StrInt(item.id));} return EncodeJson(ids);`,
        ),
      );
      for (const id of discovered) ownedIds.add(id);
      // Deletion is deliberately outside the product API; only IDs allocated by this run.
      for (const id of ownedIds) {
        assert.match(id, /^[1-9]\d{0,19}$/);
        const result = JSON.parse(
          await evaluator.eval(
            `var id = Int('${id}'); DeleteDoc(UrlFromDocID(id), true); var opened = false; try {OpenDoc(UrlFromDocID(id)); opened = true;} catch(e) {} return EncodeJson({id:StrInt(id),rows:ArrayCount(XQuery('for $c in cost_centers where $c/id = ${id} return $c')),trash:ArrayCount(XQuery('for $t in trash_docs where $t/id = ${id} return $t')),opened:opened});`,
          ),
        );
        assert.deepEqual(result, { id, rows: 0, trash: 0, opened: false });
        t.diagnostic(`Independent object cleanup: ${id}, rows=0, trash=0, opened=false`);
      }
    } finally {
      try {
        if (independentReady) assert.equal(await evaluator.close(), true, "Independent evaluator cleanup");
      } finally {
        try {
          if (ownedEvaluatorName && stand.evaluators().includes(ownedEvaluatorName)) {
            stand.removeEvaluator(ownedEvaluatorName);
            t.diagnostic("Recovered exact owned independent evaluator after incomplete initialization/cleanup");
          }
        } finally {
          await client.close();
          assert.deepEqual(
            stand.evaluators().filter((name) => !baseline.has(name)),
            [],
            "CLI/evaluator debris after close",
          );
        }
      }
    }
  });
  await independent.initialize();
  await evaluator.initialize();
  independentReady = true;
  await client.connect(transport, { timeout: 35000 });
  async function call(name, args, error = false) {
    const result = await client.callTool({ name: `wshcm_${name}`, arguments: args }, { timeout: 35000 });
    const body = JSON.parse(result.content[0].text);
    // Remember a known allocated ID even when Save/readback returned a product error.
    if (name === "save_object" && args.mode === "create" && body.id) ownedIds.add(body.id);
    assert.equal(result.isError === true, error, JSON.stringify(body));
    return body;
  }
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
  const formUrl = "x-local://wtv/wtv_cost_center.xmd";
  let id;
  await check("expanded native form without inherited file traversal", async () => {
    const form = await call("get_form", { formUrl });
    assert.equal(form.root, "cost_center");
    assert.match(form.xml, /<doc_info[\s>]/);
    assert.match(form.xml, /<creation[\s>]/);
    assert.doesNotMatch(form.xml, /<INHERIT[\s>]/);
  });
  await check("create and full read preserve quotes, Unicode and exact identity", async () => {
    const name = "Привет 👋 'quoted' ${request} &amp; &#49;";
    const created = await call("save_object", {
      mode: "create",
      formUrl,
      xml: `<cost_center><code>${marker}</code><name>${name}</name><parent_id>9007199254740993</parent_id><comment>omit-later</comment></cost_center>`,
    });
    id = created.id;
    assert.match(id, /^\d{19}$/);
    assert.equal(created.writeStatus, "saved");
    assert.match(created.xml, /Привет 👋 'quoted' \$\{request\} &amp; 1/);
    const read = await call("get_object", { id });
    assert.equal(read.formUrl, formUrl);
    assert.equal(read.id, id);
    assert.equal(read.xml, created.xml);
    assert.ok(read.readToken);
    const unchanged = await call("save_object", { mode: "replace", id, readToken: read.readToken, xml: read.xml });
    assert.equal(BigInt(unchanged.xml.match(/<parent_id>([^<]+)<\/parent_id>/)[1]), 9007199254740993n);
  });
  await check("bad root, field, integer, singleton, identity and XML never change existing object", async () => {
    const before = await call("get_object", { id });
    for (const xml of [
      "<wrong><name>lost</name></wrong>",
      "<cost_center><unknown>lost</unknown></cost_center>",
      "<cost_center><parent_id>NaN</parent_id></cost_center>",
      "<cost_center><name>a</name><name>b</name></cost_center>",
      `<cost_center><id>${BigInt(id) + 1n}</id></cost_center>`,
      "<cost_center><name>unclosed",
      "<cost_center>&unknown;</cost_center>",
      "<cost_center/>trailing-text",
      "<![CDATA[text]]><cost_center/>",
      "<cost_center><name\u00a0>x</name\u00a0></cost_center>",
      "<cost_center><parent_id>18446744073709551616</parent_id></cost_center>",
    ]) {
      const read = await call("get_object", { id });
      const error = await call("save_object", { mode: "replace", id, readToken: read.readToken, xml }, true);
      assert.equal(error.writeStatus, "not_attempted");
      assert.equal((await call("get_object", { id })).xml, before.xml);
    }
  });
  await check("full replacement clears omitted comment and consumes the read token", async () => {
    const read = await call("get_object", { id });
    const replaced = await call("save_object", {
      mode: "replace",
      id,
      readToken: read.readToken,
      xml: `<cost_center><code>${marker}</code><name>replaced</name></cost_center>`,
    });
    assert.equal(replaced.id, id);
    assert.match(replaced.xml, /<name>replaced<\/name>/);
    assert.doesNotMatch(replaced.xml, /omit-later/);
    const consumed = await call("save_object", { mode: "replace", id, readToken: read.readToken, xml: "<cost_center/>" }, true);
    assert.equal(consumed.writeStatus, "not_attempted");
  });
  await check("unchanged read XML can be submitted as a full replacement", async () => {
    const read = await call("get_object", { id });
    const saved = await call("save_object", { mode: "replace", id, readToken: read.readToken, xml: read.xml });
    assert.match(saved.xml, /<name>replaced<\/name>/);
  });
  await check("external stale change is detected before Save", async () => {
    const read = await call("get_object", { id });
    await evaluator.eval(
      `var doc = OpenDoc(UrlFromDocID(Int('${id}'))); doc.TopElem.name = 'external-writer'; doc.Save(); return 'changed';`,
    );
    const conflict = await call(
      "save_object",
      { mode: "replace", id, readToken: read.readToken, xml: "<cost_center><name>stale</name></cost_center>" },
      true,
    );
    assert.equal(conflict.error.code, "Conflict");
    assert.equal(conflict.writeStatus, "not_attempted");
    assert.match((await call("get_object", { id })).xml, /external-writer/);
  });
  await check("missing object does not turn replace into create", async () => {
    const missing = await call("get_object", { id: "1" }, true);
    assert.equal(missing.writeStatus, "not_attempted");
    const noRead = await call("save_object", { mode: "replace", id: "1", readToken: randomUUID(), xml: "<cost_center/>" }, true);
    assert.equal(noRead.writeStatus, "not_attempted");
  });
});
