/** Compare limited designs, emit C pack and record structural cost; never changes production lowering. */
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { emit } from "../../build/index.js";
import { IR } from "../../build/ir/index.js";
import { parenthesizePass } from "../../build/passes/parenthesize.js";
import { prototypeCases, buildExpressionPrototype, prototypeHelpers } from "./expression-prototypes.mjs";
import { expressionOutputMetrics, runIsolatedTarget, sha256 } from "./expression-support.mjs";
import { execFileSync } from "node:child_process";

const root = fileURLToPath(new URL("../../../../", import.meta.url));
const artifacts = resolve(root, "packages/bt-ir/build/semantic/expressions/prototypes");
mkdirSync(artifacts, { recursive: true });
function output(body) {
  const program = IR.program(body, undefined, true);
  const normalized = parenthesizePass.run(program, {});
  return { code: emit(normalized).code, ir: normalized };
}
const results = [];
for (const item of prototypeCases) {
  let bCode;
  for (const variant of ["A", "B", "C", "I"]) {
    const fn = buildExpressionPrototype(item, variant);
    const compiled = output([...prototypeHelpers(), fn, IR.varDecl("result", IR.call(IR.id(fn.name), []))]);
    if (variant === "B") bCode = compiled.code;
    if (variant === "C") assert.equal(compiled.code, bCode, "B/C must have identical target shapes in this sketch");
    const outputPath = resolve(artifacts, `${item.id}-${variant}.js`);
    writeFileSync(outputPath, compiled.code);
    const actual = await runIsolatedTarget({ root, code: compiled.code, outputPath, mode: "bare" });
    const expected =
      variant === "A" && item.id === "args"
        ? "BA|3"
        : variant === "A" && item.id === "early-read"
          ? "|11"
          : variant === "A" && item.loop
            ? "1|5"
            : item.expected;
    assert.equal(actual, expected, `${item.id}/${variant}: prototype changed`);
    const functionOutput = output([fn]);
    const row = {
      id: item.id,
      variant,
      expected: item.expected,
      actual,
      correct: actual === item.expected,
      outputSha256: sha256(compiled.code),
      metrics: expressionOutputMetrics(functionOutput.code, functionOutput.ir),
    };
    results.push(row);
    console.log(`${row.correct ? "PASS" : "COUNTEREXAMPLE"} ${item.id}/${variant}: ${actual}`);
  }
}
function buildPack(variant, name) {
  const functions = prototypeCases.map((item) => buildExpressionPrototype(item, variant));
  const checks = prototypeCases.flatMap((item, index) => [
    IR.exprStmt(IR.assign("=", IR.id("actual"), IR.call(IR.id(functions[index].name), []))),
    IR.if(
      IR.binary("!==", IR.id("actual"), IR.string(item.expected)),
      IR.block([
        IR.exprStmt(
          IR.assign("+=", IR.id("failures"), IR.binary("+", IR.string(item.id + "="), IR.binary("+", IR.id("actual"), IR.string(";")))),
        ),
      ]),
    ),
  ]);
  const pack = output([
    ...prototypeHelpers(),
    ...functions,
    IR.functionDecl(
      name,
      [],
      [
        IR.varDecl("actual", IR.string("")),
        IR.varDecl("failures", IR.string("")),
        ...checks,
        IR.if(IR.binary("===", IR.id("failures"), IR.string("")), IR.block([IR.return(IR.string("OK: 6/6"))])),
        IR.return(IR.id("failures")),
      ],
      undefined,
      true,
    ),
    IR.varDecl("result", IR.call(IR.id(name), [])),
  ]);
  return pack;
}
const cPacks = {};
for (const [variant, name] of [
  ["B", "BtExpressionShapeProbe"],
  ["I", "BtExpressionInlineProbe"],
]) {
  const pack = buildPack(variant, name);
  const packPath = resolve(artifacts, name + ".js");
  // Instrumented research pack is bounded by five body entries. No claim about production compiler output.
  const cCode = pack.code + "\nMESSAGE = result;\n";
  writeFileSync(packPath, cCode);
  assert.equal(await runIsolatedTarget({ root, code: pack.code, outputPath: packPath, mode: "bare" }), "OK: 6/6");
  cPacks[name] = { variant, expected: "OK: 6/6", sha256: sha256(cCode) };
  console.log(`C pack: ${packPath}; MESSAGE = OK: 6/6; sha256 = ${sha256(cCode)}`);
}
writeFileSync(
  resolve(artifacts, "manifest.json"),
  JSON.stringify(
    {
      status: "research sketches, JS verified, C pending",
      expectedMessage: "OK: 6/6",
      cPacks,
      compilerCommit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
      runtimeSha256: sha256(readFileSync(resolve(root, "packages/botest/build/borisscript/main.js"))),
      prototypeSha256: sha256(readFileSync(new URL("./expression-prototypes.mjs", import.meta.url))),
      requiredHelpers: [],
      results,
      limitations:
        "Boolean predicates, native property reads, no Reference/call receiver ABI, no default parameters or do/for/finalizer migration",
    },
    null,
    2,
  ) + "\n",
);
