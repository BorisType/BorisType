import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const manifest = JSON.parse(await readFile(new URL("xml-evidence-manifest.json", root), "utf8"));
let checks = 0;

/** Assert a recorded observation, not a guarantee of a future MCP tool. */
function check(condition, description) {
  assert.ok(condition, description);
  checks++;
}

/** Compute the digest of the exact recorded bytes. */
function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

/** Read a native transcript only after verifying source, carrier and cleanup. */
async function load(receipt) {
  const source = await readFile(new URL(receipt.source, root));
  const transcript = await readFile(new URL(receipt.observedTranscript, root));
  check(sha256(source) === receipt.sourceSha256, `${receipt.source}: source hash`);
  check(sha256(transcript) === receipt.observedTranscriptSha256, `${receipt.source}: transcript hash`);
  const lines = transcript.toString("utf8").trim().split("\n").map(JSON.parse);
  const runs = lines.filter((line) => Object.hasOwn(line, "actual"));
  check(runs.length === 1, `${receipt.source}: one result`);
  const run = runs[0];
  check(run.carrier === "C-runtime/eval/temporary-library", `${receipt.source}: native carrier`);
  check(
    run.sha256 === receipt.sourceSha256 && run.evaluatedSha256 === receipt.sourceSha256 && run.adaptation === "none",
    `${receipt.source}: unmodified native source`,
  );
  check(
    lines.some((line) => line.cleanup === "confirmed"),
    `${receipt.source}: evaluator cleanup`,
  );
  const actual = JSON.parse(run.actual);
  check(!actual.fatal && !actual.cleanupError, `${receipt.source}: no fatal/cleanup failure`);
  return actual;
}

const core = await load(manifest.runs.find((run) => run.source === "probes/xml-core.bs"));
check(core.root === "probe", "native root");
check(core.formXml.includes('<base SAMPLE="1">') && core.formXml.includes("<SPXML-FORM>"), "full form contains sample and wrapper");
check(!core.topXml.includes("SAMPLE=") && !core.topXml.includes("INHERIT") && !core.topXml.includes('TYPE="base"'), "root schema expanded");
check((core.topXml.match(/<base_value TYPE="string"\/>/g) ?? []).length === 3, "root, composite and repeated-item inheritance expanded");
check(
  core.topXml.includes('<required TYPE="integer" NOT-NULL="1" DEFAULT="7"/>') &&
    core.topXml.includes('<item MULTIPLE="1" PRIMARY-KEY="key">'),
  "defaults and cardinality retained",
);
const cases = new Map(core.cases.map((item) => [item.name, item]));
check(cases.size === 12 && core.cases.length === 12, "twelve distinct XML inputs");
check(
  cases.get("valid").accepted && cases.get("valid").value === "ok" && cases.get("valid").xml.includes("<base_value>nested</base_value>"),
  "valid XML retains nested data",
);
check(cases.get("empty-root").accepted && !cases.get("empty-root").hasValue, "empty root accepted");
for (const name of ["empty-input", "plain-text", "unclosed-root", "mismatched"]) {
  check(!cases.get(name).accepted && !!cases.get(name).error, `${name}: native syntax rejection`);
}
for (const name of ["wrong-root", "unknown-field"]) {
  const item = cases.get(name);
  check(
    item.accepted && item.root === "probe" && !item.hasValue && !item.xml.includes("lost"),
    `${name}: accepted with input data discarded`,
  );
}
check(cases.get("multiple-roots").accepted && cases.get("multiple-roots").value === "first", "second root ignored");
check(cases.get("duplicate-scalar").accepted && cases.get("duplicate-scalar").value === "second", "duplicate scalar last wins");
check(cases.get("invalid-integer").accepted && !cases.get("invalid-integer").xml.includes("NaN"), "invalid integer silently discarded");
check(
  core.cases.filter((item) => item.accepted).every((item) => item.defaulted === 7),
  "default survives all accepted inputs",
);
check(
  cases.get("invalid-entity").accepted &&
    cases.get("invalid-entity").value === "&does_not_exist;" &&
    cases.get("invalid-entity").xml.includes("&amp;does_not_exist;"),
  "unknown entity becomes literal text",
);

const crud = await load(manifest.runs.find((run) => run.source === "probes/xml-crud.bs"));
check(
  crud.parsedNew.formUrl === "x-local://wtv/wtv_cost_center.xmd" && crud.parsedNew.neverSaved === false && crud.bound.neverSaved === false,
  "XML import is not proven equivalent to OpenNewDoc lifecycle",
);
check(
  typeof crud.bound.id === "string" && /^\d{19}$/.test(crud.bound.id) && crud.bound.id === crud.bound.elemId,
  "lossless bound identity",
);
check(
  crud.created.id === crud.bound.id &&
    crud.created.code === crud.marker &&
    crud.created.name === "xml-created" &&
    crud.created.active === true,
  "created object and default",
);
check(crud.created.creationDate !== "" && crud.created.creationLogin === "user1", "creation metadata populated");
check(
  crud.replaceBound.id === crud.bound.id && crud.replaceBound.elemId === crud.bound.id && crud.replaceBound.url !== "",
  "replacement bound to same identity",
);
check(
  crud.replaced.id === crud.bound.id && crud.replaced.name === "xml-replaced" && crud.replaced.comment === "",
  "whole replace removes omitted comment",
);
check(
  crud.badParsed.root === "cost_center" &&
    crud.badParsed.xml.includes("<is_active>1</is_active>") &&
    !crud.badParsed.xml.includes("silently-lost"),
  "bad root becomes default-only candidate",
);
check(
  crud.badSaved.id === crud.bound.id && crud.badSaved.code === "" && crud.badSaved.name === "" && crud.badSaved.active === true,
  "bad-root candidate overwrites and clears existing object",
);
check(crud.restored.name === "xml-replaced", "good XML restored before cleanup");
check(crud.deleted && crud.remaining === 0 && crud.trashRemaining === 0, "owned fixture cleanup");

const postcheck = await load(manifest.cleanupEvidence);
assert.deepEqual(
  postcheck.objects.map((item) => item.id),
  manifest.cleanupEvidence.ownedObjectIds,
);
check(manifest.cleanupEvidence.ownedObjectIds.includes(crud.bound.id), "independent receipt includes final fixture");
for (const item of postcheck.objects) {
  check(item.rows === 0 && item.trash === 0 && item.opened === false, `${item.id}: independently absent`);
}
console.log(`OK: ${checks}/${checks} recorded XML native observations and evidence checks`);

const local = JSON.parse(await readFile(new URL("observed/xml-local-validator.json", root), "utf8"));
assert.equal(local.kind, "local-node-xml-validator");
assert.equal(local.package, "fast-xml-parser");
assert.equal(local.version, "5.11.2");
assert.deepEqual(
  local.cases.map((item) => item.name),
  core.cases.map((item) => item.name),
);
const rejected = ["empty-input", "plain-text", "unclosed-root", "mismatched", "multiple-roots"];
for (const item of local.cases) {
  assert.equal(item.result === true, !rejected.includes(item.name), `${item.name}: local validator observation`);
}
console.log("OK: separate recorded local XMLValidator comparison (not native acceptance)");
