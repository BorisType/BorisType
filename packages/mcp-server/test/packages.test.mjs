import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID, createHash } from "node:crypto";
import { mkdtemp, writeFile, readFile, rm, mkdir, readdir, chmod } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join, parse } from "node:path";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { createServer } from "../build/index.js";
import { packagePlatform, packageExportPlatform } from "../../ws-client/test/helpers/package-platform.mjs";
import { objectPackage } from "../../ws-client/test/helpers/package-fixtures.mjs";

const names = [
  "list_package_schemas",
  "get_package_schema",
  "save_package_schema",
  "delete_package_schema",
  "add_package_objects",
  "remove_package_objects",
  "export_package",
  "inspect_package",
  "import_package",
  "get_package_operation",
];
const id = "9007199254740993";
async function connect(t, evaluator = { eval: () => assert.fail("Unexpected native call") }, options) {
  const server = createServer({ evaluator }, options);
  const client = new Client({ name: "packages-test", version: "1" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  t.after(async () => {
    await client.close();
    await server.close();
  });
  await server.connect(b);
  await client.connect(a);
  return client;
}
async function call(client, name, args, error = false) {
  const response = await client.callTool({ name: "wshcm_" + name, arguments: args });
  assert.equal(response.isError === true, error, JSON.stringify(response).slice(0, 2000));
  assert.equal(response.content.length, 1);
  assert.ok(Buffer.byteLength(response.content[0].text) <= 262144);
  return JSON.parse(response.content[0].text);
}

test("registered package tools advertise exact SDK inputs and honest effects", async (t) => {
  const client = await connect(t);
  const { tools } = await client.listTools();
  const packages = tools.filter((tool) => names.includes(tool.name.replace("wshcm_", "")));
  assert.equal(packages.length, 10);
  for (const tool of packages) {
    if ("operationId" in tool.inputSchema.properties) {
      assert.match(tool.description, /handles are canonicalized to lowercase/);
    } else {
      assert.doesNotMatch(tool.description, /operationId/);
    }
    assert.equal(tool.inputSchema.additionalProperties, false);
    assert.equal(tool.annotations.idempotentHint, false);
    assert.equal(tool.annotations.readOnlyHint, /wshcm_(list_package_schemas|get_package_schema|get_package_operation)$/.test(tool.name));
    assert.equal(
      tool.annotations.destructiveHint,
      /wshcm_(save_package_schema|delete_package_schema|add_package_objects|remove_package_objects|import_package)$/.test(tool.name),
    );
  }
  const exp = packages.find((tool) => tool.name === "wshcm_export_package");
  assert.equal(exp.inputSchema.properties.objectIds.maxItems, 10000);
  assert.equal(exp.inputSchema.properties.objectIds.items.type, "string");
  assert.match(exp.description, /XMD/);
  assert.match(packages.find((tool) => tool.name === "wshcm_inspect_package").description, /MCP host/);
  assert.match(packages.find((tool) => tool.name === "wshcm_import_package").description, /entire immutable/);
});

test("schema CRUD through real MCP registration preserves neighbors, revisions and exact IDs", async (t) => {
  const p = packagePlatform();
  const client = await connect(t, p.evaluator);
  const before = await call(client, "list_package_schemas", { limit: 1 });
  assert.equal(before.total, 1);
  assert.equal(before.items[0].schemaId, "baseline");
  const operationId = randomUUID();
  const created = await call(client, "save_package_schema", { name: "owned", operationId: operationId.toUpperCase() });
  assert.equal(created.operation.operationId, operationId);
  assert.equal((await call(client, "get_package_operation", { operationId: operationId.toUpperCase() })).operationId, operationId);
  let current = await call(client, "get_package_schema", { schemaId: created.schemaId });
  await call(client, "add_package_objects", {
    schemaId: created.schemaId,
    revision: current.revision,
    objectIds: ["18446744073709551615", id],
  });
  current = await call(client, "get_package_schema", { schemaId: created.schemaId, limit: 1 });
  assert.equal(current.objects[0].id, "18446744073709551615");
  assert.equal(current.objectCount, 2);
  const next = await call(client, "get_package_schema", { schemaId: created.schemaId, offset: 1, limit: 1 });
  assert.equal(next.objects[0].id, id);
  await call(client, "remove_package_objects", { schemaId: created.schemaId, revision: current.revision, objectIds: [id] });
  const stale = await call(client, "delete_package_schema", { schemaId: created.schemaId, revision: current.revision }, true);
  assert.equal(stale.code, "Conflict");
  assert.equal(stale.status, "not_attempted");
  current = await call(client, "get_package_schema", { schemaId: created.schemaId });
  const deleted = await call(client, "delete_package_schema", { schemaId: created.schemaId, revision: current.revision });
  assert.equal(deleted.operation.status, "completed");
  assert.deepEqual(
    p.saved.map((s) => s.id),
    ["baseline"],
  );
});

test("lost acknowledgement preserves operationId/unknown and exposes the native receipt without retry", async (t) => {
  const p = packagePlatform();
  let lose = true;
  const client = await connect(t, {
    eval: async (code) => {
      const value = await p.evaluator.eval(code);
      if (lose) {
        lose = false;
        throw Error("lost acknowledgement");
      }
      return value;
    },
  });
  const operationId = randomUUID();
  const failed = await call(client, "save_package_schema", { name: "owned", operationId }, true);
  assert.equal(failed.operationId, operationId);
  assert.equal(failed.status, "unknown");
  assert.equal((await call(client, "get_package_operation", { operationId })).status, "completed");
  assert.equal(p.saves, 1);
});

for (const [name, args] of [
  ["export_package", {}],
  ["export_package", { objectIds: ["not-an-id"] }],
  ["export_package", { objectIds: [1] }],
  ["export_package", { objectIds: ["18446744073709551616"] }],
  ["export_package", { objectIds: Array(10001).fill("1") }],
  ["export_package", { schemaId: "a", revision: "a".repeat(64), objectIds: [id] }],
  ["save_package_schema", { schemaId: "a", name: "missing revision" }],
  ["get_package_schema", { schemaId: "a", limit: 1001 }],
  ["inspect_package", { localPath: "relative.zip" }],
  ["import_package", { inspectionId: randomUUID(), includeWvars: true }],
])
  test(`invalid ${name} never dispatches`, async (t) => {
    const client = await connect(t);
    await call(client, name, args, true);
  });

test("large validation errors remain bounded JSON with an explicit truncated marker", async (t) => {
  const client = await connect(t);
  const failed = await call(client, "export_package", { objectIds: Array(10000).fill("0") }, true);
  assert.equal(failed.code, "InvalidInput");
  assert.equal(failed.status, "not_attempted");
  assert.equal(failed.truncated, true);
});

test("generic local failures are bounded and do not dump archive bytes", async (t) => {
  const client = await connect(t, undefined, { packageImportDirectory: tmpdir() });
  const failed = await call(client, "inspect_package", { localPath: join(tmpdir(), "missing-package-" + randomUUID() + ".zip") }, true);
  assert.equal(typeof failed.message, "string");
  assert.equal(failed.code, "PackageToolError");
});

test("large schema pages have bounded text and a continuation that loses no members", async (t) => {
  const p = packagePlatform();
  p.saved[0].objects = Array.from({ length: 200 }, (_, i) => ({
    id: String(9007199254740993n + BigInt(i)),
    name: "中".repeat(4096),
    type: "cost_center",
    modify: true,
  }));
  const client = await connect(t, p.evaluator);
  const first = await call(client, "get_package_schema", { schemaId: "baseline", limit: 200 });
  assert.equal(first.objectCount, 200);
  assert.equal(first.truncated, true);
  assert.ok(first.nextPage.offset > 0 && first.nextPage.offset < 200);
  const second = await call(client, "get_package_schema", first.nextPage.arguments);
  assert.equal(BigInt(second.objects[0].id), 9007199254740993n + BigInt(first.objects.length));
});

test("export/inspect/import through the registered tools retain immutable bytes and full-snapshot defaults", async (t) => {
  const local = await mkdtemp(join(tmpdir(), "bt-mcp-packages-"));
  t.after(() => rm(local, { recursive: true, force: true }));
  let p;
  let selected;
  p = packagePlatform({
    FileSize: (path) => Buffer.byteLength(p.files.get(path)),
    Base64Encode: (b) => Buffer.from(b).toString("base64"),
    Base64Decode: (b) => Buffer.from(b, "base64"),
    LoadFileDataRange: (path, a, b) => Buffer.from(p.files.get(path)).subarray(a, b),
    PutFileDataRange: (path, a, b, bytes) => p.files.set(path, Buffer.concat([Buffer.from(p.files.get(path)), bytes])),
    DeleteDirectory: () => {},
    CodeLiteral: JSON.stringify,
    XQuery: () => [],
    UrlFromDocID: String,
    OpenDoc: () => ({ TopElem: { Name: "cost_center", basic: { server_version: "2025.2.1333" } } }),
    tools: {
      create_list_package: (url) => {
        p.files.set(url, objectPackage());
        return { error: 0, error_text: "", counter: 1 };
      },
      get_version: () => "2025.2.1333",
      get_package_log: () => ({
        error: 0,
        temp_package_url: "file:///owned-mcp-preview",
        GetXml: () => "<view_package/>",
        download_packages: [
          {
            id: "pkg-one",
            type: "objects",
            url: "objects.zip",
            temp_package_url: "file:///owned-mcp-part",
            objects: [{ id, type: "cost_center", name: "fixture" }],
          },
        ],
      }),
      uni_process_package: (_url, form) => {
        selected = form.download_packages[0].objects[0].selected;
        return { error: 0, error_text: "", progress_count: 1, list_count: 1 };
      },
    },
  });
  const packageExportDirectory = join(local, "export");
  const exporter = await connect(t, p.evaluator, { packageArtifactDirectory: join(local, "source-private"), packageExportDirectory });
  const client = await connect(t, p.evaluator, { packageArtifactDirectory: join(local, "target-private"), packageExportDirectory });
  const exported = await call(exporter, "export_package", { objectIds: [id] });
  assert.equal(exported.status, "completed");
  assert.equal(exported.verification, "archive_membership");
  const bytes = await readFile(exported.artifact.localPath);
  assert.equal(bytes.length, exported.artifact.sizeBytes);
  assert.equal(createHash("sha256").update(bytes).digest("hex"), exported.artifact.sha256);
  assert.ok(!JSON.stringify(exported).includes(bytes.toString("base64")));
  const source = exported.exportPath;
  assert.deepEqual(await readFile(source), bytes);
  const preview = await call(client, "inspect_package", { localPath: source, limit: 1 });
  assert.equal(preview.items.length, 1);
  assert.equal(preview.total, 2);
  await writeFile(source, "changed original");
  const page = await call(client, "inspect_package", { inspectionId: preview.inspectionId.toUpperCase(), offset: 1, limit: 1 });
  assert.equal(page.items[0].id, id);
  const applied = await call(client, "import_package", { inspectionId: preview.inspectionId.toUpperCase() });
  assert.equal(selected, true);
  assert.equal(applied.status, "completed");
  assert.equal(applied.verification, "platform_report_only");
  assert.equal((await call(client, "get_package_operation", { operationId: applied.operationId })).status, "completed");
  assert.deepEqual(
    p.saved.map((s) => s.id),
    ["baseline"],
  );
});

test("large settings cannot break the response bound or skip rows in continuation", async (t) => {
  const p = packagePlatform();
  p.saved[0].objects = Array.from({ length: 200 }, (_, i) => ({
    id: String(9007199254740993n + BigInt(i)),
    name: "中".repeat(4096),
    type: "cost_center",
    modify: true,
  }));
  p.saved[0].custom_templates = Array.from({ length: 1000 }, () => ({ catalog_name: "x".repeat(12000) }));
  const client = await connect(t, p.evaluator);
  const first = await call(client, "get_package_schema", { schemaId: "baseline", limit: 200 });
  assert.equal(first.nextPage.offset, first.objects.length);
  const second = await call(client, "get_package_schema", first.nextPage.arguments);
  assert.equal(BigInt(second.objects[0].id), 9007199254740993n + BigInt(first.objects.length));
  assert.equal(first.truncated, true);
  assert.ok(first.truncatedFields.length);
});

for (const loseAck of [false, true])
  test(
    `cleanup failure retains ${loseAck ? "structured unknown plus known receipt" : "completed export"} through MCP`,
    { skip: process.platform === "win32" || process.getuid?.() === 0 },
    async (t) => {
      const local = await mkdtemp(join(tmpdir(), "bt-mcp-cleanup-"));
      const taskTmp = join(local, "temp");
      await mkdir(taskTmp);
      const old = process.env.TMPDIR;
      const p = packageExportPlatform();
      let restricted;
      const client = await connect(
        t,
        {
          eval: async (code) => {
            const wire = await p.evaluator.eval(code);
            const body = JSON.parse(JSON.parse(wire)).body;
            if (body?.phase === "downloaded" && !restricted) {
              restricted = join(taskTmp, (await readdir(taskTmp))[0]);
              await chmod(restricted, 0o500);
              if (loseAck) throw Error("lost final acknowledgement");
            }
            return wire;
          },
        },
        { packageExportDirectory: join(local, "export") },
      );
      const operationId = randomUUID();
      let artifact;
      try {
        process.env.TMPDIR = taskTmp;
        const result = await call(client, "export_package", { objectIds: [id], operationId }, loseAck);
        assert.equal(result.operationId, operationId);
        assert.match(result.cleanupError, /EACCES|EPERM/);
        if (loseAck) {
          assert.equal(result.status, "unknown");
          assert.equal(result.code, "TransportError");
          assert.equal(result.lastKnownOperation.phase, "exported");
          assert.equal(result.lastKnownOperation.status, "completed");
        } else assert.equal(result.status, "completed");
        const status = await call(client, "get_package_operation", { operationId });
        assert.equal(status.status, "completed");
        artifact = status.artifact;
      } finally {
        if (old === undefined) delete process.env.TMPDIR;
        else process.env.TMPDIR = old;
        if (restricted) await chmod(restricted, 0o700);
        if (artifact) {
          await rm(artifact.localPath, { force: true });
          await rm(artifact.localPath.replace(/\.zip$/, ".json"), { force: true });
        }
        await rm(local, { recursive: true, force: true });
      }
    },
  );

test("oversized generic filesystem diagnostics are explicitly truncated", async (t) => {
  const client = await connect(t, undefined, { packageImportDirectory: tmpdir() });
  const failed = await call(client, "inspect_package", { localPath: join(tmpdir(), "中".repeat(4080) + ".zip") }, true);
  assert.equal(failed.code, "PackageToolError");
  assert.equal(failed.truncated, true);
  assert.ok(failed.message.length <= 4096);
});

test("JSON escape expansion cannot exceed the final text budget or discard mutation correlation", async (t) => {
  const p = packagePlatform({ tools: { add_object_to_package: () => ({ error: 1, message: "\u0000".repeat(4096) }) } });
  const client = await connect(t, p.evaluator);
  const schema = await call(client, "get_package_schema", { schemaId: "baseline" });
  const operationId = randomUUID();
  const response = await client.callTool({
    name: "wshcm_add_package_objects",
    arguments: {
      schemaId: "baseline",
      revision: schema.revision,
      objectIds: Array.from({ length: 16 }, (_, i) => String(i + 1)),
      operationId,
    },
  });
  assert.notEqual(response.isError, true);
  const body = JSON.parse(response.content[0].text);
  assert.equal(body.operation.operationId, operationId);
  assert.equal(body.operation.status, "partial");
  assert.equal(body.operation.phase, "saved");
  assert.equal(body.schemaId, "baseline");
  assert.equal(body.truncated, true);
  assert.ok(body.truncatedFields.some((path) => path.startsWith("errors")));
  assert.ok(Buffer.byteLength(response.content[0].text) <= 262144, `Final JSON is ${Buffer.byteLength(response.content[0].text)} bytes`);
});

for (const failure of ["missing", "unreadable", "corrupt"])
  test(`registered MCP receipt recovery preserves unknown historical outcome for ${failure} storage`, async (t) => {
    let blocked;
    let p;
    p = packagePlatform({
      LoadFileData: (path) => {
        if (path === blocked) throw Error("permission denied");
        if (!p.files.has(path)) throw Error("missing");
        return p.files.get(path);
      },
    });
    const operationId = randomUUID();
    const first = await connect(t, p.evaluator);
    const created = await call(first, "save_package_schema", { name: "owned-effect", operationId });
    assert.equal((await call(first, "get_package_schema", { schemaId: created.schemaId })).name, "owned-effect");
    assert.equal((await call(first, "get_package_operation", { operationId })).status, "completed");
    const path = `x-local://trash/boristype_packages/${operationId}/receipt.json`;
    if (failure === "missing") p.files.delete(path);
    if (failure === "corrupt") p.files.set(path, "{not JSON");
    if (failure === "unreadable") blocked = path;
    const before = new Map(p.files);
    const fresh = await connect(t, p.evaluator);
    const calls = p.calls;
    const error = await call(fresh, "get_package_operation", { operationId }, true);
    assert.equal(error.operationId, operationId);
    assert.equal(error.status, "unknown");
    assert.equal(error.code, "ReceiptUnavailable");
    assert.equal(error.phase, "receipt");
    assert.ok(error.message);
    assert.equal(p.calls, calls + 1);
    assert.equal(p.saves, 1);
    assert.equal(p.saved.find((s) => s.id === created.schemaId).name, "owned-effect");
    assert.deepEqual(p.files, before);
  });

for (const version of ["2025-06-18", "2025-11-25"]) {
  test(`package tools resolve fresh client roots on protocol ${version}`, async (t) => {
    const dir = await mkdtemp(join(tmpdir(), "bt-client-roots-"));
    t.after(() => rm(dir, { recursive: true, force: true }));
    const project = join(dir, "project");
    await mkdir(project);
    const server = createServer(
      { evaluator: packageExportPlatform().evaluator },
      {
        packageArtifactDirectory: join(dir, "private"),
        packageExportDirectory: join(dir, "export"),
      },
    );
    const client = new Client({ name: "workspace", version: "1" }, { supportedProtocolVersions: [version], capabilities: { roots: {} } });
    let roots = [{ uri: pathToFileURL(project).href }];
    let requests = 0;
    client.setRequestHandler("roots/list", () => {
      requests++;
      return { roots };
    });
    const [a, b] = InMemoryTransport.createLinkedPair();
    t.after(async () => {
      await client.close();
      await server.close();
    });
    await server.connect(b);
    await client.connect(a);
    assert.equal(server.server.getNegotiatedProtocolVersion(), version);
    const shared = await call(client, "export_package", { objectIds: [id] });
    assert.equal(requests, 0);
    const exported = await call(client, "export_package", { objectIds: [id], outputPath: "agents.zip" });
    assert.equal(exported.exportPath, join(project, "agents.zip"));
    assert.equal(requests, 1);
    await writeFile(exported.exportPath, "bad archive");
    assert.equal((await call(client, "inspect_package", { localPath: "agents.zip" }, true)).code, "InvalidPackage");
    roots = [{ uri: pathToFileURL(project).href }, { uri: pathToFileURL(dir).href }];
    assert.equal((await call(client, "inspect_package", { localPath: "agents.zip" }, true)).code, "ImportPathDenied");
    roots = [{ uri: pathToFileURL(homedir()).href }, { uri: pathToFileURL(parse(dir).root).href }, { uri: "file://remote.example/work" }];
    assert.equal((await call(client, "inspect_package", { localPath: join(homedir(), "unavailable.zip") }, true)).code, "ImportPathDenied");
    roots = [];
    assert.equal((await call(client, "inspect_package", { localPath: exported.exportPath }, true)).code, "ImportPathDenied");
    assert.equal(requests, 5);
    assert.deepEqual(await readFile(shared.exportPath), objectPackage());
  });
}
