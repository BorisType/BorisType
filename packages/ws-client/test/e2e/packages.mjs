// Opt-in owned-fixture acceptance. Never changes stand configuration.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { writeFile, mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { uploadPackage, downloadPackage } from "../../build/hcm/packages/transfer.js";
import { createHash, randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { verifyPackageReceiptRecovery } from "../helpers/package-native-recovery.mjs";
import { cleanupPackageFixtures } from "../helpers/package-native-cleanup.mjs";
import { objectPackage, zip } from "../helpers/package-fixtures.mjs";
import { WshcmClient, WshcmPackages } from "../../build/index.js";
if (!process.env.WSHCM_USERNAME || !process.env.WSHCM_PASSWORD) throw Error("WSHCM_USERNAME and WSHCM_PASSWORD required");
const client = new WshcmClient({
  host: process.env.WSHCM_HOST ?? "localhost",
  port: Number(process.env.WSHCM_PORT ?? 80),
  overHttps: false,
  username: process.env.WSHCM_USERNAME,
  password: process.env.WSHCM_PASSWORD,
  requestTimeout: 60000,
});
const e = client.createEvaluator();
const local = await mkdtemp(join(tmpdir(), "bt-native-packages-"));
const api = new WshcmPackages(e, { artifactDirectory: join(local, "artifacts") });
const marker = "bt-packages-" + randomUUID();
const receipt = { marker, operations: [], stages: [] };
const ev = async (code) => JSON.parse(await e.eval(code));
let schemaId;
let ids = [];
let packageIds = [];
await client.initialize();
await e.initialize();
try {
  receipt.identity = await ev(`return EncodeJson({version:String(tools.get_version('wtv')),accountId:StrInt(tools.get_cur_user_id())});`);
  receipt.codeFiles = {};
  for (const file of [
    "packages/ws-client/src/hcm/packages/service.ts",
    "packages/ws-client/src/hcm/packages/schemas.ts",
    "packages/ws-client/resources/package-operation.bs",
    "packages/ws-client/test/e2e/packages.mjs",
    "packages/ws-client/test/helpers/package-native-recovery.mjs",
    "packages/ws-client/test/helpers/package-native-cleanup.mjs",
  ])
    receipt.codeFiles[file] = createHash("sha256")
      .update(await readFile(new URL("../../../../" + file, import.meta.url)))
      .digest("hex");
  receipt.revision = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).stdout.trim();
  receipt.baseline = await e.eval("return OpenDoc('x-local://'+DefaultDb+'/lists/wtv_package_objects.xml').TopElem.GetXml();");
  const op = randomUUID();
  receipt.operations.push(op);
  const created = await api.saveSchema({ name: marker, operationId: op.toUpperCase() });
  schemaId = created.schemaId;
  let read = await api.getSchema({ schemaId });
  assert.equal(read.name, marker);
  assert.equal(created.operation.operationId, op);
  assert.equal((await new WshcmPackages(e).getOperation({ operationId: op.toUpperCase() })).operationId, op);
  receipt.recovery = await verifyPackageReceiptRecovery(e, {
    operationId: op,
    schemaId,
    marker,
    lookup: async (operationId) => {
      let calls = 0;
      const fresh = new WshcmPackages({
        eval: (code) => {
          calls++;
          return e.eval(code);
        },
      });
      try {
        await fresh.getOperation({ operationId });
        assert.fail("Receipt loss unexpectedly succeeded");
      } catch (error) {
        assert.equal(calls, 1);
        assert.ok(error.details);
        return error.details;
      }
    },
  });
  ids = await ev(
    `var ids=[];var i;var d;for(i=0;i<32;i++){d=OpenNewDoc('x-local://wtv/wtv_cost_center.xmd');d.TopElem.code='${marker}';d.TopElem.name='archive-value-'+i;d.BindToDb(DefaultDb);d.Save();ids.push(StrSignedInt(d.DocID));}return EncodeJson(ids);`,
  );
  receipt.fixtureIds = ids;
  for (const action of ["add", "remove", "rename"]) {
    const op = randomUUID();
    receipt.operations.push(op);
    if (action === "add") await api.addObjects({ schemaId, revision: read.revision, objectIds: ids, operationId: op });
    if (action === "remove") await api.removeObjects({ schemaId, revision: read.revision, objectIds: [ids[2]], operationId: op });
    if (action === "rename") await api.saveSchema({ schemaId, revision: read.revision, name: marker + "-renamed", operationId: op });
    read = await api.getSchema({ schemaId });
    receipt.stages.push({ action, count: read.objectCount, name: read.name });
  }
  assert.equal(read.objectCount, 31);
  assert.equal(read.name, marker + "-renamed");
  const opDelete = randomUUID();
  receipt.operations.push(opDelete);
  await api.deleteSchema({ schemaId, revision: read.revision, operationId: opDelete });
  schemaId = undefined;
  assert.equal(await e.eval("return OpenDoc('x-local://'+DefaultDb+'/lists/wtv_package_objects.xml').TopElem.GetXml();"), receipt.baseline);
  receipt.schemaUnchanged = true;
  const exportId = randomUUID();
  receipt.operations.push(exportId);
  const exported = await api.exportPackage({ objectIds: ids, operationId: exportId });
  assert.equal(exported.status, "completed");
  assert.equal(exported.objects.total, 32);
  receipt.export = { sizeBytes: exported.artifact.sizeBytes, sha256: exported.artifact.sha256, operation: exported.operation };
  assert.equal(await e.eval("return OpenDoc('x-local://'+DefaultDb+'/lists/wtv_package_objects.xml').TopElem.GetXml();"), receipt.baseline);
  const inspectId = randomUUID();
  receipt.operations.push(inspectId);
  const preview = await api.inspectPackage({
    artifactId: exported.artifact.artifactId.toUpperCase(),
    operationId: inspectId.toUpperCase(),
  });
  packageIds = preview.items.filter((x) => x.kind === "package").map((x) => x.packageId);
  receipt.inspection = { operation: preview.operation, total: preview.total };
  const binding = await ev(`return LoadFileData(UrlToFilePath('x-local://trash/boristype_packages/${inspectId}/source.json'));`);
  if (!receipt.operations.includes(binding.sourceId)) receipt.operations.push(binding.sourceId);
  await e.eval(`DeleteDoc(UrlFromDocID(Int('${ids[0]}')),true);return;`);
  for (const stage of ["create", "update", "skip"]) {
    if (stage !== "create") await e.eval(`var d=OpenDoc(UrlFromDocID(Int('${ids[0]}')));d.TopElem.name='local-${stage}';d.Save();return;`);
    const operationId = randomUUID();
    receipt.operations.push(operationId);
    const applied = await api.importPackage({
      inspectionId: preview.inspectionId.toUpperCase(),
      operationId: operationId.toUpperCase(),
      allowReimport: stage !== "create",
      ...(stage === "skip" ? { objectIds: [ids[1]] } : {}),
    });
    receipt.stages.push({ action: stage, operation: applied });
    const name = (
      await ev(`var rd=OpenDoc(UrlFromDocID(Int('${ids[0]}')));return EncodeJson({name:String(rd.TopElem.name),xml:rd.TopElem.GetXml()});`)
    ).name;
    assert.equal(name, stage === "skip" ? "local-skip" : "archive-value-0");
    assert.equal(applied.status, "completed");
    assert.ok(applied.downloadIds.length);
    assert.ok(applied.reportIds.length);
    receipt.stages.push({ action: stage, operation: applied, name });
  }
  await assert.rejects(api.importPackage({ inspectionId: preview.inspectionId }), /Reimport/);
  for (const negative of ["version", "type"]) {
    const path = join(local, negative + ".zip");
    await writeFile(
      path,
      objectPackage({
        id: ids[0],
        ...(negative === "version"
          ? { version: "0.0.0" }
          : { type: "org", version: preview.items.find((x) => x.kind === "package").serverVersion }),
      }),
    );
    const inspectId = randomUUID();
    receipt.operations.push(inspectId);
    const negativePreview = await api.inspectPackage({ localPath: path, operationId: inspectId });
    const operationId = randomUUID();
    receipt.operations.push(operationId);
    await assert.rejects(
      api.importPackage({ inspectionId: negativePreview.inspectionId, operationId }),
      negative === "version" ? /VersionMismatch/ : /TypeConflict/,
    );
    receipt.stages.push({ action: negative + "-rejected" });
  }
  const standaloneId = "standalone-" + randomUUID();
  packageIds.push(standaloneId);
  const standalonePath = join(local, "standalone.zip");
  await writeFile(
    standalonePath,
    zip([
      {
        name: "update.xml",
        data: `<data><basic><id>${standaloneId}</id><server_version>${preview.items.find((x) => x.kind === "package").serverVersion}</server_version></basic><cost_centers><cost_center><id>${ids[1]}</id><code>${marker}</code><name>standalone-value</name></cost_center></cost_centers></data>`,
      },
    ]),
  );
  const standaloneInspect = randomUUID();
  receipt.operations.push(standaloneInspect);
  const standalone = await api.inspectPackage({ localPath: standalonePath, operationId: standaloneInspect });
  assert.equal(standalone.items[0].packageId, standaloneId);
  const standaloneImport = randomUUID();
  receipt.operations.push(standaloneImport);
  const standaloneApplied = await api.importPackage({ inspectionId: standalone.inspectionId, operationId: standaloneImport });
  assert.equal(standaloneApplied.status, "completed");
  assert.equal(
    (await ev(`return EncodeJson({name:String(OpenDoc(UrlFromDocID(Int('${ids[1]}'))).TopElem.name)});`)).name,
    "standalone-value",
  );
  receipt.stages.push({ action: "standalone-import", operation: standaloneApplied });
  const formats = await ev(
    `var inputs=['9223372036854775808','18446744073709551615'];var out=[];var v;for(v in inputs)out.push({input:v,actual:StrInt(Int(v))});return EncodeJson(out);`,
  );
  for (const f of formats) assert.equal(f.actual, f.input);
  receipt.unsignedIds = formats;
  const largePath = join(local, "large-package.zip");
  await writeFile(
    largePath,
    objectPackage({ id: ids[1], version: preview.items.find((x) => x.kind === "package").serverVersion, padding: randomBytes(524307) }),
  );
  const largeId = randomUUID();
  receipt.operations.push(largeId);
  const largePreview = await api.inspectPackage({ localPath: largePath, operationId: largeId });
  assert.ok(largePreview.artifact.sizeBytes > 524288);
  assert.equal(largePreview.total, 2);
  receipt.largeArchive = { sizeBytes: largePreview.artifact.sizeBytes, sha256: largePreview.artifact.sha256, total: largePreview.total };
  const chunkId = randomUUID();
  receipt.operations.push(chunkId);
  const bytes = Buffer.alloc(524307);
  for (let i = 0; i < bytes.length; i++) bytes[i] = i % 256;
  const binary = join(local, "binary.zip");
  await writeFile(binary, bytes);
  const hash = createHash("sha256").update(bytes).digest("hex");
  await uploadPackage(e, chunkId, { localPath: binary, sizeBytes: bytes.length, sha256: hash });
  const downloaded = await downloadPackage(e, chunkId, bytes.length, local);
  assert.deepEqual(await readFile(downloaded), bytes);
  receipt.chunk = { sizeBytes: bytes.length, sha256: hash, identical: true };
} catch (error) {
  receipt.error = String(error);
  receipt.stack = error.stack;
  receipt.details = error.details;
  process.exitCode = 1;
} finally {
  try {
    if (schemaId) {
      const s = await api.getSchema({ schemaId });
      if (s.name.startsWith(marker)) {
        const op = randomUUID();
        receipt.operations.push(op);
        await api.deleteSchema({ schemaId, revision: s.revision, operationId: op });
      }
    }
    Object.assign(receipt, await cleanupPackageFixtures(e, { marker, ids, packageIds, operations: receipt.operations }));
  } catch (error) {
    receipt.cleanupError = String(error);
    process.exitCode = 1;
  }
  receipt.closed = await e.close();
  await rm(local, { recursive: true, force: true });
  await writeFile(process.env.WSHCM_PACKAGE_RECEIPT ?? "/tmp/boristype-packages-acceptance.json", JSON.stringify(receipt, null, 2));
  console.log(JSON.stringify(receipt, null, 2));
}
