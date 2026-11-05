import assert from "node:assert/strict";
import test from "node:test";
import ts from "typescript";
import vm from "node:vm";
import { expressionCases, expressionSource } from "./semantic/expression-cases.mjs";
import { expressionBaseline } from "./semantic/expression-baseline.mjs";
import { classifyExpressionResult, runIsolatedTarget, selectExpressionCases } from "./semantic/expression-support.mjs";
import { buildExpressionPrototype, prototypeCases } from "./semantic/expression-prototypes.mjs";
import { IR } from "../build/ir/index.js";
import { emit } from "../build/index.js";
import { parenthesizePass } from "../build/passes/parenthesize.js";

test("expression catalog is nonempty, unique and agrees with the JS oracle", () => {
  const { selected } = selectExpressionCases(expressionCases, []);
  assert.equal(selected.length, 48);
  for (const item of expressionCases) {
    const source = expressionSource(item, "script") + "\nresult;";
    const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
    assert.equal(vm.runInNewContext(js, {}, { timeout: 1000 }), item.expected, item.id);
  }
});

test("research runner rejects unknown, incomplete and zero selections", () => {
  for (const args of [
    ["no-match"],
    ["--case", "unknown"],
    ["--mode", "unknown"],
    ["--case"],
    ["--mode", "--baseline"],
    ["--case", "r01-and-skip", "--mode", "bare"],
    ["--case", "r01-and-skip", "--case", "control-plain-order", "--mode", "bare"],
  ]) {
    assert.throws(() => selectExpressionCases(expressionCases, args), undefined, args.join(" "));
  }
  assert.equal(selectExpressionCases(expressionCases, ["--case", "r01-and-skip", "--mode", "script"]).selected.length, 1);
  assert.throws(() => selectExpressionCases([], []), /Empty selection/);
});

test("known failures are exact, scoped and not green in strict mode", () => {
  const known = expressionBaseline["r01-and-skip/script"];
  assert.equal(classifyExpressionResult(known.expected, known.actual, known, true), "XFAIL");
  assert.equal(classifyExpressionResult(known.expected, known.actual, known, false), "FAIL");
  assert.equal(classifyExpressionResult(known.expected, "other bug", known, true), "FAIL");
  assert.equal(classifyExpressionResult(known.expected, known.expected, known, true), "XPASS");
  assert.equal(classifyExpressionResult(known.expected, known.actual, undefined, true), "FAIL");
  const selection = selectExpressionCases(expressionCases, []).selected;
  for (const [key, entry] of Object.entries(expressionBaseline)) {
    const row = selection.find(({ item, mode }) => `${item.id}/${mode}` === key);
    assert.ok(row, `Orphan baseline: ${key}`);
    assert.equal(row.item.expected, entry.expected, key);
    assert.notEqual(entry.expected, entry.actual, key);
    assert.ok(entry.reason && entry.finding, key);
  }
});

test("watchdog kills a synchronous hang outside the parent's event loop", { timeout: 5000 }, async () => {
  await assert.rejects(
    runIsolatedTarget(
      { root: process.cwd() },
      {
        timeoutMs: 300,
        worker: new URL("./semantic/hanging-worker.mjs", import.meta.url),
      },
    ),
    /Target process timeout/,
  );
});

test("research workers fail closed on load failure instead of returning a successful comparison", { timeout: 5000 }, async () => {
  await assert.rejects(
    runIsolatedTarget(
      { root: process.cwd() },
      {
        timeoutMs: 2000,
        worker: new URL("./semantic/worker-that-does-not-exist.mjs", import.meta.url),
      },
    ),
    /without a valid result/,
  );
});

test("prototype B/C preserve their semantic inputs and have identical target shapes", () => {
  const before = JSON.stringify(prototypeCases);
  for (const item of prototypeCases) {
    const shape = (variant) => emit(parenthesizePass.run(IR.program([buildExpressionPrototype(item, variant)], undefined, true), {})).code;
    assert.equal(shape("B"), shape("C"), item.id);
    assert.doesNotMatch(shape("B"), /\bbt\.|@descriptor|__env|\bfinally\b/);
  }
  assert.equal(JSON.stringify(prototypeCases), before);
});
