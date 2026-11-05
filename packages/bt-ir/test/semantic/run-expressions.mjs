/** Research gate: strict by default; --baseline verifies explicitly recorded mismatches. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import vm from "node:vm";
import ts from "typescript";
import { compile } from "../../build/index.js";
import { expressionCases, expressionSource } from "./expression-cases.mjs";
import { expressionBaseline } from "./expression-baseline.mjs";
import {
  classifyExpressionResult,
  expressionOutputMetrics,
  runIsolatedTarget,
  selectExpressionCases,
  sha256,
} from "./expression-support.mjs";
import { assertSafeForUpdates } from "./output-invariants.mjs";

const root = fileURLToPath(new URL("../../../../", import.meta.url));
process.chdir(root);
const { selected, baseline } = selectExpressionCases(expressionCases, process.argv.slice(2));
const artifacts = resolve(root, "packages/bt-ir/build/semantic/expressions");
mkdirSync(artifacts, { recursive: true });
const manifest = {
  date: new Date().toISOString(),
  compilerCommit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  trackedDiffSha256: sha256(execFileSync("git", ["diff", "HEAD", "--", "packages/bt-ir/src", "packages/builtin-runtime/src"])),
  node: process.version,
  typescript: ts.version,
  entrypoint: "compile",
  strict: true,
  target: { implementation: "supplied JS + botest adapter", version: "unknown", c: "not run" },
  catalogSha256: sha256(readFileSync(new URL("./expression-cases.mjs", import.meta.url))),
  baselineSha256: sha256(readFileSync(new URL("./expression-baseline.mjs", import.meta.url))),
  harnessSha256: Object.fromEntries(
    ["run-expressions.mjs", "expression-support.mjs", "expression-worker.mjs"].map((name) => [
      name,
      sha256(readFileSync(new URL(name, import.meta.url))),
    ]),
  ),
  policy: baseline ? "baseline-exact-xfail" : "strict-differential",
  selected: selected.length,
  results: [],
};
// Fail before running any comparisons when provisioning is incomplete. Hash, never copy, private source.
for (const path of [
  "packages/botest/build/borisscript/main.js",
  "packages/builtin-runtime/build/polyfill.js",
  "packages/builtin-runtime/build/semantic.js",
  "packages/builtin-runtime/build/destructuring.js",
]) {
  manifest.target[path.split("/").at(-1)] = sha256(readFileSync(resolve(root, path)));
}
const manifestPath = resolve(artifacts, "manifest.json");
const saveManifest = () => writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
saveManifest();
for (const { item, mode } of selected) {
  const key = `${item.id}/${mode}`;
  const prefix = resolve(artifacts, `${item.id}-${mode}`);
  const source = expressionSource(item, mode);
  const row = { key, finding: item.finding, expected: item.expected, sourceSha256: sha256(source) };
  writeFileSync(prefix + ".ts", source);
  try {
    const oracle = ts
      .transpileModule(source + "\nresult;", { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } })
      .outputText.replace(/^export /gm, "");
    writeFileSync(prefix + ".oracle.js", oracle);
    row.oracleSha256 = sha256(oracle);
    assert.equal(vm.runInNewContext(oracle, {}, { timeout: 1000 }), item.expected, `${key}: catalog/oracle mismatch`);
    // debugIR exposes raw IR through logs and normalized IR through result.ir. Capture only compiler-owned data.
    const messages = [];
    const savedLog = console.log;
    let compiled;
    try {
      console.log = (...args) => messages.push(args.join(" "));
      compiled = compile(source, { filename: `${item.id}.ts`, mode, debugIR: true });
    } finally {
      console.log = savedLog;
    }
    row.diagnostics = compiled.diagnostics.map((diag) => ({
      code: diag.code,
      category: diag.category,
      message: ts.flattenDiagnosticMessageText(diag.messageText, "\n"),
    }));
    assert.equal(compiled.success, true, `${key}: ${JSON.stringify(row.diagnostics)}`);
    const rawIR = messages.find((message) => message.startsWith("{\n"));
    assert.ok(rawIR, "Missing raw IR artifact");
    writeFileSync(prefix + ".raw-ir.json", rawIR + "\n");
    writeFileSync(prefix + ".ir.json", JSON.stringify(compiled.ir, null, 2) + "\n");
    const code = compiled.outputs[0].code;
    row.outputSha256 = sha256(code);
    row.metrics = expressionOutputMetrics(code, compiled.ir);
    assertSafeForUpdates(code);
    writeFileSync(prefix + ".js", code);
    row.actual = await runIsolatedTarget({ root, code, outputPath: prefix + ".js", mode });
    row.status = classifyExpressionResult(item.expected, row.actual, expressionBaseline[key], baseline);
  } catch (error) {
    row.status = "ERROR";
    row.error = String(error?.message ?? error);
  }
  manifest.results.push(row);
  saveManifest();
  console.log(
    `${row.status} ${key}: expected ${JSON.stringify(row.expected)}, actual ${JSON.stringify(row.actual)}${row.error ? `; ${row.error}` : ""}`,
  );
}
const counts = {};
for (const row of manifest.results) counts[row.status] = (counts[row.status] ?? 0) + 1;
assert.equal(manifest.results.length, selected.length);
manifest.counts = counts;
saveManifest();
console.log(`${selected.length} comparisons: ${JSON.stringify(counts)}; artifacts: packages/bt-ir/build/semantic/expressions`);
if (counts.FAIL || counts.ERROR || counts.XPASS) process.exitCode = 1;
