import assert from "node:assert/strict";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { WshcmApi, WshcmDispatchError } from "../build/index.js";

const scope = { objectType: "request_type", templateId: "6405466310999430311" };
const snapshot = { url: "x-local://wt_data/lists/wtv_custom_templates.xml", xml: "<custom_templates/>" };
const empty = { exists: false, fields: [], pages: [], fieldTypes: [{ id: "combo", title: "Значение из списка" }] };
const field = {
  name: "office",
  title: "Офис",
  type: "combo",
  required: false,
  showOnPortal: true,
  pageId: "details",
  options: ["Москва"],
  catalog: null,
};
const { name, ...set } = field;
const operations = [
  { op: "upsertPage", id: "details", set: { title: "Детали" } },
  { op: "upsertField", name, set },
];
const wire = (data) => JSON.stringify(JSON.stringify(data));

function api(handler) {
  return new WshcmApi({
    eval: async (code) => {
      const invocation = code.match(/ParseJson\(\s*('[\s\S]*')\s*\)\)\)\);\s*$/);
      assert.ok(invocation, "expected a literal native request");
      return handler(JSON.parse(runInNewContext(invocation[1])));
    },
  }).customFields;
}

test("SDK template discovery sends page bounds and returns a compact list", async () => {
  const listing = {
    objectType: "request",
    common: null,
    templateType: "request_type",
    templateSelector: "request_type_id",
    offset: 1,
    limit: 1,
    total: 2,
    templates: [{ templateId: scope.templateId, title: "Тип заявки", fieldCount: 0, pageCount: 1 }],
  };
  const calls = [];
  const sdk = api((request) => {
    calls.push(request);
    return wire({ ok: true, listing });
  });
  assert.deepEqual(await sdk.list({ objectType: "request", offset: 1, limit: 1 }), listing);
  assert.deepEqual(calls, [{ operation: "list", objectType: "request", offset: 1, limit: 1 }]);
  await assert.rejects(sdk.list({ objectType: "subdivision", offset: 1, limit: 1 }), /response/);
});

test("missing request type template carries a revision, and preview neither changes nor consumes it", async () => {
  const calls = [];
  const sdk = api((request) => {
    calls.push(request);
    if (request.operation === "get") return wire({ ok: true, snapshot, definition: empty });
    const result = { ...empty, exists: true, pages: [{ id: "details", title: "Детали" }], fields: [field] };
    return wire({
      ok: true,
      snapshot: request.dryRun ? snapshot : { ...snapshot, xml: "<custom_templates><request_type/></custom_templates>" },
      definition: result,
      changed: true,
      writeStatus: request.dryRun ? "not_attempted" : "saved",
    });
  });

  const before = await sdk.get({ scope });
  assert.equal(before.exists, false);
  assert.deepEqual(before.scope, scope);
  assert.match(before.revision, /^[a-f0-9]{64}$/);
  const preview = await sdk.patch({ scope, operations, revision: before.revision, dryRun: true });
  assert.equal(preview.writeStatus, "not_attempted");
  assert.equal(preview.revision, before.revision);
  assert.deepEqual(preview.fields, [field]);
  const saved = await sdk.patch({ scope, operations, revision: before.revision });
  assert.equal(saved.writeStatus, "saved");
  assert.notEqual(saved.revision, before.revision);
  assert.deepEqual(
    calls.slice(1).map((item) => [item.scope, item.expected, item.dryRun]),
    [
      [scope, snapshot, true],
      [scope, snapshot, false],
    ],
  );
});

test("invalid moves and unknown revisions fail before HCM dispatch", async () => {
  const sdk = api(() => assert.fail("unexpected evaluator call"));
  const revision = "a".repeat(64);
  await assert.rejects(
    sdk.patch({ scope, revision, operations: [{ op: "moveField", name: "office", before: "a", after: "b" }] }),
    /before|after/,
  );
  await assert.rejects(
    sdk.patch({ scope, revision, operations: [{ op: "removeField", name: "office" }] }),
    (error) => error.details.error.code === "ReadRequired" && error.details.writeStatus === "not_attempted",
  );
});

test("a lost patch response is never replayed and preserves dispatch certainty", async () => {
  for (const dispatched of [false, true]) {
    let writes = 0;
    const failure = new WshcmDispatchError("transport lost", dispatched);
    const sdk = api((request) => {
      if (request.operation === "get") return wire({ ok: true, snapshot, definition: empty });
      writes++;
      throw failure;
    });
    const { revision } = await sdk.get({ scope });
    await assert.rejects(
      sdk.patch({ scope, revision, operations: [{ op: "removeField", name: "office" }] }),
      (error) => error.cause === failure && error.details.writeStatus === (dispatched ? "unknown" : "not_attempted"),
    );
    assert.equal(writes, 1);
    if (dispatched) {
      await assert.rejects(
        sdk.patch({ scope, revision, operations: [{ op: "removeField", name: "office" }] }),
        (error) => error.details.error.code === "ReadRequired",
      );
      assert.equal(writes, 1);
    }
  }
});

test("native definitions can be read even when old text exceeds writable property limits", async () => {
  const title = "длинное название ".repeat(300);
  assert.ok(title.length > 4096);
  const definition = { ...empty, exists: true, fields: [{ ...field, title }] };
  const sdk = api(() => wire({ ok: true, snapshot, definition }));
  const result = await sdk.get({ scope });
  assert.equal(result.fields[0].title, title);
  await assert.rejects(
    sdk.patch({ scope, revision: result.revision, operations: [{ op: "upsertField", name: field.name, set: { title } }] }),
    /4096/,
  );
});

test("advanced settings and ordered visibility rows round-trip through the SDK contract", async () => {
  const settings = {
    defaultValueFormula: "GEnv.curObject.name",
    validationCondition: "oValue != ''",
    catalogFilter: "$elem/is_dismiss = false()",
    comment: "Подсказка",
    width: "100%",
    height: "3gr",
    visualClass: "hint",
    maxChars: "120",
    visibilityConditions: [
      { field: "name", operator: "eq", value: "Иван", bracket: "(" },
      { field: "office", operator: "cn", isCustomField: true, join: "or", value: "Два", bracket: ")" },
    ],
  };
  const page = { id: "details", title: "Детали", accessRole: "hr", accessGroupId: "6357946981604418316" };
  const definition = { ...empty, exists: true, fields: [{ ...field, ...settings }], pages: [page] };
  const changes = [
    { op: "upsertField", name, set: { ...settings, comment: null, visibilityConditions: [] } },
    { op: "upsertPage", id: page.id, set: { accessRole: null, accessGroupId: page.accessGroupId } },
  ];
  const sdk = api((request) => {
    if (request.operation === "get") return wire({ ok: true, snapshot, definition });
    assert.deepEqual(request.operations, changes);
    return wire({ ok: true, snapshot, definition, changed: true, writeStatus: "not_attempted" });
  });
  const before = await sdk.get({ scope });
  assert.deepEqual(before.fields, definition.fields);
  assert.deepEqual(before.pages, definition.pages);
  await sdk.patch({ scope, revision: before.revision, operations: changes, dryRun: true });
});

test("unsafe group IDs and unbalanced visibility brackets are rejected before dispatch", async () => {
  const sdk = api(() => assert.fail("unexpected evaluator call"));
  const revision = "a".repeat(64);
  await assert.rejects(
    sdk.patch({ scope, revision, operations: [{ op: "upsertPage", id: "details", set: { accessGroupId: 6357946981604418316 } }] }),
    /accessGroupId/,
  );
  await assert.rejects(
    sdk.patch({
      scope,
      revision,
      operations: [{ op: "upsertField", name, set: { visibilityConditions: [{ field: "name", bracket: ")" }] } }],
    }),
    /bracket/,
  );
});

test("legacy visibility lists and zero group references remain readable", async () => {
  const values = Array.from({ length: 257 }, (_, index) => String(index));
  const visibilityConditions = values.map((value) => ({ field: "name", value }));
  visibilityConditions[0].values = values;
  const pages = [{ id: "details", title: "Детали", accessGroupId: "0" }];
  const definition = { ...empty, exists: true, fields: [{ ...field, visibilityConditions }], pages };
  const sdk = api(() => wire({ ok: true, snapshot, definition }));
  const result = await sdk.get({ scope });
  assert.deepEqual(result.fields[0].visibilityConditions, visibilityConditions);
  assert.deepEqual(result.pages, pages);
});

test("a native readback failure retains the acknowledged save", async () => {
  const sdk = api((request) => {
    if (request.operation === "get") return wire({ ok: true, snapshot, definition: empty });
    return wire({
      ok: false,
      phase: "readback",
      writeStatus: "saved",
      error: { code: "ReadbackMismatch", message: "Cache differs from storage" },
    });
  });
  const { revision } = await sdk.get({ scope });
  await assert.rejects(
    sdk.patch({ scope, revision, operations }),
    (error) => error.details.writeStatus === "saved" && error.details.error.code === "ReadbackMismatch",
  );
});
