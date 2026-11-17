// Opt-in owned-fixture acceptance. Never changes stand configuration.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { writeFile, mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { uploadPackage, downloadPackage } from "../../build/hcm/packages/transfer.js";
import { createHash, randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
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
  receipt.revision = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).stdout.trim();
  receipt.baseline = await e.eval("return OpenDoc('x-local://'+DefaultDb+'/lists/wtv_package_objects.xml').TopElem.GetXml();");
  const op = randomUUID();
  receipt.operations.push(op);
  const created = await api.saveSchema({ name: marker, operationId: op });
  schemaId = created.schemaId;
  let read = await api.getSchema({ schemaId });
  assert.equal(read.name, marker);
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
  const preview = await api.inspectPackage({ artifactId: exported.artifact.artifactId, operationId: inspectId });
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
      inspectionId: preview.inspectionId,
      operationId,
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
    receipt.cleanup =
      await ev(`var ids=ParseJson('${JSON.stringify(ids)}');var ops=ParseJson('${JSON.stringify(receipt.operations)}');var packages=ParseJson('${JSON.stringify(packageIds)}');var i;var j;var d;var rows;var r;var owned;var root;var paths;var url;var urls=[];var reports=[];var downloads=[];var seen;var cleanupErrors=[];
   for(i=0;i<ArrayCount(ids);i++){try{seen=ArrayOptFirstElem(XQuery('for $c in cost_centers where $c/id = '+ids[i]+' and $c/code = "${marker}" return $c'));if(seen==undefined)continue;d=OpenNewDoc('x-local://wtv/wtv_cost_center.xmd');d.TopElem.code='${marker}';d.TopElem.name='cleanup';d.BindToDb(DefaultDb,Int(ids[i]));d.Save();DeleteDoc(UrlFromDocID(d.DocID),true);}catch(err){cleanupErrors.push(String(err));}}
   for(i=0;i<ArrayCount(packages);i++){rows=ArraySelectAll(XQuery('for $d in download_packages where $d/package_id = '+CodeLiteral(packages[i])+' return $d'));for(j=0;j<ArrayCount(rows);j++){d=OpenDoc(UrlFromDocID(rows[j].id));urls.push(String(d.TopElem.local_file_url));downloads.push(StrSignedInt(rows[j].id));DeleteDoc(d.Url,true);}}
   for(i=0;i<ArrayCount(ops);i++){root='x-local://trash/boristype_packages/'+ops[i];urls.push(root+'/archive.zip');try{owned=ParseJson(LoadFileData(UrlToFilePath(root+'/source.json')));if(ArrayOptFind(ops,'This=='+CodeLiteral(owned.sourceId))==undefined)ops.push(owned.sourceId);}catch(err){}try{paths=ParseJson(LoadFileData(UrlToFilePath(root+'/owned-paths.json')));for(j=0;j<ArrayCount(paths);j++){try{if(paths[j]!='')DeleteDirectory(paths[j]);}catch(err){}}}catch(err){}}
   for(i=0;i<ArrayCount(urls);i++){rows=ArraySelectAll(XQuery('for $r in action_reports where $r/data_file_url = '+CodeLiteral(urls[i])+' return $r'));for(j=0;j<ArrayCount(rows);j++){reports.push(StrSignedInt(rows[j].id));DeleteDoc(UrlFromDocID(rows[j].id),true);}try{DeleteUrl(urls[i]);}catch(err){}try{DeleteFile(UrlToFilePath(urls[i]));}catch(err){}}
   for(i=0;i<ArrayCount(ops);i++){try{DeleteDirectory('x-local://trash/boristype_packages/'+ops[i]);}catch(err){}}
   return EncodeJson({objectsRemaining:ArrayCount(XQuery('for $c in cost_centers where $c/code = "${marker}" return $c')),reportsDeleted:reports,downloadsDeleted:downloads,operationsDeleted:ops,errors:cleanupErrors});`);
    assert.deepEqual(receipt.cleanup.errors, []);
    if (receipt.cleanup.objectsRemaining && process.env.WSHCM_PACKAGE_DB_CONTAINER) {
      const remaining = await ev(
        `var out=[];var r;for(r in XQuery('for $c in cost_centers where $c/code = "${marker}" return $c'))out.push(StrInt(r.id));return EncodeJson(out);`,
      );
      receipt.projectionCleanup = [];
      for (const id of remaining) {
        assert.ok(ids.includes(id));
        assert.match(id, /^[1-9][0-9]{0,19}$/);
        assert.match(marker, /^bt-packages-[a-f0-9-]+$/);
        const missing = await ev(
          `var absent=false;try{OpenDoc(UrlFromDocID(Int('${id}')));}catch(err){absent=true;}return EncodeJson({absent:absent});`,
        );
        assert.equal(missing.absent, true);
        const sql = `DELETE FROM dbo.cost_centers AS c WHERE c.id = ${id} AND c.code = '${marker}' AND EXISTS (SELECT 1 FROM dbo."(spxml_objects)" AS m WHERE m.id = c.id AND m.is_deleted = 1) RETURNING CAST(c.id AS text);
SELECT count(*) FROM dbo.cost_centers WHERE id = ${id};
`;
        const db = spawnSync(
          "docker",
          [
            "exec",
            "-i",
            process.env.WSHCM_PACKAGE_DB_CONTAINER,
            "sh",
            "-c",
            'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -At',
          ],
          { input: sql, encoding: "utf8" },
        );
        assert.equal(db.status, 0, db.stderr);
        assert.match(db.stdout, /DELETE 1\s+0\s*$/);
        receipt.projectionCleanup.push({ id, deletedCatalogProjection: true, nativeTombstoneRetained: true });
      }
      receipt.cleanup.objectsRemaining = (
        await ev(`return EncodeJson({count:ArrayCount(XQuery('for $c in cost_centers where $c/code = "${marker}" return $c'))});`)
      ).count;
    }
    assert.equal(receipt.cleanup.objectsRemaining, 0);
  } catch (error) {
    receipt.cleanupError = String(error);
    process.exitCode = 1;
  }
  receipt.closed = await e.close();
  await rm(local, { recursive: true, force: true });
  await writeFile(process.env.WSHCM_PACKAGE_RECEIPT ?? "/tmp/boristype-packages-acceptance.json", JSON.stringify(receipt, null, 2));
  console.log(JSON.stringify(receipt, null, 2));
}
