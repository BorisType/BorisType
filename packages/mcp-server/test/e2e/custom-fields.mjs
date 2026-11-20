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
  const names = {
    shared: prefix + "_g",
    first: prefix + "_a",
    second: prefix + "_b",
    renamed: prefix + "_r",
    page: prefix + "_p",
    other: prefix + "_q",
  };
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
var group = ArrayOptFirstElem(XQuery('for $g in groups return $g'));
return EncodeJson(EncodeJson({xml:root.Xml,cacheMatches:root.Xml == custom_templates.Xml,
    hasTemplate:item != undefined,hasShared:shared != undefined,
    groupId:(group == undefined ? '' : StrInt(group.id.Value)),
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
  assert.match(original.groupId, /^[1-9]\d*$/, "Acceptance requires an existing group for the page restriction");
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
  const regularListing = await call("get", { mode: "list", objectType: common.objectType });
  assert.deepEqual(regularListing.common, { fieldCount: regular.fields.length, pageCount: regular.pages.length });
  assert.equal(regularListing.templateType, null);
  assert.deepEqual(regularListing.templates, []);
  const alias = await call("get", { mode: "list", objectType: "interval_schedule" });
  assert.equal(alias.templateType, "presence_state_interval_schedule");
  assert.equal(alias.templateSelector, "presence_state_id");
  const presenceStateId = await run(`
var state = ArrayOptFirstElem(XQuery('for $e in presence_states return $e'));
return EncodeJson(EncodeJson((state == undefined ? '' : StrInt(state.id.Value))));
`);
  assert.match(presenceStateId, /^[1-9]\d*$/);
  const aliasScope = { objectType: alias.templateType, templateId: presenceStateId };
  const aliasDefinitions = await call("get", { scope: aliasScope });
  const aliasPreview = await call("patch", {
    scope: aliasScope,
    revision: aliasDefinitions.revision,
    dryRun: true,
    operations: [{ op: "upsertPage", id: names.page, set: { title: "Интервалы" } }],
  });
  assert.equal(aliasPreview.writeStatus, "not_attempted");
  assert.equal(aliasPreview.pages.at(-1).id, names.page);
  await call("get", { scope: { ...aliasScope, templateId } }, "InvalidScope");
  const empty = await call("get", { scope });
  assert.equal(empty.exists, false);
  assert.deepEqual(empty.pages, []);
  assert.ok(empty.fieldTypes.some(({ id }) => id === "combo"));
  await call("get", { scope: { objectType: "request_type" } }, "InvalidScope");

  const filter = "$elem/is_dismiss = false()";
  const access = { accessRole: "user", accessGroupId: original.groupId };
  const settings = {
    comment: "Поле O'фиса\nПодсказка",
    defaultValueFormula: "throw 'This formula must not run during definition edits'",
    validationCondition: "oValue != ''",
    width: "45zr",
    height: "3gr",
    visualClass: "hint",
    maxChars: "120",
    visibilityConditions: [
      { field: "status_id", value: "active", operator: "eq", type: "string", join: "and", bracket: "(" },
      {
        field: names.first,
        title: "Ссылка",
        type: "integer",
        value: original.groupId,
        isCustomField: true,
        operator: "eq",
        values: [original.groupId, "2", original.groupId],
        join: "or",
        bracket: ")",
      },
    ],
  };
  const req = {
    scope,
    revision: empty.revision,
    operations: [
      { op: "upsertPage", id: names.page, set: { title: "Детали", ...access } },
      { op: "upsertPage", id: names.other, set: { title: "Ещё" } },
      { op: "movePage", id: names.page, after: names.other },
      {
        op: "upsertField",
        name: names.first,
        set: { type: "foreign_elem", catalog: "collaborator", pageId: names.other, catalogFilter: filter },
      },
      {
        op: "upsertField",
        name: names.second,
        set: {
          title: "Выбор O'фиса",
          type: "combo",
          required: true,
          showOnPortal: false,
          pageId: names.page,
          options: ["Один", "Два"],
          ...settings,
        },
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
  for (const [key, value] of Object.entries(settings)) assert.deepEqual(preview.fields[0][key], value);
  assert.equal(preview.fields[1].catalogFilter, filter);
  assert.deepEqual(preview.pages[1], { id: names.page, title: "Детали", ...access });
  assert.ok((await read()).xml === baseline.xml, "A preview must not write to the registry");

  const saved = await call("patch", req);
  assert.equal(saved.writeStatus, "saved");
  assert.deepEqual(saved.fields, preview.fields);
  assert.deepEqual(saved.pages, preview.pages);
  assert.notEqual(saved.revision, empty.revision);
  assert.ok((await read()).cacheMatches);
  const native = await run(`
var field = item.fields.GetChildByKey('${names.second}');
var selector = item.fields.GetChildByKey('${names.first}');
var page = item.sheets.GetChildByKey('${names.page}');
var target = OpenNewDoc('x-local://wtv/wtv_request.xmd').TopElem;
var expr = tools.create_filter_javascript(field.view.conditions);
target.status_id = 'active';
var active = SafeEval(expr, [{curObject:target}]);
target.status_id = 'fixture_other_status';
var inactive = SafeEval(expr, [{curObject:target}]);
return EncodeJson(EncodeJson({formula:String(field.default_value_eval.Value),qual:String(selector.xquery_qual.Value),
    role:String(page.user_access_role.Value),groupId:StrInt(page.user_group_id.Value),active:active,inactive:inactive}));
`);
  assert.deepEqual(native, {
    formula: settings.defaultValueFormula,
    qual: filter,
    role: access.accessRole,
    groupId: access.accessGroupId,
    active: true,
    inactive: false,
  });
  const replay = await call("patch", {
    scope,
    revision: saved.revision,
    operations: [
      { op: "upsertField", name: names.second, set: settings },
      { op: "upsertPage", id: names.page, set: access },
    ],
  });
  assert.equal(replay.changed, false);
  assert.equal(replay.writeStatus, "not_attempted");
  assert.equal(replay.revision, saved.revision);
  await call(
    "patch",
    { scope, revision: saved.revision, operations: [{ op: "upsertPage", id: names.page, set: { accessRole: prefix } }] },
    "InvalidAccessRole",
  );
  await call(
    "patch",
    { scope, revision: saved.revision, operations: [{ op: "upsertPage", id: names.page, set: { accessGroupId: templateId } }] },
    "InvalidAccessGroup",
  );
  await call(
    "patch",
    {
      scope,
      revision: saved.revision,
      operations: [{ op: "upsertField", name: names.second, set: { visibilityConditions: [{ field: "status_id", operator: prefix }] } }],
    },
    "InvalidVisibilityOperator",
  );
  await call(
    "patch",
    { scope, revision: saved.revision, operations: [{ op: "renameField", name: names.second, newName: names.first }] },
    "FieldExists",
  );
  await call("patch", { scope, revision: saved.revision, operations: [{ op: "removePage", id: names.page }] }, "InvalidPage");

  const addShared = [{ op: "upsertField", name: names.shared, set: { title: "Проба", comment: "Для всех подразделений" } }];
  await call("patch", { scope: common, revision: regular.revision, operations: addShared }, "Conflict");
  const freshCommon = await call("get", { scope: common });
  const savedCommon = await call("patch", { scope: common, revision: freshCommon.revision, operations: addShared });
  assert.deepEqual(savedCommon.fields.slice(0, -1), regular.fields);
  assert.equal(savedCommon.fields.at(-1).type, "string");
  assert.equal(savedCommon.fields.at(-1).name, names.shared);
  assert.equal(savedCommon.fields.at(-1).comment, "Для всех подразделений");

  // The shared conditions schema has an XQuery qualification the custom-field dialog does not edit.
  await run(`
if (item == undefined) throw 'Owned template missing';
var field = item.fields.GetOptChildByKey('${names.second}');
field.view.conditions_qual = 'keep_native_qual';
ms_tools.save_cached_doc(doc);
return EncodeJson(EncodeJson(true));
`);
  const editable = await call("get", { scope });
  assert.deepEqual(editable.fields, saved.fields);
  assert.deepEqual(editable.pages, saved.pages);
  await call("patch", { scope, revision: saved.revision, operations: [{ op: "removeField", name: names.first }] }, "Conflict");
  const edited = await call("patch", {
    scope,
    revision: editable.revision,
    operations: [
      { op: "upsertField", name: names.second, set: { title: "После правки", pageId: null, options: ["Два", "Один"] } },
      { op: "upsertPage", id: names.page, set: { accessRole: null, accessGroupId: null } },
      { op: "renameField", name: names.second, newName: names.renamed },
    ],
  });
  assert.equal(edited.writeStatus, "saved");
  assert.deepEqual(edited.pages[1], { id: names.page, title: "Детали" });
  assert.deepEqual(edited.fields[0], {
    ...saved.fields[0],
    name: names.renamed,
    title: "После правки",
    pageId: null,
    options: ["Два", "Один"],
  });
  const clearedSettings = {
    comment: null,
    defaultValueFormula: null,
    validationCondition: null,
    width: null,
    height: null,
    visualClass: null,
    maxChars: null,
    visibilityConditions: [],
  };
  const cleared = await call("patch", {
    scope,
    revision: edited.revision,
    operations: [
      { op: "upsertField", name: names.renamed, set: clearedSettings },
      { op: "upsertField", name: names.first, set: { catalogFilter: null } },
      { op: "removePage", id: names.page },
    ],
  });
  assert.equal(cleared.writeStatus, "saved");
  assert.deepEqual(
    cleared.pages.map(({ id }) => id),
    [names.other],
  );
  for (const key of Object.keys(clearedSettings)) assert.equal(Object.hasOwn(cleared.fields[0], key), false);
  assert.equal(Object.hasOwn(cleared.fields[1], "catalogFilter"), false);
  assert.equal(
    await run(`return EncodeJson(EncodeJson(String(item.fields.GetChildByKey('${names.renamed}').view.conditions_qual.Value)));`),
    "keep_native_qual",
  );
  const unchanged = await call("patch", {
    scope,
    revision: cleared.revision,
    operations: [{ op: "upsertField", name: names.renamed, set: { title: "После правки", ...clearedSettings } }],
  });
  assert.equal(unchanged.changed, false);
  assert.equal(unchanged.writeStatus, "not_attempted");
  assert.equal(unchanged.revision, cleared.revision);

  // Reproduce the intermediate state of save_cached_doc without forcing a storage write failure.
  const beforeFault = await read();
  const patchCache = `item.fields.GetChildByKey('${names.renamed}').comment = '${prefix}_cache_only';`;
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
    await call("get", { mode: "list", objectType: "request" }, "CacheMismatch");
    await call("patch", { ...req, revision: cleared.revision }, "CacheMismatch");
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
  const current = await call("get", { scope });
  assert.equal(current.revision, cleared.revision);
  const removedField = await call("patch", {
    scope,
    revision: current.revision,
    operations: [{ op: "removeField", name: names.first }],
  });
  assert.deepEqual(removedField.fields, [cleared.fields[0]]);

  const removeTemplate = { scope, revision: removedField.revision, operations: [{ op: "removeTemplate" }] };
  await call("patch", { ...removeTemplate, revision: current.revision }, "Conflict");
  const beforeRemoval = await read();
  const removalPreview = await call("patch", { ...removeTemplate, dryRun: true });
  assert.equal(removalPreview.exists, false);
  assert.deepEqual(removalPreview.fields, []);
  assert.deepEqual(removalPreview.pages, []);
  assert.equal(removalPreview.changed, true);
  assert.equal(removalPreview.writeStatus, "not_attempted");
  assert.equal(removalPreview.revision, removedField.revision);
  assert.ok((await read()).xml === beforeRemoval.xml, "Removing a template in preview must leave storage intact");

  const removedTemplate = await call("patch", removeTemplate);
  assert.equal(removedTemplate.exists, false);
  assert.equal(removedTemplate.writeStatus, "saved");
  assert.notEqual(removedTemplate.revision, removedField.revision);
  const afterRemoval = await read();
  assert.equal(afterRemoval.hasTemplate, false);
  assert.equal(afterRemoval.cacheMatches, true);
  assert.equal(afterRemoval.owner, original.owner);
  assert.equal(afterRemoval.hasShared, true);
  const absent = await call("get", { scope });
  assert.equal(absent.exists, false);
  assert.deepEqual(absent.fields, []);
  assert.deepEqual(absent.pages, []);
  await call("patch", { ...removeTemplate, revision: absent.revision }, "NotFound");

  const pageOnly = await call("patch", {
    scope,
    revision: absent.revision,
    operations: [{ op: "upsertPage", id: names.page, set: { title: "Страница без полей" } }],
  });
  const listing = await call("get", { mode: "list", objectType: "request" });
  assert.equal(listing.templateType, "request_type");
  assert.equal(listing.templateSelector, "request_type_id");
  assert.equal(listing.common, null);
  const offset = listing.templates.findIndex((entry) => entry.templateId === templateId);
  assert.ok(offset >= 0);
  const listed = listing.templates[offset];
  assert.equal(listed.fieldCount, 0);
  assert.equal(listed.pageCount, 1);
  assert.match(listed.title, /\S/);
  const nextPage = await call("get", { mode: "list", objectType: "request", offset, limit: 1 });
  assert.equal(nextPage.total, listing.total);
  assert.deepEqual(nextPage.templates, [listed]);
  const ownerPage = await call("get", { mode: "list", objectType: listing.templateType, offset, limit: 1 });
  assert.equal(ownerPage.templateType, listing.templateType);
  assert.equal(ownerPage.templateSelector, null);
  assert.deepEqual(ownerPage.templates, [listed]);
  const exact = await call("get", { scope: { objectType: listing.templateType, templateId: listed.templateId } });
  assert.deepEqual(exact.fields, pageOnly.fields);
  assert.deepEqual(exact.pages, pageOnly.pages);
  await call("patch", { ...removeTemplate, revision: exact.revision });

  const nowCommon = await call("get", { scope: common });
  await call("patch", { ...removeTemplate, scope: common, revision: nowCommon.revision }, "InvalidScope");
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
      verified:
        "preview, save, advanced settings, visibility evaluation, page access, rename, order, conflict, template discovery and removal, no-op",
    }),
  );
});
