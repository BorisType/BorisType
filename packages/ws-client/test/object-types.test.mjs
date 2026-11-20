import assert from "node:assert/strict";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { WshcmDispatchError } from "../build/exceptions.js";
import { listObjectTypes, objectTypesInputSchema } from "../build/hcm/object-types.js";

const costForm = "x-local://wtv/wtv_cost_center.xmd";
const costCatalog = "x-local://wtv/wtv_cost_centers.xmd";
const groupCatalog = "x-local://wtv/wtv_group_collaborators.xmd";
const customForm = "x-local://udt/udt_cc_fixture.xmd";
const customCatalog = "x-local://udt/udc_cc_fixtures.xmd";

function exchange(name, formUrl, { title = "", isHier = false, isCustom = false } = {}) {
  return {
    name: { Value: name },
    form_url: { Value: formUrl },
    title: { Value: title },
    is_hier: { Value: isHier },
    is_custom: { Value: isCustom },
  };
}

function form(name, { isCatalog = false, isHier = false, hasCustomFields = false, objectType } = {}) {
  return {
    IsCatalog: isCatalog,
    IsHier: isHier,
    ObjectName: objectType,
    TopElem: { Name: name, OptChild: (key) => (key === "custom_elems" && hasCustomFields ? {} : undefined) },
  };
}

const mappings = new Map([
  [costForm, form("cost_center", { hasCustomFields: true })],
  [customForm, form("cc_fixture")],
  [costCatalog, form("cost_centers", { isCatalog: true, isHier: true })],
  [groupCatalog, form("group_collaborators", { isCatalog: true })],
  [customCatalog, form("cc_fixtures", { isCatalog: true })],
]);

function platform({
  objects = [exchange("cost_center", costForm, { title: "Центр затрат" }), exchange("cc_fixture", customForm, { isCustom: true })],
  catalogs = [groupCatalog, costCatalog, customCatalog],
  getCatalogs = () => catalogs,
  fetchForm = (url) => {
    if (!mappings.has(url)) throw new Error("Catalog form failed to load");
    return mappings.get(url);
  },
} = {}) {
  return {
    async eval(code) {
      assert.doesNotMatch(code, /\b(?:OpenDoc|OpenNewDoc|XQuery|RunSql|RegisterCatalog|Save)\s*\(/);
      return runInNewContext(`(function () { ${code}\n})()`, {
        common: { exchange_object_types: objects },
        DefaultDb: { GetRegisteredCatalogs: getCatalogs },
        ArrayCount: (collection) => collection.length,
        ArraySelectAll: (collection) => [...collection],
        ArraySort: (collection, ...sort) =>
          [...collection].sort((left, right) => {
            for (let index = 0; index < sort.length; index += 2) {
              const key = sort[index].replace(/^This\./, "");
              if (left[key] !== right[key]) return (left[key] < right[key] ? -1 : 1) * (sort[index + 1] === "+" ? 1 : -1);
            }
            return 0;
          }),
        FetchForm: fetchForm,
        DataType: (value) => typeof value,
        StrBegins: (text, prefix) => text.startsWith(prefix),
        StrContains: (text, part) => text.includes(part),
        StrLen: (text) => Buffer.byteLength(text, "utf8"),
        StrCharCount: (text) => Array.from(text).length,
        StrLeftCharRange: (text, count) => Array.from(text).slice(0, count).join(""),
        StrInt: String,
        ParseJson: JSON.parse,
        EncodeJson: JSON.stringify,
      });
    },
  };
}

test("object type list keeps registered catalogs and exchange object names separate across pages", async () => {
  const evaluator = platform();
  assert.deepEqual(await listObjectTypes(evaluator, { offset: 1, limit: 3 }), {
    total: 5,
    offset: 1,
    limit: 3,
    sources: { exchangeObjectTypes: "available", registeredCatalogs: "available" },
    items: [
      { kind: "object", name: "cost_center", title: "Центр затрат", formUrl: costForm, supportsCustomFields: true, isCustom: false },
      { kind: "catalog", name: "cc_fixtures", formUrl: customCatalog, isHier: false, isCustom: true },
      { kind: "catalog", name: "cost_centers", formUrl: costCatalog, isHier: true, isCustom: false },
    ],
  });
  assert.deepEqual(
    (await listObjectTypes(evaluator, {})).items.map(({ kind, name }) => [kind, name]),
    [
      ["object", "cc_fixture"],
      ["object", "cost_center"],
      ["catalog", "cc_fixtures"],
      ["catalog", "cost_centers"],
      ["catalog", "group_collaborators"],
    ],
  );
});

test("object-kind filtering avoids catalog enumeration and keeps exact qualified names", async () => {
  const evaluator = platform({
    objects: [exchange("app.component.cc_special", ""), exchange("cc_fixture", customForm, { isCustom: true })],
    getCatalogs: () => {
      throw new Error("Catalog registry must not be queried for object pages");
    },
  });
  const result = await listObjectTypes(evaluator, { kind: "object" });
  assert.deepEqual(result.sources, { exchangeObjectTypes: "available", registeredCatalogs: "not_requested" });
  assert.deepEqual(result.items, [
    { kind: "object", name: "app.component.cc_special", isCustom: false },
    { kind: "object", name: "cc_fixture", isCustom: true, formUrl: customForm, supportsCustomFields: false },
  ]);
});

test("catalog associations use only native ObjectName and exact filtering", async () => {
  const evaluator = platform({
    fetchForm: (url) => {
      if (url === costCatalog) return form("cost_centers", { isCatalog: true, objectType: "cost_center" });
      if (url === groupCatalog) return form("group_collaborators", { isCatalog: true, objectType: "" });
      return mappings.get(url);
    },
  });
  const catalogs = (await listObjectTypes(evaluator, { kind: "catalog" })).items;
  assert.equal(catalogs.find(({ name }) => name === "cost_centers").objectType, "cost_center");
  assert.equal(catalogs.find(({ name }) => name === "group_collaborators").objectType, null);
  assert.equal(
    Object.hasOwn(
      catalogs.find(({ name }) => name === "cc_fixtures"),
      "objectType",
    ),
    false,
  );
  const filtered = await listObjectTypes(evaluator, { objectType: "cost_center" });
  assert.equal(filtered.total, 2);
  assert.deepEqual(
    filtered.items.map(({ name }) => name),
    ["cost_center", "cost_centers"],
  );
});

test("unavailable catalog enumeration is explicit and actual registry errors are surfaced", async () => {
  const getCatalogs = () => {
    throw new Error("Unknown method: GetRegisteredCatalogs()");
  };
  const unavailable = await listObjectTypes(platform({ getCatalogs }), {});
  assert.equal(unavailable.total, 2);
  assert.equal(unavailable.sources.registeredCatalogs, "unavailable");
  assert.deepEqual(await listObjectTypes(platform({ getCatalogs }), { kind: "catalog" }), {
    total: 0,
    offset: 0,
    limit: 100,
    items: [],
    sources: { exchangeObjectTypes: "not_requested", registeredCatalogs: "unavailable" },
  });
  await assert.rejects(listObjectTypes(platform({ catalogs: ["broken"] }), {}), (error) => {
    assert.equal(error.details?.phase, "read");
    assert.equal(error.details?.writeStatus, "not_attempted");
    assert.equal(error.details?.error.code, "RegistryError");
    return true;
  });
});

test("object type list rejects over-budget scans without reading any catalog XMD", async () => {
  const evaluator = platform({
    catalogs: Array(4097).fill(costCatalog),
    fetchForm: () => assert.fail("Catalog XMD was fetched after the scan exceeded its entry limit"),
  });
  await assert.rejects(listObjectTypes(evaluator, { kind: "catalog" }), (error) => error.details?.error.code === "OutputLimit");
});

test("object type list bounds the page and retains a short native diagnostic", async () => {
  const title = "я".repeat(140000);
  const oversized = platform({ objects: [exchange("cost_center", costForm, { title })] });
  await assert.rejects(listObjectTypes(oversized, { kind: "object" }), (error) => error.details?.error.code === "OutputLimit");
  const failed = platform({
    fetchForm: () => {
      throw new Error("a".repeat(300000));
    },
  });
  await assert.rejects(listObjectTypes(failed, { kind: "catalog" }), (error) => {
    assert.equal(error.details?.error.code, "RegistryError");
    assert.match(error.details.error.message, /^Error: a+/);
    assert.equal(error.details.error.message.length, 2000);
    return true;
  });
});

test("object type list rejects a page whose item kind contradicts its source", async () => {
  const evaluator = {
    eval: async () =>
      JSON.stringify(
        JSON.stringify({
          ok: true,
          total: 1,
          offset: 0,
          limit: 100,
          sources: { exchangeObjectTypes: "not_requested", registeredCatalogs: "available" },
          items: [{ kind: "object", name: "cost_center", isCustom: false }],
        }),
      ),
  };
  await assert.rejects(listObjectTypes(evaluator, { kind: "catalog" }), (error) => error.details?.error.code === "InvalidResponse");
});

test("input bounds apply before transport and dispatch failure keeps its causal classification", async () => {
  assert.deepEqual(objectTypesInputSchema.parse({}), { offset: 0, limit: 100 });
  for (const invalid of [
    { limit: 0 },
    { limit: 251 },
    { offset: -1 },
    { offset: 0.5 },
    { offset: Number.MAX_SAFE_INTEGER + 1 },
    { kind: "cc" },
  ]) {
    assert.equal(objectTypesInputSchema.safeParse(invalid).success, false);
  }
  const offline = new WshcmDispatchError("connection lost", false);
  let evaluations = 0;
  const evaluator = {
    async eval() {
      evaluations++;
      throw offline;
    },
  };
  await assert.rejects(listObjectTypes(evaluator, { limit: 251 }));
  assert.equal(evaluations, 0);
  await assert.rejects(listObjectTypes(evaluator, {}), (error) => error === offline);
  assert.equal(evaluations, 1);
});
