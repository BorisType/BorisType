// Test-only cleanup. Native records/paths must belong to this exact allocated run.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

export async function cleanupPackageFixtures(
  e,
  { marker, ids, packageIds, operations },
  dbContainer = process.env.WSHCM_PACKAGE_DB_CONTAINER,
) {
  assert.match(marker, /^bt-packages-[a-f0-9-]+$/);
  assert.ok(ids.every((id) => /^[1-9][0-9]{0,19}$/.test(id)));
  assert.ok(operations.every((id) => /^[a-f0-9-]{36}$/.test(id)));
  const ev = async (code) => JSON.parse(await e.eval(code));
  const receipt = { operations };
  receipt.cleanup =
    await ev(`var ids=ParseJson('${JSON.stringify(ids)}');var ops=ParseJson('${JSON.stringify(receipt.operations)}');var packages=ParseJson('${JSON.stringify(packageIds)}');var i;var j;var d;var rows;var r;var owned;var root;var paths;var url;var urls=[];var reports=[];var downloads=[];var seen;var cleanupErrors=[];var extracted=[];var remainingOps=[];var remainingExtracted=[];var remainingReports=[];var remainingDownloads=[];
   for(i=0;i<ArrayCount(ids);i++){try{seen=ArrayOptFirstElem(XQuery('for $c in cost_centers where $c/id = '+ids[i]+' and $c/code = "${marker}" return $c'));if(seen==undefined)continue;d=OpenNewDoc('x-local://wtv/wtv_cost_center.xmd');d.TopElem.code='${marker}';d.TopElem.name='cleanup';d.BindToDb(DefaultDb,Int(ids[i]));d.Save();DeleteDoc(UrlFromDocID(d.DocID),true);}catch(err){cleanupErrors.push(String(err));}}
   for(i=0;i<ArrayCount(packages);i++){rows=ArraySelectAll(XQuery('for $d in download_packages where $d/package_id = '+CodeLiteral(packages[i])+' return $d'));for(j=0;j<ArrayCount(rows);j++){d=OpenDoc(UrlFromDocID(rows[j].id));urls.push(String(d.TopElem.local_file_url));downloads.push(StrSignedInt(rows[j].id));DeleteDoc(d.Url,true);}}
   for(i=0;i<ArrayCount(ops);i++){root='x-local://trash/boristype_packages/'+ops[i];urls.push(root+'/archive.zip');try{owned=ParseJson(LoadFileData(UrlToFilePath(root+'/source.json')));if(ArrayOptFind(ops,'This=='+CodeLiteral(owned.sourceId))==undefined)ops.push(owned.sourceId);}catch(err){}try{paths=ParseJson(LoadFileData(UrlToFilePath(root+'/owned-paths.json')));for(j=0;j<ArrayCount(paths);j++){try{if(paths[j]!=''){extracted.push(paths[j]);DeleteDirectory(paths[j]);}}catch(err){}}}catch(err){}}
   for(i=0;i<ArrayCount(urls);i++){rows=ArraySelectAll(XQuery('for $r in action_reports where $r/data_file_url = '+CodeLiteral(urls[i])+' return $r'));for(j=0;j<ArrayCount(rows);j++){reports.push(StrSignedInt(rows[j].id));DeleteDoc(UrlFromDocID(rows[j].id),true);}try{DeleteUrl(urls[i]);}catch(err){}try{DeleteFile(UrlToFilePath(urls[i]));}catch(err){}}
   for(i=0;i<ArrayCount(ops);i++){try{DeleteDirectory('x-local://trash/boristype_packages/'+ops[i]);}catch(err){}}
   for(i=0;i<ArrayCount(ops);i++){if(IsDirectory('x-local://trash/boristype_packages/'+ops[i]))remainingOps.push(ops[i]);}
   for(i=0;i<ArrayCount(extracted);i++){if(IsDirectory(extracted[i]))remainingExtracted.push(extracted[i]);}
   for(i=0;i<ArrayCount(reports);i++){if(ArrayCount(XQuery('for $r in action_reports where $r/id = '+reports[i]+' return $r'))>0)remainingReports.push(reports[i]);}
   for(i=0;i<ArrayCount(downloads);i++){if(ArrayCount(XQuery('for $d in download_packages where $d/id = '+downloads[i]+' return $d'))>0)remainingDownloads.push(downloads[i]);}
   return EncodeJson({operationDirectoriesRemaining:remainingOps,extractionDirectoriesRemaining:remainingExtracted,reportRecordsRemaining:remainingReports,downloadRecordsRemaining:remainingDownloads,objectsRemaining:ArrayCount(XQuery('for $c in cost_centers where $c/code = "${marker}" return $c')),reportsDeleted:reports,downloadsDeleted:downloads,operationsDeleted:ops,errors:cleanupErrors});`);
  assert.deepEqual(receipt.cleanup.errors, []);
  for (const field of [
    "operationDirectoriesRemaining",
    "extractionDirectoriesRemaining",
    "reportRecordsRemaining",
    "downloadRecordsRemaining",
  ])
    assert.deepEqual(receipt.cleanup[field], []);
  if (receipt.cleanup.objectsRemaining && dbContainer) {
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
        ["exec", "-i", dbContainer, "sh", "-c", 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -At'],
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
  return { cleanup: receipt.cleanup, ...(receipt.projectionCleanup ? { projectionCleanup: receipt.projectionCleanup } : {}) };
}
