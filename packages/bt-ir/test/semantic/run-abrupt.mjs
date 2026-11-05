/** Strict Node/BS differential gate. Generated artifacts stay in ignored build/. */
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, relative } from "node:path";
import vm from "node:vm";
import ts from "typescript";
import { compile } from "../../build/index.js";
import { evalBorisScriptAsync } from "../../../botest/build/borisscript/runner.js";
import { abruptCases, caseSource } from "./abrupt-cases.mjs";
import { assertSafeForUpdates } from "./output-invariants.mjs";

const root = fileURLToPath(new URL("../../../../", import.meta.url));
process.chdir(root);
const artifacts = resolve(root, "packages/bt-ir/build/semantic");
mkdirSync(artifacts, { recursive: true });
await evalBorisScriptAsync(`
  RegisterCodeLibrary('x-local://packages/builtin-runtime/build/polyfill.js');
  RegisterCodeLibrary('x-local://packages/builtin-runtime/build/semantic.js');
  bt.init_polyfill();
`);
const cases = abruptCases();
const source = caseSource(cases);
const oracleJS = ts.transpileModule(source + "\nrunAll();", { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const expected = vm.runInNewContext(oracleJS, {}, { timeout: 10000 });
assert.equal(typeof expected, "string");
assert.equal(expected.trimEnd().split("\n").length, cases.length);
for (const mode of ["bare", "script", "module"]) {
  const modeSource = source + (mode === "module" ? "\nexport var result = runAll();" : "\nvar result = runAll(); result;");
  const start = performance.now();
  const compiled = compile(modeSource, { filename: "matrix.ts", mode });
  assert.equal(
    compiled.success,
    true,
    compiled.diagnostics.map((item) => ts.flattenDiagnosticMessageText(item.messageText, "\n")).join("\n"),
  );
  const output = compiled.outputs[0].code;
  assert.doesNotMatch(output, /\bfinally\b|\b(?:break|continue)\s+[A-Za-z_$]/);
  assertSafeForUpdates(output);
  const outputPath = resolve(artifacts, `matrix-${mode}.js`);
  writeFileSync(outputPath, output);
  const compileMs = performance.now() - start;
  const runStart = performance.now();
  let actual;
  if (mode === "module") {
    const url = "x-local://" + relative(root, outputPath).replaceAll("\\", "/");
    actual = await evalBorisScriptAsync(
      `
      RegisterCodeLibrary('${url}');
      var library = OpenCodeLibrary('${url}');
      var module = {exports: new SafeObject()};
      library.__init(library, module);
      return module.exports.result;
    `,
      outputPath,
      15000,
    );
  } else actual = await evalBorisScriptAsync(output + "\nreturn result;", outputPath, 15000);
  const actualLines = String(actual).trimEnd().split("\n");
  const expectedLines = expected.trimEnd().split("\n");
  const failed = cases.filter((_, index) => actualLines[index] !== expectedLines[index]);
  for (const item of failed.slice(0, 5)) {
    const index = cases.indexOf(item);
    const minimal = caseSource([item]);
    writeFileSync(resolve(artifacts, `failure-${mode}-${item.name}.ts`), minimal);
    writeFileSync(
      resolve(artifacts, `failure-${mode}-${item.name}.js`),
      compile(minimal, { filename: "failure.ts", mode }).outputs[0]?.code ?? "",
    );
    console.error(`${mode}/${item.name}: expected ${JSON.stringify(expectedLines[index])}, got ${JSON.stringify(actualLines[index])}`);
  }
  assert.equal(failed.length, 0, `${mode}: ${failed.length} differential failures; see ${artifacts}`);
  assert.equal(actual, expected, `${mode}: aggregate mismatch`);
  console.log(
    `${mode}: ${cases.length}/${cases.length}, ${Buffer.byteLength(output)} bytes, compile ${compileMs.toFixed(0)}ms, execute ${(performance.now() - runStart).toFixed(0)}ms`,
  );
}
const probeCases = cases.filter((item, index) => (index % 127 === 0 || index >= 1800) && item.cProbe !== false);
const probeSource = caseSource(probeCases);
const probeExpected = vm.runInNewContext(ts.transpileModule(probeSource + "\nrunAll();", {}).outputText, {}, { timeout: 1000 });
const probeLines = probeExpected.trimEnd().split("\n");
const probeCheck = `function BtAbruptProbe(): string {
  var failures = '';
  var actual = '';
  ${probeCases.map((item, index) => `actual = check${index}(); if (actual !== ${JSON.stringify(probeLines[index])}) { failures += ${JSON.stringify(item.name + "=")} + actual + ';'; }`).join("\n")}
  if (failures === '') return 'OK: ${probeCases.length}/${probeCases.length}';
  return failures;
}`;
const probe = compile(probeSource + "\n" + probeCheck, { filename: "BtAbruptProbe.ts", mode: "bare" });
assert.equal(probe.success, true);
assertSafeForUpdates(probe.outputs[0].code);
writeFileSync(resolve(artifacts, "BtAbruptProbe.js"), probe.outputs[0].code + "\nMESSAGE = BtAbruptProbe();\n");
assert.equal(
  await evalBorisScriptAsync(probe.outputs[0].code + "\nreturn BtAbruptProbe();", undefined, 5000),
  `OK: ${probeCases.length}/${probeCases.length}`,
);
writeFileSync(resolve(artifacts, "BtAbruptProbe.expected.txt"), probeExpected);
writeFileSync(resolve(artifacts, "BtAbruptProbe.cases.txt"), probeCases.map((item) => item.name).join("\n") + "\n");
console.log(`C probe: ${probeCases.length} cases in ${relative(root, artifacts)}/BtAbruptProbe.js`);
