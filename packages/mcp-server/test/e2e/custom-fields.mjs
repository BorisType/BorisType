import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { test } from "node:test";
import { WshcmClient } from "@boristype/ws-client";
import { localStand } from "./stand.mjs";

test("custom field definitions work through stdio and preserve the shared registry", { timeout: 120_000 }, async (t) => {
  const stand = localStand();
  const inventory = stand.evaluators();
  const templateId = process.env.WSHCM_E2E_TEMPLATE_ID ?? "";
  assert.match(templateId, /^[1-9]\d{0,19}$/, "Set WSHCM_E2E_TEMPLATE_ID to an unused request_type without a configured template");
  assert.ok(BigInt(templateId) <= 18446744073709551615n);
  const prefix = "bt_cf_" + randomUUID().replaceAll("-", "");
  const names = { shared: prefix + "_g", first: prefix + "_a", second: prefix + "_b", page: prefix + "_p", other: prefix + "_q" };
  const scope = { objectType: "request_type", templateId };
  const common = { objectType: "subdivision" };
  const { client, transport } = stand.createClient();
  const hcm = new WshcmClient({
    host: stand.host,
    port: 80,
    overHttps: false,
    username: process.env.WSHCM_E2E_USERNAME,
    password: process.env.WSHCM_E2E_PASSWORD,
  });
  let ownedEvaluator;
  const callMethod = hcm.callMethod.bind(hcm);
  hcm.callMethod = (library, method, args, options) => {
    if (library === "tools" && method === "put_url_text_server") {
      const match = /^x-local:\/\/wt\/(unsafe_eval_[A-Za-z0-9]{32}\.bs)$/.exec(args[0]);
      assert.ok(match && !inventory.includes(match[1]));
      ownedEvaluator = match[1];
    }
    return callMethod(library, method, args, options);
  };
  const evaluator = hcm.createEvaluator();
  const prelude = `
var doc = OpenDoc(custom_templates.Doc.Url);
var root = doc.TopElem;
var id = Int('${templateId}');
var item = root.request_type.items.GetOptChildByKey(id);
var shared = root.subdivision.fields.GetOptChildByKey('${names.shared}');
`;
  const run = async (code) => JSON.parse(JSON.parse(await evaluator.eval(prelude + code)));
  const read = () =>
    run(`
return EncodeJson(EncodeJson({xml:root.Xml,cacheMatches:root.Xml == custom_templates.Xml,
    hasTemplate:item != undefined,hasShared:shared != undefined,
    owner:OpenDoc(UrlFromDocID(id)).TopElem.Name,
    inUse:ArrayOptFirstElem(XQuery('for $e in requests where $e/request_type_id = ' + StrInt(id) + ' return $e')) != undefined}));
`);
  let baseline;
  t.after(async () => {
    try {
      await client.close();
    } finally {
      try {
        if (baseline) {
          // Remove only the newly owned definitions.
          const restored = await run(`
var changed = false;
if (shared != undefined) { shared.Delete(); changed = true; }
if (item != undefined) {
    var entry;
    var owned = false;
    for (entry in item.fields) {
        if (!StrBegins(String(entry.name.Value), '${prefix}')) throw 'Refusing cleanup of unowned field';
        owned = true;
    }
    for (entry in item.sheets) {
        if (!StrBegins(String(entry.id.Value), '${prefix}')) throw 'Refusing cleanup of unowned page';
        owned = true;
    }
    if (!owned) throw 'Refusing cleanup of an empty item without an owned marker';
    item.Delete();
    changed = true;
}
if (changed) ms_tools.save_cached_doc(doc);
var fresh = OpenDoc(doc.Url).TopElem;
return EncodeJson(EncodeJson({xml:fresh.Xml,cacheMatches:fresh.Xml == custom_templates.Xml}));
`);
          assert.equal(restored.cacheMatches, true);
          assert.ok(restored.xml === baseline.xml, "cleanup must restore the exact original registry");
          t.diagnostic("Registry restored byte for byte, SHA-256 " + createHash("sha256").update(restored.xml).digest("hex"));
        }
      } finally {
        try {
          if (ownedEvaluator) await evaluator.close();
        } finally {
          if (ownedEvaluator && stand.evaluators().includes(ownedEvaluator)) stand.removeEvaluator(ownedEvaluator);
        }
        assert.deepEqual(stand.evaluators(), inventory);
      }
    }
  });

  await hcm.initialize();
  await evaluator.initialize();
  const original = await read();
  assert.equal(original.cacheMatches, true);
  assert.equal(original.owner, "request_type");
  assert.equal(original.inUse, false);
  assert.equal(original.hasTemplate, false, "Acceptance requires an unused request type");
  assert.equal(original.hasShared, false);
  baseline = original;
  await client.connect(transport, { timeout: 15_000 });

  async function call(mode, args, errorCode) {
    const result = await client.callTool({ name: `wshcm_${mode}_custom_field_definitions`, arguments: args }, { timeout: 25_000 });
    const body = JSON.parse(result.content[0].text);
    assert.equal(result.isError === true, !!errorCode, JSON.stringify(body));
    if (errorCode) {
      assert.equal(body.error.code, errorCode);
      assert.equal(body.writeStatus, "not_attempted");
    }
    return body;
  }

  const regular = await call("get", { scope: common });
  assert.equal(regular.exists, true);
  const empty = await call("get", { scope });
  assert.equal(empty.exists, false);
  assert.deepEqual(empty.pages, []);
  assert.ok(empty.fieldTypes.some(({ id }) => id === "combo"));
  await call("get", { scope: { objectType: "request_type" } }, "InvalidScope");

  const req = {
    scope,
    revision: empty.revision,
    operations: [
      { op: "upsertPage", id: names.page, set: { title: "Детали" } },
      { op: "upsertPage", id: names.other, set: { title: "Ещё" } },
      { op: "movePage", id: names.page, after: names.other },
      { op: "upsertField", name: names.first, set: { type: "foreign_elem", catalog: "subdivision", pageId: names.other } },
      {
        op: "upsertField",
        name: names.second,
        set: { title: "Выбор O'фиса", type: "combo", required: true, showOnPortal: false, pageId: names.page, options: ["Один", "Два"] },
      },
      { op: "moveField", name: names.second, before: names.first },
    ],
  };
  const preview = await call("patch", { ...req, dryRun: true });
  assert.equal(preview.writeStatus, "not_attempted");
  assert.equal(preview.changed, true);
  assert.equal(preview.revision, empty.revision);
  assert.deepEqual(
    preview.fields.map(({ name }) => name),
    [names.second, names.first],
  );
  assert.deepEqual(
    preview.pages.map(({ id }) => id),
    [names.other, names.page],
  );
  assert.ok((await read()).xml === baseline.xml, "A preview must not write to the registry");

  const saved = await call("patch", req);
  assert.equal(saved.writeStatus, "saved");
  assert.deepEqual(saved.fields, preview.fields);
  assert.deepEqual(saved.pages, preview.pages);
  assert.notEqual(saved.revision, empty.revision);
  assert.ok((await read()).cacheMatches);
  await call("patch", { scope, revision: saved.revision, operations: [{ op: "removePage", id: names.page }] }, "InvalidPage");

  const addShared = [{ op: "upsertField", name: names.shared, set: { title: "Проба" } }];
  await call("patch", { scope: common, revision: regular.revision, operations: addShared }, "Conflict");
  const freshCommon = await call("get", { scope: common });
  const savedCommon = await call("patch", { scope: common, revision: freshCommon.revision, operations: addShared });
  assert.deepEqual(savedCommon.fields.slice(0, -1), regular.fields);
  assert.equal(savedCommon.fields.at(-1).type, "string");
  assert.equal(savedCommon.fields.at(-1).name, names.shared);

  // An advanced property outside the public editor is added only to our fixture.
  await run(`
if (item == undefined) throw 'Owned template missing';
var field = item.fields.GetOptChildByKey('${names.second}');
field.comment = 'Keep the unexposed native setting';
ms_tools.save_cached_doc(doc);
return EncodeJson(EncodeJson(true));
`);
  const editable = await call("get", { scope });
  await call("patch", { scope, revision: saved.revision, operations: [{ op: "removeField", name: names.first }] }, "Conflict");
  const edited = await call("patch", {
    scope,
    revision: editable.revision,
    operations: [
      { op: "upsertField", name: names.second, set: { title: "После правки", pageId: null, options: ["Два", "Один"] } },
      { op: "removePage", id: names.page },
      { op: "removeField", name: names.first },
    ],
  });
  assert.equal(edited.writeStatus, "saved");
  assert.deepEqual(
    edited.pages.map(({ id }) => id),
    [names.other],
  );
  assert.deepEqual(edited.fields, [{ ...saved.fields[0], title: "После правки", pageId: null, options: ["Два", "Один"] }]);
  assert.equal(
    await run(`return EncodeJson(EncodeJson(String(item.fields.GetOptChildByKey('${names.second}').comment.Value)));`),
    "Keep the unexposed native setting",
  );
  const unchanged = await call("patch", {
    scope,
    revision: edited.revision,
    operations: [{ op: "upsertField", name: names.second, set: { title: "После правки" } }],
  });
  assert.equal(unchanged.changed, false);
  assert.equal(unchanged.writeStatus, "not_attempted");
  assert.equal(unchanged.revision, edited.revision);

  // Reproduce the intermediate state of save_cached_doc without forcing a storage write failure.
  const beforeFault = await read();
  const patchCache = `item.fields.GetOptChildByKey('${names.second}').comment = '${prefix}_cache_only';`;
  const cacheOnly = await run(`${patchCache} return EncodeJson(EncodeJson(root.Xml));`);
  assert.notEqual(cacheOnly, beforeFault.xml);
  try {
    await run(`
if (root.Xml != ${JSON.stringify(beforeFault.xml)} || custom_templates.Xml != root.Xml) throw 'Registry changed before cache probe';
${patchCache}
ReplaceCachedDoc(doc.Url, doc);
return EncodeJson(EncodeJson(true));
`);
    const diverged = await read();
    assert.equal(diverged.cacheMatches, false);
    assert.ok(diverged.xml === beforeFault.xml, "Cache probe must not write to storage");
    await call("get", { scope }, "CacheMismatch");
    await call("patch", { ...req, revision: edited.revision }, "CacheMismatch");
  } finally {
    const repaired = await run(`
if (root.Xml != ${JSON.stringify(beforeFault.xml)}) throw 'Storage changed during cache probe';
if (root.Xml != custom_templates.Xml) {
    if (custom_templates.Xml != ${JSON.stringify(cacheOnly)}) throw 'Refusing to replace cache from another writer';
    ReplaceCachedDoc(doc.Url, doc);
}
return EncodeJson(EncodeJson(root.Xml == custom_templates.Xml));
`);
    assert.equal(repaired, true);
  }
  assert.equal((await call("get", { scope })).revision, edited.revision);

  const nowCommon = await call("get", { scope: common });
  const removed = await call("patch", {
    scope: common,
    revision: nowCommon.revision,
    operations: [{ op: "removeField", name: names.shared }],
  });
  assert.deepEqual(removed.fields, regular.fields);
  t.diagnostic(
    JSON.stringify({
      image: stand.image,
      imageId: stand.imageId,
      templateId,
      carrier: "CLI/stdio/SOAP",
      verified: "preview, save, order, conflict, remove, no-op",
    }),
  );
});
