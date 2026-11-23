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
            `var id = Int('${id}'); if (ArrayCount(XQuery('for $t in trash_docs where $t/id = ${id} return $t')) != 0) tools.restore_doc(id); DeleteDoc(UrlFromDocID(id), true); var opened = false; try {OpenDoc(UrlFromDocID(id)); opened = true;} catch(e) {} return EncodeJson({id:StrInt(id),rows:ArrayCount(XQuery('for $c in cost_centers where $c/id = ${id} return $c')),trash:ArrayCount(XQuery('for $t in trash_docs where $t/id = ${id} return $t')),opened:opened});`,
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
  await check("registry exposes independently named object types and catalog forms", async () => {
    const objects = await call("list_object_types", { kind: "object", limit: 250 });
    const catalogs = await call("list_object_types", { kind: "catalog", limit: 250 });
    assert.deepEqual(objects.sources, { exchangeObjectTypes: "available", registeredCatalogs: "not_requested" });
    assert.deepEqual(catalogs.sources, { exchangeObjectTypes: "not_requested", registeredCatalogs: "available" });
    const object = objects.items.find(({ name }) => name === "cost_center");
    let catalog = catalogs.items.find(({ name }) => name === "cost_centers");
    for (let offset = catalogs.limit; !catalog && offset < catalogs.total; offset += catalogs.limit) {
      const page = await call("list_object_types", { kind: "catalog", limit: catalogs.limit, offset });
      catalog = page.items.find(({ name }) => name === "cost_centers");
    }
    assert.equal(object?.kind, "object");
    assert.equal(object.formUrl, formUrl);
    assert.equal(object.supportsCustomFields, true);
    assert.equal(Object.hasOwn(object, "customFields"), false);
    assert.equal(catalog?.kind, "catalog");
    assert.equal(catalog.isHier, true);
    assert.equal(catalog.objectType, "cost_center");
    const linked = await call("list_object_types", { objectType: "cost_center" });
    assert.deepEqual(linked.items, [object, catalog]);
    const boundary = await call("list_object_types", { offset: objects.total - 1, limit: 2 });
    assert.equal(boundary.total, objects.total + catalogs.total);
    assert.deepEqual(
      boundary.items.map(({ kind }) => kind),
      ["object", "catalog"],
    );
    t.diagnostic(JSON.stringify({ objectTypes: objects.total, catalogs: catalogs.total, object, catalog }));
  });
  await check("object data types match either side, compose filters and page in catalog order", async () => {
    const before = await call("list_object_data_types", {});
    assert.equal(before.offset, 0);
    assert.equal(before.limit, 100);
    const fixtures = [
      { code: marker + "-primary", primary: "group", secondary: "subdivision" },
      { code: marker + "-secondary", primary: "subdivision", secondary: "group" },
      { code: marker + "-both", primary: "group", secondary: "group" },
      { code: marker + "-unbound", primary: "", secondary: "" },
    ];
    const source = JSON.stringify(JSON.stringify(fixtures));
    try {
      await evaluator.eval(`
var fixture;
var doc;
for (fixture in ParseJson(${source})) {
    doc = OpenNewDoc('x-local://wtv/wtv_object_data_type.xmd');
    doc.TopElem.code = fixture.code;
    doc.TopElem.name = fixture.code;
    doc.TopElem.object_type = fixture.primary;
    doc.TopElem.sec_object_type = fixture.secondary;
    doc.BindToDb(DefaultDb);
    doc.Save();
}
return;
`);
      const all = await call("list_object_data_types", { limit: 250 });
      assert.equal(all.total, before.total + fixtures.length);
      const unbound = all.items.find(({ code }) => code === fixtures[3].code);
      assert.equal(unbound?.primaryObjectType, null);
      assert.equal(unbound?.secondaryObjectType, null);
      const either = await call("list_object_data_types", { objectType: "group", limit: 250 });
      const owned = either.items.filter(({ code }) => code.startsWith(marker));
      assert.equal(owned.length, 3);
      for (const fixture of fixtures.slice(0, 3)) {
        const item = owned.find(({ code }) => code === fixture.code);
        assert.match(item.id, /^[1-9]\d*$/);
        assert.equal(item.primaryObjectType, fixture.primary);
        assert.equal(item.secondaryObjectType, fixture.secondary);
      }
      const first = await call("list_object_data_types", { objectType: "group", limit: 1 });
      const next = await call("list_object_data_types", { objectType: "group", offset: 1, limit: 1 });
      assert.equal(first.total, either.total);
      assert.equal(next.total, either.total);
      assert.deepEqual([...first.items, ...next.items], either.items.slice(0, 2));
      const end = await call("list_object_data_types", { objectType: "group", offset: either.total, limit: 1 });
      assert.equal(end.total, either.total);
      assert.deepEqual(end.items, []);

      const exact = await call("list_object_data_types", {
        objectType: "subdivision",
        primaryObjectType: "group",
        secondaryObjectType: "subdivision",
      });
      assert.deepEqual(
        exact.items.filter(({ code }) => code.startsWith(marker)).map(({ code }) => code),
        [fixtures[0].code],
      );
      const none = await call("list_object_data_types", {
        objectType: "group",
        primaryObjectType: "subdivision",
        secondaryObjectType: "subdivision",
      });
      assert.equal(none.total, 0);
      assert.deepEqual(none.items, []);
      t.diagnostic("Object data type catalog verified with primary, secondary and both-side fixtures");
    } finally {
      const remaining = JSON.parse(
        await evaluator.eval(`
var fixture;
var query;
var row;
var doc;
var remaining = 0;
for (fixture in ParseJson(${source})) {
    query = 'for $type in object_data_types where $type/code = ' + XQueryLiteral(fixture.code) + ' return $type';
    for (row in ArraySelectAll(XQuery(query))) {
        doc = OpenDoc(UrlFromDocID(row.id.Value));
        if (doc.TopElem.Name != 'object_data_type' || doc.TopElem.code.Value != fixture.code)
            throw 'Refusing unowned object data type cleanup';
        DeleteDoc(doc.Url, true);
    }
    remaining += ArrayCount(XQuery(query));
}
return EncodeJson(remaining);
`),
      );
      assert.equal(remaining, 0);
    }
  });
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
  await check("fresh read permits one move to trash and consumes the token", async () => {
    const read = await call("get_object", { id });
    const input = { id, readToken: read.readToken };
    assert.deepEqual(await call("delete_object", input), { id, mode: "trash", deleteStatus: "deleted" });
    const reused = await call("delete_object", input, true);
    assert.equal(reused.deleteStatus, "not_attempted");
    assert.equal(reused.error.code, "ReadRequired");
    await call("get_object", { id }, true);
    const trashed = JSON.parse(
      await evaluator.eval(
        `var id = Int('${id}'); var d = OpenDoc(UrlFromDocID(id, 'trash')); return EncodeJson({code:String(d.TopElem.code),rows:ArrayCount(XQuery('for $c in cost_centers where $c/id = ${id} return $c')),trash:ArrayCount(XQuery('for $t in trash_docs where $t/id = ${id} return $t'))});`,
      ),
    );
    assert.deepEqual(trashed, { code: marker, rows: 0, trash: 1 });
  });
});
