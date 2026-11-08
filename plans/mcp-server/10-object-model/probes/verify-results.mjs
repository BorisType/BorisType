import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const directory = process.argv[2];
if (!directory) throw new Error("Usage: node verify-results.mjs <native-results-directory>");
let checks = 0;

/** Check an observed runtime behavior; this is evidence, not a product guarantee. */
function check(condition, message) {
  assert.ok(condition, message);
  checks++;
}

/** Load a runner transcript and ensure it belongs to the current probe bytes. */
async function load(name) {
  const lines = (await readFile(join(directory, `${name}.result.jsonl`), "utf8"))
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  const run = lines.find((line) => Object.hasOwn(line, "actual"));
  check(run?.carrier === "C-runtime/eval/temporary-library", `${name}: native carrier`);
  check(
    lines.some((line) => line.cleanup === "confirmed"),
    `${name}: evaluator cleanup`,
  );
  const bytes = await readFile(new URL(`${name}.bs`, import.meta.url));
  const hash = createHash("sha256").update(bytes).digest("hex");
  check(run.sha256 === hash && run.evaluatedSha256 === hash, `${name}: probe hashes`);
  check(run.adaptation === "none", `${name}: unchanged BS source`);
  const result = JSON.parse(run.actual);
  check(!result.fatal, `${name}: ${result.fatal}`);
  return result;
}

/** Verify the committed snapshot inventory and independent cleanup receipt. */
async function verifyRecordedEvidence() {
  const manifest = JSON.parse(await readFile(new URL("../evidence-manifest.json", import.meta.url), "utf8"));
  for (const run of manifest.runs) {
    const transcript = await readFile(new URL(`../${run.observedTranscript}`, import.meta.url));
    assert.equal(createHash("sha256").update(transcript).digest("hex"), run.observedTranscriptSha256, "recorded transcript hash");
  }
  const receipt = manifest.cleanupEvidence;
  const source = await readFile(new URL(`../${receipt.source}`, import.meta.url));
  assert.equal(createHash("sha256").update(source).digest("hex"), receipt.sourceSha256, "cleanup source hash");
  const transcript = await readFile(new URL(`../${receipt.observedTranscript}`, import.meta.url));
  assert.equal(createHash("sha256").update(transcript).digest("hex"), receipt.observedTranscriptSha256, "cleanup transcript hash");
  const lines = transcript
    .toString("utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  const run = lines.find((line) => Object.hasOwn(line, "actual"));
  assert.equal(run.carrier, "C-runtime/eval/temporary-library");
  assert.equal(run.sha256, receipt.sourceSha256);
  assert.equal(run.evaluatedSha256, receipt.sourceSha256);
  assert.equal(run.adaptation, "none");
  assert.ok(lines.some((line) => line.cleanup === "confirmed"));
  const actual = JSON.parse(run.actual);
  assert.equal(actual.fileAbsent, true);
  assert.deepEqual(
    actual.objects.map((object) => object.id),
    receipt.ownedObjectIds,
  );
  for (const object of actual.objects) {
    assert.equal(object.rows, 0);
    assert.equal(object.trash, 0);
    assert.equal(object.opened, false);
  }
}

const reflection = await load("01-reflection");
check(reflection.root === "cost_center", "object root");
check(reflection.catalogRoot === "cost_centers", "catalog root");
check(reflection.catalogHierarchical === true, "hierarchical catalog");
check(reflection.neverSaved && reflection.docUrl === "", "unbound new document");
check(reflection.fields.find((f) => f.name === "id").hasValue === false, "empty ID");
check(reflection.fields.find((f) => f.name === "is_active").value === true, "bool default");
check(reflection.meta.find((f) => f.name === "parent_id").foreign === "cost_centers", "foreign metadata");
check(!reflection.registry.useObjectTypes && reflection.registry.objectFormCount === 0, "legacy model");
check(
  reflection.registry.formUrl.error && reflection.registry.unknownForm.error.startsWith("Unknown method: GetOptObjectForm()"),
  "new model APIs unavailable",
);
check(reflection.registry.catalogForm === "x-local://wtv/wtv_cost_centers.xmd", "legacy catalog reflection");
check(reflection.registry.exchangeTypes === 414, "this distribution's application type list");

const values = await load("02-values-and-hooks");
check(values.initial.xml.includes("<trace>C</trace>"), "OnCreate");
check(!values.initial.requiredHasValue && values.save === "saved", "NOT-NULL is not business required validation");
check(values.initial.flagValue === false && !values.initial.flagHasValue, "NULL-FALSE absent false");
check(values.converted.value === 42 && values.converted.derived === 43, "typed conversion and computed property");
check(values.invalidInteger.error.startsWith("Invalid format"), "invalid integer rejected");
check(values.duplicates.count === 2, "duplicate array primary keys accepted");
check(values.flags.before && values.flags.after && values.flags.writeDocInfo, "default lifecycle flags");
check(
  values.flags.writeFt.error.startsWith("Unknown object property: WriteFt") &&
    values.flags.separated.error.startsWith("Unknown object property: IsSeparated"),
  "unsupported document properties",
);
check(values.afterSave.memoryTrace === "CBS" && values.reopened.trace === "CB", "OnSave after persistence");
check(values.reopened.scratch === "" && !values.afterSave.fileXml.includes("not-persistent"), "TEMP omitted");
check(
  values.reject.error.startsWith("owned-before-save-rejection") && values.afterReject === values.afterSave.fileXml,
  "before-save rejection preserves file",
);
check(
  values.afterSaveError.error.startsWith("owned-after-save-error") && values.diskAfterSaveError.includes("<trace>CBSB</trace>"),
  "after-save failure has persisted bytes",
);
check(
  values.diskAfterSaveError.includes("18446744073709551538") && values.reopenAfterSaveError === -78,
  "unsigned XML output and signed reload",
);
check(values.disabled.trace === "CBSBS", "callbacks can be disabled");
check(!values.cleared.defaultHasValue && values.cleared.defaultValue === null, "Clear removes default in memory");
check(values.reloadedDefault.hasValue && values.reloadedDefault.value === 7, "default returns on reload");
check(!values.unknownXml.includes("unknown"), "unknown XML omitted by schema");
check(values.loadMerge.includes("<required>keep</required>") && values.loadMerge.includes("<value>20</value>"), "LoadData merges");
check(values.setReplace.error.startsWith("Unknown method: SetXml()"), "SetXml unavailable");
check(
  !values.abbreviatedBefore.hasRows && values.abbreviatedAfterSave.fullRows === 0 && values.abbreviatedAfterSave.fullTrace === "",
  "abbreviated save loses hidden data",
);
check(values.cleanup.fileAbsent, "physical file cleanup");

const crud = await load("03-owned-crud");
check(crud.beforeBind.url === "" && !crud.beforeBind.idHasValue, "new object before bind");
check(crud.bound.id === crud.bound.elemId && crud.bound.neverSaved && crud.bound.rows === 0, "bind allocates identity without saving");
check(crud.saveInvalidForeign === "saved" && crud.rowsAfterSave === 1 && crud.saved.foreign === true, "dangling foreign accepted");
check(crud.saved.parent === "9007199254740993", "lossless integer reference");
check(!crud.saved.catalogHasComment && crud.saved.comment === "document-only-sentinel", "catalog is a projection");
check(crud.saved.userLogin === "user1" && crud.saved.created !== "" && crud.saved.modified !== "", "doc_info populated");
check(
  crud.staleSave === "saved" && crud.afterStaleSave.name === "BorisType owned object probe" && crud.afterStaleSave.comment === "writer-B",
  "stale copy overwrites writer A",
);
check(
  crud.trashed.rows === 0 && crud.trashed.trashRows === 1 && crud.trashed.openOriginal.error.includes("Object not found"),
  "soft delete",
);
check(crud.trashed.trashName === crud.marker, "owned object retained in trash");
check(crud.restored.rows === 1 && crud.restored.trashRows === 0 && crud.restored.id === crud.bound.id, "restore preserves identity");
check(crud.deleted.rows === 0 && crud.deleted.open.error.includes("Object not found"), "hard delete");
check(crud.remainingRows === 0 && crud.remainingTrashRows === 0, "no residual catalog/trash rows");

console.log(`OK: ${checks}/${checks} native observations`);
if (resolve(directory) === resolve(fileURLToPath(new URL("../observed/", import.meta.url)))) {
  await verifyRecordedEvidence();
  console.log("OK: recorded transcript hashes and independent cleanup receipt");
}
