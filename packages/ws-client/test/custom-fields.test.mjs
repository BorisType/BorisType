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
