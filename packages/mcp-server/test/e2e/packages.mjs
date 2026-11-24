// Opt-in acceptance against an existing stand. Never installs/restarts/reconfigures it.
import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { mkdtemp, readFile, writeFile, rm, access } from "node:fs/promises";
import { dirname, basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { WshcmClient, WshcmPackages } from "@boristype/ws-client";
import { verifyPackageReceiptRecovery } from "../../../ws-client/test/helpers/package-native-recovery.mjs";
import { cleanupPackageFixtures } from "../../../ws-client/test/helpers/package-native-cleanup.mjs";

const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");

test(
  "native package lifecycle through actual CLI/stdio preserves baseline and cleans exact owned fixtures",
  { timeout: 240000 },
  async (t) => {
    assert.ok(process.env.WSHCM_USERNAME && process.env.WSHCM_PASSWORD, "WSHCM_USERNAME and WSHCM_PASSWORD required");
    const container = process.env.WSHCM_PACKAGE_CONTAINER;
    assert.ok(container, "WSHCM_PACKAGE_CONTAINER required for evaluator cleanup verification");
    const docker = (...args) => execFileSync("docker", args, { encoding: "utf8", timeout: 10000, maxBuffer: 1024 * 1024 });
    const evaluators = () =>
      docker("exec", container, "find", "/WebsoftServer/wt", "-maxdepth", "1", "-type", "f", "-name", "unsafe_eval_*.bs", "-printf", "%f\n")
        .trim()
        .split("\n")
        .filter(Boolean)
        .sort();
    const baselineEvaluators = evaluators();
    const options = {
      host: process.env.WSHCM_HOST ?? "localhost",
      port: Number(process.env.WSHCM_PORT ?? 80),
      overHttps: process.env.WSHCM_HTTPS === "true",
      username: process.env.WSHCM_USERNAME,
      password: process.env.WSHCM_PASSWORD,
      requestTimeout: 60000,
    };
    const soap = new WshcmClient(options);
    const e = soap.createEvaluator();
    const ev = async (code) => JSON.parse(await e.eval(code));
    const client = new Client({ name: "package-native-acceptance", version: "1" }, { supportedProtocolVersions: ["2025-11-25"] });
    const exportDirectory = await mkdtemp(join(tmpdir(), "bt-stdio-export-"));
    t.after(() => rm(exportDirectory, { recursive: true, force: true }));
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [fileURLToPath(new URL("../../build/cli.js", import.meta.url)), "--shared-directory", exportDirectory],
      env: {
        ...process.env,
        NODE_USE_ENV_PROXY: "0",
        WSHCM_HOST: options.host,
        WSHCM_PORT: String(options.port),
        WSHCM_HTTPS: String(options.overHttps),
      },
      stderr: "pipe",
    });
    let stderrBytes = 0;
    transport.stderr.on("data", (chunk) => {
      stderrBytes += chunk.length;
    });
    const marker = "bt-packages-" + randomUUID();
    const customScope = { objectType: "cost_center" };
    const fieldName = marker.replaceAll("-", "_");
    const pageId = fieldName + "_page";
    const receipt = { marker, carrier: "CLI/stdio/SOAP; no BorisType DLL", operations: [], artifacts: [], fixtureIds: [] };
    const packageIds = [];
    let schemaId;
    let cliEvaluator;
    let baseline;
    let customBaseline;
    const readCustomRegistry = () => e.eval("return OpenDoc(custom_templates.Doc.Url).TopElem.Xml;");
    async function call(name, args = {}) {
      const result = await client.callTool({ name: "wshcm_" + name, arguments: args }, { timeout: 60000 });
      assert.notEqual(result.isError, true, JSON.stringify(result).slice(0, 3000));
      assert.equal(result.content.length, 1);
      assert.ok(Buffer.byteLength(result.content[0].text) <= 262144);
      const body = JSON.parse(result.content[0].text);
      if (body.artifact && !receipt.artifacts.some((a) => a.artifactId === body.artifact.artifactId)) receipt.artifacts.push(body.artifact);
      return body;
    }
    const operationId = () => {
      const id = randomUUID();
      receipt.operations.push(id);
      return id;
    };
    try {
      await soap.initialize();
      await e.initialize();
      receipt.identity = await ev(
        "return EncodeJson({version:String(tools.get_version('wtv')),accountId:StrInt(tools.get_cur_user_id())});",
      );
      receipt.image = JSON.parse(docker("inspect", "--format", '{"image":{{json .Config.Image}},"imageId":{{json .Image}}}', container));
      receipt.code = { revision: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(), files: {} };
      for (const file of [
        "packages/mcp-server/src/tools/packages.ts",
        "packages/mcp-server/src/server.ts",
        "packages/ws-client/src/hcm/packages/service.ts",
        "packages/ws-client/src/hcm/packages/schemas.ts",
        "packages/ws-client/src/hcm/packages/archive.ts",
        "packages/ws-client/test/helpers/package-native-recovery.mjs",
        "packages/ws-client/resources/package-operation.bs",
        "packages/mcp-server/test/e2e/packages.mjs",
        "packages/ws-client/test/helpers/package-native-cleanup.mjs",
      ])
        receipt.code.files[file] = hash(await readFile(fileURLToPath(new URL("../../../../" + file, import.meta.url))));
      baseline = await e.eval("return OpenDoc('x-local://'+DefaultDb+'/lists/wtv_package_objects.xml').TopElem.GetXml();");
      receipt.baselineSha256 = hash(baseline);
      const beforeCLI = evaluators();
      await client.connect(transport, { timeout: 35000 });
      receipt.toolCount = (await client.listTools()).tools.length;
      assert.equal(receipt.toolCount, 33);
      let schemas;
      try {
        schemas = await call("list_package_schemas", { limit: 1 });
      } finally {
        const added = evaluators().filter((name) => !beforeCLI.includes(name));
        if (added.length === 1) cliEvaluator = added[0];
      }
      assert.ok(cliEvaluator, "Use an exclusive stand; expected exactly one CLI evaluator");
      receipt.cliEvaluator = cliEvaluator;
      receipt.baselineSchemas = schemas.items.map(({ schemaId, name, objectCount }) => ({ schemaId, name, objectCount }));
      const createId = operationId();
      const created = await call("save_package_schema", { name: marker, operationId: createId.toUpperCase() });
      assert.equal(created.operation.operationId, createId);
      schemaId = created.schemaId;
      receipt.schemaId = schemaId;
      assert.equal((await call("get_package_operation", { operationId: createId.toUpperCase() })).operationId, createId);
      receipt.recovery = await verifyPackageReceiptRecovery(e, {
        operationId: createId,
        schemaId,
        marker,
        lookup: async (operationId) => {
          const result = await client.callTool({ name: "wshcm_get_package_operation", arguments: { operationId } }, { timeout: 60000 });
          assert.equal(result.isError, true);
          return JSON.parse(result.content[0].text);
        },
      });
      receipt.fixtureIds = await ev(
        `var out=[];var i;var d;for(i=0;i<2;i++){d=OpenNewDoc('x-local://wtv/wtv_cost_center.xmd');d.TopElem.code='${marker}';d.TopElem.name='archive-'+i;d.BindToDb(DefaultDb);d.Save();out.push(StrInt(d.DocID));}return EncodeJson(out);`,
      );
      let schema = await call("get_package_schema", { schemaId });
      await call("add_package_objects", { schemaId, revision: schema.revision, objectIds: receipt.fixtureIds, operationId: operationId() });
      schema = await call("get_package_schema", { schemaId, limit: 1 });
      assert.equal(schema.objectCount, 2);
      assert.equal((await call("get_package_schema", { schemaId, offset: 1, limit: 1 })).objects.length, 1);
      await call("remove_package_objects", {
        schemaId,
        revision: schema.revision,
        objectIds: [receipt.fixtureIds[1]],
        operationId: operationId(),
      });
      schema = await call("get_package_schema", { schemaId });
      assert.equal(schema.objectCount, 1);
      const empty = await call("get_custom_field_definitions", { scope: customScope });
      assert.deepEqual(empty.fields, [], "Custom template import requires that cost_center have no existing fields");
      assert.deepEqual(empty.pages, [], "Custom template import requires that cost_center have no existing pages");
      customBaseline = await readCustomRegistry();
      const definitions = await call("patch_custom_field_definitions", {
        scope: customScope,
        revision: empty.revision,
        operations: [
          { op: "upsertPage", id: pageId, set: { title: "Package fixture" } },
          { op: "upsertField", name: fieldName, set: { title: "Office", type: "combo", pageId, options: ["One", "Two"] } },
        ],
      });
      assert.equal(definitions.writeStatus, "saved");
      const templateTypes = ["cost_center"];
      if (await ev("return EncodeJson(custom_templates.request_type.items.ChildNum > 0);")) templateTypes.push("request_type");
      const selectedTypes = [...templateTypes, fieldName];
      await call("save_package_schema", {
        schemaId,
        revision: schema.revision,
        name: marker + "-renamed",
        settings: { customTemplates: selectedTypes, processCustomTemplates: true },
        operationId: operationId(),
      });
      schema = await call("get_package_schema", { schemaId });
      assert.equal(schema.name, marker + "-renamed");
      assert.equal(schema.settings.processCustomTemplates, true);
      assert.deepEqual(schema.settings.customTemplates, selectedTypes);
      const configured = await call("export_package", { schemaId, revision: schema.revision, operationId: operationId() });
      assert.equal(configured.objects.total, 1);
      assert.deepEqual(configured.customTemplateTypes.slice().sort(), templateTypes);
      assert.deepEqual(configured.missingCustomTemplates, [fieldName]);
      assert.equal(configured.status, "partial");
      await call("delete_package_schema", { schemaId, revision: schema.revision, operationId: operationId() });
      schemaId = undefined;
      assert.equal(await e.eval("return OpenDoc('x-local://'+DefaultDb+'/lists/wtv_package_objects.xml').TopElem.GetXml();"), baseline);
      const exported = await call("export_package", { objectIds: receipt.fixtureIds, operationId: operationId() });
      assert.equal(exported.status, "completed");
      assert.equal(exported.objects.total, 2);
      const bytes = await readFile(exported.artifact.localPath);
      assert.equal(bytes.length, exported.artifact.sizeBytes);
      assert.equal(hash(bytes), exported.artifact.sha256);
      assert.ok(!JSON.stringify(exported).includes(bytes.toString("base64")));
      receipt.export = exported;
      const preview = await call("inspect_package", {
        artifactId: exported.artifact.artifactId.toUpperCase(),
        limit: 1,
        operationId: operationId().toUpperCase(),
      });
      assert.equal(preview.total, 3);
      assert.equal(preview.items.length, 1);
      packageIds.push(preview.items[0].packageId);
      receipt.inspection = preview;
      const page = await call("inspect_package", { inspectionId: preview.inspectionId.toUpperCase(), offset: 1, limit: 2 });
      assert.deepEqual(page.items.map((item) => item.id).sort(), [...receipt.fixtureIds].sort());
      await e.eval(
        `var ids=ParseJson('${JSON.stringify(receipt.fixtureIds)}');var i;var d;for(i=0;i<ArrayCount(ids);i++){d=OpenDoc(UrlFromDocID(Int(ids[i])));d.TopElem.name='local-change';d.Save();}return;`,
      );
      // Default import covers both objects although the initial response showed only the package row.
      const applied = await call("import_package", {
        inspectionId: preview.inspectionId.toUpperCase(),
        operationId: operationId().toUpperCase(),
      });
      assert.equal(applied.status, "completed");
      assert.equal(applied.verification, "platform_report_only");
      assert.ok(applied.reportIds.length && applied.downloadIds.length);
      receipt.import = applied;
      receipt.readback = await ev(
        `var ids=ParseJson('${JSON.stringify(receipt.fixtureIds)}');var out=[];var i;var d;for(i=0;i<ArrayCount(ids);i++){d=OpenDoc(UrlFromDocID(Int(ids[i])));out.push({id:ids[i],name:String(d.TopElem.name)});}return EncodeJson(out);`,
      );
      assert.deepEqual(
        receipt.readback.map((row) => row.name),
        ["archive-0", "archive-1"],
      );
      receipt.status = await call("get_package_operation", { operationId: applied.operationId });
      assert.equal(receipt.status.status, "completed");

      const mixed = await call("export_package", {
        objectIds: [receipt.fixtureIds[0]],
        customTemplates: ["cost_center", fieldName],
        operationId: operationId(),
      });
      assert.equal(mixed.status, "partial");
      assert.deepEqual(
        mixed.objects.items.map((item) => item.id),
        [receipt.fixtureIds[0]],
      );
      assert.deepEqual(mixed.customTemplateTypes, ["cost_center"]);
      assert.deepEqual(mixed.missingCustomTemplates, [fieldName]);

      const templateExport = await call("export_package", { customTemplates: ["cost_center"], operationId: operationId() });
      assert.equal(templateExport.status, "completed");
      assert.equal(templateExport.objects.total, 0);
      assert.deepEqual(templateExport.customTemplateTypes, ["cost_center"]);
      assert.deepEqual(templateExport.missingCustomTemplates, []);
      const templatePreview = await call("inspect_package", { artifactId: templateExport.artifact.artifactId, operationId: operationId() });
      assert.equal(templatePreview.total, 1);
      assert.equal(templatePreview.items[0].hasCustomTemplates, true);
      assert.deepEqual(templatePreview.items[0].customTemplateTypes, ["cost_center"]);
      packageIds.push(templatePreview.items[0].packageId);
      const cleared = await call("patch_custom_field_definitions", {
        scope: customScope,
        revision: definitions.revision,
        operations: [
          { op: "removeField", name: fieldName },
          { op: "removePage", id: pageId },
        ],
      });
      assert.deepEqual(cleared.fields, []);
      assert.deepEqual(cleared.pages, []);
      const templateImport = await call("import_package", {
        inspectionId: templatePreview.inspectionId,
        includeCustomTemplates: true,
        operationId: operationId(),
      });
      assert.equal(templateImport.status, "completed");
      const restored = await call("get_custom_field_definitions", { scope: customScope });
      assert.deepEqual(restored.fields, definitions.fields);
      assert.deepEqual(restored.pages, definitions.pages);
      receipt.customTemplates = { configured, mixed, templateExport, templatePreview, templateImport };
      receipt.schemaUnchanged =
        (await e.eval("return OpenDoc('x-local://'+DefaultDb+'/lists/wtv_package_objects.xml').TopElem.GetXml();")) === baseline;
      assert.equal(receipt.schemaUnchanged, true);
    } catch (error) {
      receipt.error = String(error);
      throw error;
    } finally {
      try {
        try {
          if (schemaId) {
            const api = new WshcmPackages(e);
            const schema = await api.getSchema({ schemaId });
            assert.ok(schema.name.startsWith(marker));
            await api.deleteSchema({ schemaId, revision: schema.revision, operationId: operationId() });
          }
          Object.assign(
            receipt,
            await cleanupPackageFixtures(e, { marker, ids: receipt.fixtureIds, packageIds, operations: receipt.operations }),
          );
        } finally {
          if (customBaseline !== undefined) {
            const restored = await ev(`
var doc = OpenDoc(custom_templates.Doc.Url);
var node = doc.TopElem.cost_center;
var field = node.fields.GetOptChildByKey('${fieldName}');
var page = node.sheets.GetOptChildByKey('${pageId}');
if (field != undefined || page != undefined) {
    if (field != undefined) field.Delete();
    if (page != undefined) page.Delete();
    ms_tools.save_cached_doc(doc);
}
return EncodeJson(OpenDoc(doc.Url).TopElem.Xml == custom_templates.Xml);
`);
            assert.equal(restored, true);
            receipt.customRegistryRestored = (await readCustomRegistry()) === customBaseline;
            assert.equal(receipt.customRegistryRestored, true, "Custom template cleanup must restore the exact original registry");
          }
        }
        receipt.schemaUnchangedAfterCleanup =
          (await e.eval("return OpenDoc('x-local://'+DefaultDb+'/lists/wtv_package_objects.xml').TopElem.GetXml();")) === baseline;
        assert.equal(receipt.schemaUnchangedAfterCleanup, true);
      } finally {
        await client.close();
        const deadline = Date.now() + 5000;
        while (cliEvaluator && evaluators().includes(cliEvaluator) && Date.now() < deadline) await delay(100);
        receipt.cliEvaluatorRemoved = !cliEvaluator || !evaluators().includes(cliEvaluator);
        receipt.helperEvaluatorClosed = await e.close();
        for (const artifact of receipt.artifacts) {
          assert.equal(basename(artifact.localPath), artifact.artifactId + ".zip");
          await rm(artifact.localPath, { force: true });
          const sidecar = join(dirname(artifact.localPath), artifact.artifactId + ".json");
          await rm(sidecar, { force: true });
          await assert.rejects(access(artifact.localPath));
          await assert.rejects(access(sidecar));
        }
        receipt.localArtifactsRemoved = receipt.artifacts.map((a) => a.artifactId);
        receipt.evaluatorsAfter = evaluators();
        receipt.evaluatorsBefore = baselineEvaluators;
        receipt.stderrBytes = stderrBytes;
        await writeFile(
          process.env.WSHCM_MCP_PACKAGE_RECEIPT ?? "/tmp/boristype-mcp-packages-acceptance.json",
          JSON.stringify(receipt, null, 2),
        );
      }
      assert.equal(receipt.cliEvaluatorRemoved, true);
      assert.equal(receipt.helperEvaluatorClosed, true);
      assert.deepEqual(receipt.evaluatorsAfter, baselineEvaluators);
      t.diagnostic(
        JSON.stringify({
          marker,
          fixtureIds: receipt.fixtureIds,
          cleanup: receipt.cleanup,
          schemaUnchanged: receipt.schemaUnchangedAfterCleanup,
          customRegistryRestored: receipt.customRegistryRestored,
          artifactHashes: receipt.artifacts.map((a) => a.sha256),
          stderrBytes,
        }),
      );
    }
  },
);
