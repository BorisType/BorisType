// Bounded receipt-loss checks on an already proven owned schema mutation.
import assert from "node:assert/strict";

export async function verifyPackageReceiptRecovery(e, { operationId, schemaId, marker, lookup }) {
  const root = `x-local://trash/boristype_packages/${operationId}/receipt.json`;
  const path = `UrlToFilePath('${root}')`;
  const original = await e.eval(`return LoadFileData(${path});`);
  assert.equal(JSON.parse(original).status, "completed");
  assert.equal(JSON.parse(original).operationId, operationId);
  const effect = JSON.parse(
    await e.eval(
      `var d=OpenDoc('x-local://'+DefaultDb+'/lists/wtv_package_objects.xml');var p=d.TopElem.GetChildByKey('${schemaId}');return EncodeJson({name:String(p.name)});`,
    ),
  );
  assert.equal(effect.name, marker);
  const baseline = await e.eval("return OpenDoc('x-local://'+DefaultDb+'/lists/wtv_package_objects.xml').TopElem.GetXml();");
  const evidence = [];
  try {
    for (const storage of ["missing", "corrupt"]) {
      if (storage === "missing") await e.eval(`DeleteFile(${path});return;`);
      else await e.eval(`PutFileData(${path},'{not JSON');return;`);
      const details = await lookup(operationId.toUpperCase());
      assert.equal(details.operationId, operationId);
      assert.equal(details.status, "unknown");
      assert.equal(details.code, "ReceiptUnavailable");
      assert.equal(details.phase, "receipt");
      assert.ok(details.message);
      const preserved = JSON.parse(
        await e.eval(
          `return EncodeJson({exists:FilePathExists(${path}),data:${storage === "missing" ? "''" : `String(LoadFileData(${path}))`}});`,
        ),
      );
      assert.equal(preserved.exists, storage !== "missing");
      if (storage === "corrupt") assert.equal(preserved.data, "{not JSON");
      assert.equal(await e.eval("return OpenDoc('x-local://'+DefaultDb+'/lists/wtv_package_objects.xml').TopElem.GetXml();"), baseline);
      evidence.push({ storage, details, receiptUnchanged: true, schemaEffectUnchanged: true });
    }
  } finally {
    // Explicit test teardown only; status lookup itself must never repair evidence.
    await e.eval(`PutFileData(${path},${JSON.stringify(original)});return;`);
  }
  return evidence;
}
