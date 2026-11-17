import assert from "node:assert/strict";
import { test } from "node:test";
import * as sdk from "../build/index.js";

test("package SDK exports strict schemas and API", () => {
  assert.equal(typeof sdk.WshcmPackages, "function");
  assert.equal(typeof sdk.WshcmPackageError, "function");
  assert.ok(new sdk.WshcmApi({ eval: async () => {} }).packages instanceof sdk.WshcmPackages);
});
test("package schemas preserve exact IDs, defaults, XOR and revision requirements", () => {
  const s = sdk.packageSchemas;
  assert.ok(s);
  assert.equal(s.exportPackage.parse({ objectIds: ["18446744073709551615"] }).includeRelatedObjects, false);
  for (const input of [
    {},
    { objectIds: ["1"], schemaId: "a", revision: "a".repeat(64) },
    { objectIds: [1] },
    { objectIds: ["18446744073709551616"] },
    { schemaId: "a" },
    { objectIds: ["1"], unknown: true },
  ])
    assert.equal(s.exportPackage.safeParse(input).success, false);
  assert.equal(s.listSchemas.parse({}).limit, 100);
  assert.equal(s.getSchema.safeParse({ schemaId: "a", limit: 1001 }).success, false);
  assert.equal(s.saveSchema.safeParse({ name: "new" }).success, true);
  assert.equal(s.saveSchema.safeParse({ name: "new", schemaId: "a" }).success, false);
  assert.equal(s.inspectPackage.safeParse({ localPath: "/tmp/a", artifactId: crypto.randomUUID() }).success, false);
  assert.equal(s.importPackage.parse({ inspectionId: crypto.randomUUID() }).includeFiles, false);
});

import vm from "node:vm";
function platform(extra = {}) {
  const files = new Map();
  let saved = [
    {
      id: "baseline",
      name: "neighbor",
      objects: [],
      files: [],
      custom_templates: [],
      process_custom_templates: false,
      process_access_roles: false,
    },
  ];
  let saves = 0,
    calls = 0;
  function collection(rows, kind) {
    const a = rows.map((v) => (kind === "schema" ? schema(v) : v));
    Object.defineProperties(a, {
      ChildNum: { get: () => a.length },
      AddChild: {
        value: () => {
          const v =
            kind === "schema"
              ? schema({
                  id: "auto",
                  name: "",
                  objects: [],
                  files: [],
                  custom_templates: [],
                  process_custom_templates: false,
                  process_access_roles: false,
                })
              : {};
          a.push(v);
          return v;
        },
      },
      GetChildByKey: {
        value: (key) => {
          const v = a.find((v) => String(v.id) === String(key));
          if (!v) throw Error("Not found");
          return v;
        },
      },
      DeleteChildByKey: {
        value: (key) => {
          const i = a.findIndex((v) => String(v.id) === String(key));
          if (i >= 0) a.splice(i, 1);
        },
      },
      Clear: { value: () => a.splice(0) },
    });
    return a;
  }
  function schema(v) {
    return { ...v, objects: collection(v.objects), files: collection(v.files), custom_templates: collection(v.custom_templates) };
  }
  function doc(rows) {
    const top = collection(rows, "schema");
    top.GetXml = () => JSON.stringify(top);
    return {
      TopElem: top,
      Save: () => {
        saved = JSON.parse(JSON.stringify(top));
        saves++;
      },
    };
  }
  const ctx = {
    ParseJson: JSON.parse,
    EncodeJson: JSON.stringify,
    StrCharCount: (v) => String(v).length,
    String,
    Int: BigInt,
    StrSignedInt: String,
    StrInt: String,
    ArrayCount: (a) => a.length,
    ArraySelectAll: (a) => a,
    DefaultDb: "wt_data",
    OpenDoc: () => doc(saved),
    OpenNewDoc: () => doc([]),
    UrlToFilePath: (v) => v,
    CreateDirectory: () => {},
    IsDirectory: () => true,
    ObtainDirectory: () => {},
    FilePathExists: (p) => files.has(p),
    PutFileData: (p, v) => files.set(p, v),
    LoadFileData: (p) => {
      if (!files.has(p)) throw Error("missing");
      return files.get(p);
    },
    StrBegins: (a, b) => a.startsWith(b),
    StrContains: (a, b) => a.includes(b),
    StrLowerCase: (s) => s.toLowerCase(),
    StrLeftRange: (s, n) => s.slice(0, n),
    tools: {
      get_cur_user_id: () => 1n,
      random_string: () => "target-identity-123456789",
      add_object_to_package: (_a, id, _b, p, opts) => {
        assert.equal(opts.apply_to_all, true);
        p.objects.push({ id: String(id), name: "exact", type: "cost_center", modify: true });
        return { error: 0 };
      },
    },
  };
  return {
    files,
    get saved() {
      return saved;
    },
    get saves() {
      return saves;
    },
    get calls() {
      return calls;
    },
    mutate: () => {
      saved[0].name = "concurrent";
    },
    evaluator: {
      eval: async (code) => {
        calls++;
        return vm.runInNewContext(`(function(){${code}})()`, Object.assign(ctx, extra, { tools: { ...ctx.tools, ...extra.tools } }));
      },
    },
  };
}
test("native resource retains neighbors, exact IDs and rejects stale common revision", async () => {
  assert.ok(sdk.WshcmPackages);
  const p = platform();
  const service = new sdk.WshcmPackages(p.evaluator);
  const before = await service.listSchemas();
  const created = await service.saveSchema({ name: "own" });
  assert.equal(p.saved[0].name, "neighbor");
  assert.equal(p.saves, 1);
  const added = await service.addObjects({ schemaId: created.schemaId, revision: created.revision, objectIds: ["18446744073709551615"] });
  const read = await service.getSchema({ schemaId: created.schemaId });
  assert.equal(read.objects[0].id, "18446744073709551615");
  await assert.rejects(service.deleteSchema({ schemaId: created.schemaId, revision: before.items[0].revision }), /Conflict/);
  p.mutate();
  await assert.rejects(
    service.removeObjects({ schemaId: created.schemaId, revision: added.revision, objectIds: ["18446744073709551615"] }),
    /Conflict/,
  );
  assert.equal(p.saves, 2);
});
test("lost native acknowledgement exposes durable receipt identity and never repeats mutation", async () => {
  assert.ok(sdk.WshcmPackages);
  const p = platform();
  let lose = false;
  const service = new sdk.WshcmPackages({
    eval: async (code) => {
      const r = await p.evaluator.eval(code);
      if (lose) {
        lose = false;
        throw Error("lost ack");
      }
      return r;
    },
  });
  lose = true;
  let failure;
  try {
    await service.saveSchema({ name: "own" });
  } catch (e) {
    failure = e;
  }
  assert.equal(failure.details.status, "unknown");
  assert.equal(p.saves, 1);
  assert.ok(failure.details.operationId);
  const receipt = await service.getOperation({ operationId: failure.details.operationId });
  assert.equal(receipt.status, "completed");
  assert.equal(p.saves, 1);
});
import { mkdtemp, writeFile, readFile, rm, mkdir, chmod, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID, createHash } from "node:crypto";
test("product transfer preserves binary across exclusive 256 KiB boundaries and seals uploads", async () => {
  const { uploadPackage, downloadPackage } = await import("../build/hcm/packages/transfer.js");
  const dir = await mkdtemp(join(tmpdir(), "bt-transfer-"));
  const data = Buffer.alloc(2 * 262144 + 19);
  for (let i = 0; i < data.length; i++) data[i] = i % 256;
  let p;
  const ranges = [];
  p = platform({
    FileSize: (path) => Buffer.byteLength(p.files.get(path)),
    Base64Encode: (b) => Buffer.from(b).toString("base64"),
    Base64Decode: (b) => Buffer.from(b, "base64"),
    LoadFileDataRange: (path, a, b) => {
      ranges.push([a, b]);
      return Buffer.from(p.files.get(path)).subarray(a, b);
    },
    PutFileDataRange: (path, a, b, value) => {
      assert.equal(value.length, b - a);
      p.files.set(path, Buffer.concat([Buffer.from(p.files.get(path)), value]));
    },
  });
  try {
    const path = join(dir, "input.zip");
    await writeFile(path, data);
    const id = randomUUID();
    const artifact = { localPath: path, sizeBytes: data.length, sha256: createHash("sha256").update(data).digest("hex") };
    await uploadPackage(p.evaluator, id, artifact);
    const downloaded = await downloadPackage(p.evaluator, id, data.length, dir);
    assert.deepEqual(await readFile(downloaded), data);
    assert.ok(ranges.every(([a, b]) => b - a <= 262144));
    const status = await new sdk.WshcmPackages(p.evaluator).getOperation({ operationId: id });
    assert.equal(status.phase, "uploaded");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
import { objectPackage } from "./helpers/package-fixtures.mjs";
test("immutable inspection rejects outside selection, repeat/version/type conflicts and returns reports", async () => {
  assert.equal(typeof sdk.WshcmPackages.prototype.inspectPackage, "function");
  const dir = await mkdtemp(join(tmpdir(), "bt-preview-"));
  let applied = 0;
  let existsType = "cost_center";
  let reimport = false;
  let version = "2025.2.1333";
  let outcome = { error: 0, error_text: "", progress_count: 1, list_count: 1 };
  let p;
  const fakeForm = () => ({
    error: 0,
    error_text: "",
    temp_package_url: "file:///tmp/owned-preview",
    GetXml: () => "<view_package/>",
    download_packages: [
      {
        id: "pkg-one",
        type: "objects",
        url: "objects.zip",
        base_url: "",
        temp_package_url: "file:///tmp/owned-part",
        objects: [{ id: "9007199254740993", type: "cost_center", name: "fixture", selected: true }],
        deleted_objects: [],
      },
    ],
  });
  const tools = {
    get_cur_user_id: () => 1n,
    random_string: () => "target-identity-123456789",
    get_package_log: () => fakeForm(),
    get_version: () => version,
    uni_process_package: (_url, form) => {
      applied++;
      assert.equal(form.download_packages[0].selected_custom_templates, false);
      return outcome;
    },
  };
  p = platform({
    tools,
    CodeLiteral: JSON.stringify,
    FileSize: (path) => Buffer.byteLength(p.files.get(path)),
    Base64Encode: (b) => Buffer.from(b).toString("base64"),
    Base64Decode: (b) => Buffer.from(b, "base64"),
    LoadFileDataRange: (path, a, b) => Buffer.from(p.files.get(path)).subarray(a, b),
    PutFileDataRange: (path, a, b, value) => p.files.set(path, Buffer.concat([Buffer.from(p.files.get(path)), value])),
    DeleteDirectory: () => {},
    UrlFromDocID: String,
    OpenDoc: (url) =>
      url === "9007199254740993"
        ? { TopElem: { Name: existsType } }
        : { TopElem: { basic: { server_version: "2025.2.1333" }, local_file_url: "x-local://wt_data/updates/owned.zip" } },
    XQuery: (q) =>
      q.includes("action_reports") ? [{ id: "99" }] : q.includes("download_packages") && (reimport || applied > 0) ? [{ id: "42" }] : [],
  });
  try {
    const path = join(dir, "source.zip");
    await writeFile(path, objectPackage());
    const service = new sdk.WshcmPackages(p.evaluator, { artifactDirectory: join(dir, "artifacts") });
    const preview = await service.inspectPackage({ localPath: path, limit: 1 });
    await writeFile(path, "changed source");
    assert.equal(preview.total, 2);
    await assert.rejects(service.importPackage({ inspectionId: preview.inspectionId, objectIds: ["1"] }), /Selection/);
    assert.equal(applied, 0);
    existsType = "collaborator";
    await assert.rejects(service.importPackage({ inspectionId: preview.inspectionId }), /Conflict/);
    assert.equal(applied, 0);
    existsType = "cost_center";
    version = "other";
    await assert.rejects(service.importPackage({ inspectionId: preview.inspectionId }), /Version/);
    assert.equal(applied, 0);
    version = "2025.2.1333";
    reimport = true;
    await assert.rejects(service.importPackage({ inspectionId: preview.inspectionId }), /Reimport/);
    assert.equal(applied, 0);
    reimport = false;
    preview.artifact.sha256 = "0".repeat(64); // Returned metadata cannot mutate the inspection binding.
    const imported = await service.importPackage({ inspectionId: preview.inspectionId });
    assert.equal(imported.status, "completed");
    assert.equal(imported.verification, "platform_report_only");
    assert.equal(applied, 1);
    assert.deepEqual(imported.reportIds, ["99"]);
    assert.deepEqual(imported.downloadIds, ["42"]);
    await assert.rejects(service.importPackage({ inspectionId: preview.inspectionId }), /Reimport/);
    assert.equal(applied, 1);
    outcome = { error: 1, error_text: "one package failed", progress_count: 0, list_count: 1 };
    const partial = await service.importPackage({ inspectionId: preview.inspectionId, allowReimport: true });
    assert.equal(partial.status, "partial");
    assert.equal(partial.error, "one package failed");
    await writeFile(preview.artifact.localPath, "tampered immutable artifact");
    await assert.rejects(service.importPackage({ inspectionId: preview.inspectionId, allowReimport: true }), /integrity/);
    assert.equal(applied, 2);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test("direct export preserves common schema and retains partial artifact for missing IDs", async () => {
  const dir = await mkdtemp(join(tmpdir(), "bt-export-"));
  let p;
  p = platform({
    XQuery: () => [],
    CodeLiteral: JSON.stringify,
    FileSize: (path) => Buffer.byteLength(p.files.get(path)),
    Base64Encode: (b) => Buffer.from(b).toString("base64"),
    LoadFileDataRange: (path, a, b) => Buffer.from(p.files.get(path)).subarray(a, b),
    tools: {
      create_list_package: (url, schema) => {
        assert.equal(schema.objects.length, 2);
        p.files.set(url, objectPackage());
        return { error: 0, error_text: "", counter: 1 };
      },
    },
  });
  try {
    const service = new sdk.WshcmPackages(p.evaluator, { artifactDirectory: join(dir, "artifacts") });
    const result = await service.exportPackage({ objectIds: ["9007199254740993", "9007199254740993", "2"] });
    assert.equal(result.status, "partial");
    assert.deepEqual(result.missingIds, ["2"]);
    assert.equal(result.objects.total, 1);
    assert.equal(p.saves, 0);
    assert.equal(p.saved.length, 1);
    assert.equal((await service.getOperation({ operationId: result.operationId })).status, "partial");
    assert.equal((await readFile(result.artifact.localPath)).length, result.artifact.sizeBytes);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test("reused operation IDs and changed account reject before mutation or receipt disclosure", async () => {
  let user = 1n;
  const p = platform({ tools: { get_cur_user_id: () => user } });
  const service = new sdk.WshcmPackages(p.evaluator);
  const operationId = randomUUID();
  await service.saveSchema({ name: "own", operationId });
  await assert.rejects(service.saveSchema({ name: "duplicate", operationId }), /Conflict/);
  assert.equal(p.saves, 1);
  user = 2n;
  await assert.rejects(service.getOperation({ operationId }), /ContextMismatch/);
  assert.equal(p.saves, 1);
});
for (const wire of [null, {}, JSON.stringify({ ok: true }), JSON.stringify(JSON.stringify({ ok: true, body: {} }))])
  test("invalid native carriers retain operation identity and unknown outcome", async () => {
    let calls = 0;
    const operationId = randomUUID();
    const service = new sdk.WshcmPackages({
      eval: async () => {
        calls++;
        return wire;
      },
    });
    await assert.rejects(
      service.saveSchema({ name: "own", operationId }),
      (error) => error.details.operationId === operationId && error.details.status === "unknown",
    );
    assert.equal(calls, 1);
  });
const validInputs = {
  listSchemas: {},
  getSchema: { schemaId: "owned" },
  saveSchema: { name: "owned" },
  deleteSchema: { schemaId: "owned", revision: "a".repeat(64) },
  addObjects: { schemaId: "owned", revision: "a".repeat(64), objectIds: ["1"] },
  removeObjects: { schemaId: "owned", revision: "a".repeat(64), objectIds: ["1"] },
  exportPackage: { objectIds: ["1"] },
  inspectPackage: { localPath: "/tmp/input.zip" },
  importPackage: { inspectionId: randomUUID() },
  getOperation: { operationId: randomUUID() },
};
for (const [method, input] of Object.entries(validInputs))
  test(`${method} rejects extra input fields before dispatch`, async () => {
    const service = new sdk.WshcmPackages({ eval: async () => assert.fail("Invalid input dispatched") });
    await assert.rejects(async () => service[method]({ ...input, unexpected: true }));
  });
test("package carriers enforce byte budget before parsing native body", async () => {
  const operationId = randomUUID();
  const inner = "x".repeat(40 * 1024 * 1024 + 1);
  const service = new sdk.WshcmPackages({ eval: async () => JSON.stringify(inner) });
  await assert.rejects(
    service.saveSchema({ name: "own", operationId }),
    (error) => error.details.status === "unknown" && /envelope size/.test(error.message),
  );
});
test("standalone update ZIP retains its stable package ID in native preview", async () => {
  const { zip } = await import("./helpers/package-fixtures.mjs");
  const dir = await mkdtemp(join(tmpdir(), "bt-standalone-"));
  let p;
  let descriptor;
  p = platform({
    FileSize: (path) => Buffer.byteLength(p.files.get(path)),
    Base64Encode: (b) => Buffer.from(b).toString("base64"),
    Base64Decode: (b) => Buffer.from(b, "base64"),
    LoadFileDataRange: (path, a, b) => Buffer.from(p.files.get(path)).subarray(a, b),
    PutFileDataRange: (path, a, b, value) => p.files.set(path, Buffer.concat([Buffer.from(p.files.get(path)), value])),
    DeleteDirectory: () => {},
    CodeLiteral: JSON.stringify,
    XQuery: () => [],
    UrlFromDocID: String,
    OpenDoc: () => ({ TopElem: { basic: { server_version: "2025.2.1333" }, Name: "cost_center" } }),
    OpenNewDoc: () => ({ TopElem: { AddChild: () => (descriptor = {}) }, Save: () => assert.equal(descriptor.id, "standalone") }),
    tools: {
      get_version: () => "2025.2.1333",
      get_package_log: () => ({
        error: 0,
        temp_package_url: "file:///tmp/owned-standalone",
        GetXml: () => "<view_package/>",
        download_packages: [
          { id: "random-native-id", type: "objects", url: "", temp_package_url: "", objects: [{ id: "1", type: "cost_center" }] },
        ],
      }),
    },
  });
  try {
    const path = join(dir, "input.zip");
    await writeFile(
      path,
      zip([
        {
          name: "update.xml",
          data: "<data><basic><id>standalone</id><server_version>2025.2.1333</server_version></basic><cost_centers><cost_center><id>1</id><name>one</name></cost_center></cost_centers></data>",
        },
      ]),
    );
    const result = await new sdk.WshcmPackages(p.evaluator, { artifactDirectory: join(dir, "artifacts") }).inspectPackage({
      localPath: path,
    });
    assert.equal(result.items[0].packageId, "standalone");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test("package input schemas serialize for MCP without transform failures", async () => {
  const { z } = await import("zod");
  for (const schema of Object.values(sdk.packageSchemas)) assert.doesNotThrow(() => z.toJSONSchema(schema));
});
test("local transfer failure after dispatch retains the queryable operation ID", async () => {
  const { uploadPackage } = await import("../build/hcm/packages/transfer.js");
  const p = platform();
  const operationId = randomUUID();
  await assert.rejects(
    uploadPackage(p.evaluator, operationId, {
      localPath: "/nonexistent/boristype-package-fixture.zip",
      sizeBytes: 1,
      sha256: "0".repeat(64),
    }),
    (error) => error instanceof sdk.WshcmPackageError && error.details.operationId === operationId && error.details.status === "unknown",
  );
  assert.equal((await new sdk.WshcmPackages(p.evaluator).getOperation({ operationId })).status, "running");
});

test("inspection pagination does not restrict default or explicit native import selection", async () => {
  const { zip } = await import("./helpers/package-fixtures.mjs");
  const dir = await mkdtemp(join(tmpdir(), "bt-full-inspection-"));
  const groups = [
    Array.from({ length: 1000 }, (_, i) => ({ id: String(9007199254740993n + BigInt(i)), type: "cost_center", name: "fixture" })),
    [{ id: "18446744073709551615", type: "cost_center", name: "last-package" }],
  ];
  const calls = [];
  let p;
  p = platform({
    FileSize: (path) => Buffer.byteLength(p.files.get(path)),
    Base64Encode: (b) => Buffer.from(b).toString("base64"),
    Base64Decode: (b) => Buffer.from(b, "base64"),
    LoadFileDataRange: (path, a, b) => Buffer.from(p.files.get(path)).subarray(a, b),
    PutFileDataRange: (path, a, b, value) => p.files.set(path, Buffer.concat([Buffer.from(p.files.get(path)), value])),
    DeleteDirectory: () => {},
    CodeLiteral: JSON.stringify,
    XQuery: () => [],
    UrlFromDocID: String,
    OpenDoc: () => ({ TopElem: { Name: "cost_center", basic: { server_version: "2025.2.1333" } } }),
    tools: {
      get_version: () => "2025.2.1333",
      get_package_log: () => ({
        error: 0,
        temp_package_url: "file:///tmp/owned-pagination",
        GetXml: () => "<view_package/>",
        download_packages: groups.map((objects, i) => ({
          id: `pkg-${i}`,
          type: "objects",
          url: `part-${i}.zip`,
          temp_package_url: `file:///tmp/owned-pagination-${i}`,
          objects: objects.map((o) => ({ ...o })),
        })),
      }),
      uni_process_package: (_url, form) => {
        calls.push(
          form.download_packages.map((part) => ({
            id: part.id,
            selected: part.selected,
            selectedIds: part.objects.filter((o) => o.selected).map((o) => String(o.id)),
          })),
        );
        return { error: 0, error_text: "", progress_count: 2, list_count: 2 };
      },
    },
  });
  try {
    const path = join(dir, "input.zip");
    await writeFile(
      path,
      zip([
        {
          name: "desc.xml",
          data: `<download_packages>${groups.map((_, i) => `<download_package><id>pkg-${i}</id><type>objects</type><url>part-${i}.zip</url></download_package>`).join("")}</download_packages>`,
        },
        ...groups.map((objects, i) => ({
          name: `part-${i}.zip`,
          data: zip([
            {
              name: "update.xml",
              data: `<data><basic><id>pkg-${i}</id><server_version>2025.2.1333</server_version></basic><cost_centers>${objects.map((o) => `<cost_center><id>${o.id}</id><name>${o.name}</name></cost_center>`).join("")}</cost_centers></data>`,
            },
          ]),
        })),
      ]),
    );
    const service = new sdk.WshcmPackages(p.evaluator, { artifactDirectory: join(dir, "artifacts") });
    const preview = await service.inspectPackage({ localPath: path });
    assert.equal(preview.items.length, 100);
    assert.equal(preview.total, 1003);
    await service.importPackage({ inspectionId: preview.inspectionId });
    assert.deepEqual(
      calls[0],
      groups.map((objects, i) => ({ id: `pkg-${i}`, selected: true, selectedIds: objects.map((o) => o.id) })),
    );
    const beyondPage = groups[0][999].id;
    await service.importPackage({ inspectionId: preview.inspectionId, objectIds: [beyondPage], allowReimport: true });
    assert.deepEqual(calls[1][0].selectedIds, [beyondPage]);
    assert.deepEqual(calls[1][1].selectedIds, []);
    await service.importPackage({ inspectionId: preview.inspectionId, packageIds: ["pkg-1"], allowReimport: true });
    assert.equal(calls[2][0].selected, false);
    assert.deepEqual(calls[2][1], { id: "pkg-1", selected: true, selectedIds: [groups[1][0].id] });
    await assert.rejects(service.importPackage({ inspectionId: preview.inspectionId, objectIds: ["1"], allowReimport: true }), /Selection/);
    await assert.rejects(
      service.importPackage({ inspectionId: preview.inspectionId, packageIds: ["outside"], allowReimport: true }),
      /Selection/,
    );
    assert.equal(calls.length, 3);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
function exportingPlatform() {
  let p;
  p = platform({
    XQuery: () => [],
    CodeLiteral: JSON.stringify,
    FileSize: (path) => Buffer.byteLength(p.files.get(path)),
    Base64Encode: (b) => Buffer.from(b).toString("base64"),
    LoadFileDataRange: (path, a, b) => Buffer.from(p.files.get(path)).subarray(a, b),
    tools: {
      create_list_package: (url) => {
        p.files.set(url, objectPackage());
        return { error: 0, error_text: "", counter: 1 };
      },
    },
  });
  return p;
}
test("unavailable temporary directory after native export preserves generated operation ID and acknowledgement", async () => {
  const dir = await mkdtemp(join(tmpdir(), "bt-missing-temp-"));
  const old = process.env.TMPDIR;
  const p = exportingPlatform();
  const service = new sdk.WshcmPackages(p.evaluator, { artifactDirectory: join(dir, "artifacts") });
  try {
    process.env.TMPDIR = join(dir, "missing-parent");
    let failure;
    try {
      await service.exportPackage({ objectIds: ["9007199254740993"] });
    } catch (error) {
      failure = error;
    }
    assert.ok(failure instanceof sdk.WshcmPackageError);
    assert.match(failure.message, /ENOENT/);
    assert.equal(failure.details.lastKnownOperation.status, "completed");
    assert.equal((await service.getOperation({ operationId: failure.details.operationId })).phase, "exported");
  } finally {
    if (old === undefined) delete process.env.TMPDIR;
    else process.env.TMPDIR = old;
    await rm(dir, { recursive: true, force: true });
  }
});
for (const loseAck of [false, true])
  test(
    `real temporary cleanup failure preserves ${loseAck ? "primary structured failure" : "successful export result"}`,
    { skip: process.platform === "win32" || process.getuid?.() === 0 },
    async () => {
      const dir = await mkdtemp(join(tmpdir(), "bt-cleanup-failure-"));
      const taskTmp = join(dir, "temp");
      await mkdir(taskTmp);
      const old = process.env.TMPDIR;
      const p = exportingPlatform();
      let restricted;
      const service = new sdk.WshcmPackages(
        {
          eval: async (code) => {
            const wire = await p.evaluator.eval(code);
            const body = JSON.parse(JSON.parse(wire)).body;
            if (body?.phase === "downloaded" && restricted === undefined) {
              const [entry] = await readdir(taskTmp);
              restricted = join(taskTmp, entry);
              await chmod(restricted, 0o500);
              if (loseAck) throw Error("lost export finalization acknowledgement");
            }
            return wire;
          },
        },
        { artifactDirectory: join(dir, "artifacts") },
      );
      try {
        process.env.TMPDIR = taskTmp;
        if (loseAck) {
          let failure;
          try {
            await service.exportPackage({ objectIds: ["9007199254740993"] });
          } catch (error) {
            failure = error;
          }
          assert.ok(failure instanceof sdk.WshcmPackageError);
          assert.equal(failure.details.code, "TransportError");
          assert.equal(failure.details.status, "unknown");
          assert.equal(failure.details.lastKnownOperation.phase, "exported");
          assert.match(failure.message, /lost export finalization/);
          assert.match(failure.details.cleanupError, /EACCES|EPERM/);
          assert.equal((await service.getOperation({ operationId: failure.details.operationId })).status, "completed");
        } else {
          const result = await service.exportPackage({ objectIds: ["9007199254740993"] });
          assert.equal(result.status, "completed");
          assert.match(result.cleanupError, /EACCES|EPERM/);
          assert.ok((await readFile(result.artifact.localPath)).length);
          assert.equal((await service.getOperation({ operationId: result.operationId })).phase, "downloaded");
        }
      } finally {
        if (old === undefined) delete process.env.TMPDIR;
        else process.env.TMPDIR = old;
        if (restricted) await chmod(restricted, 0o700);
        await rm(dir, { recursive: true, force: true });
      }
    },
  );
