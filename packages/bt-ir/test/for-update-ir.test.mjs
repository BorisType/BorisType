import assert from "node:assert/strict";
import test from "node:test";
import { IR } from "../build/ir/index.js";
import { emit } from "../build/emitter/index.js";
import { BindingManager } from "../build/lowering/binding.js";
import { forUpdateDesugarPass, containsCommaOperator } from "../build/passes/for-update-desugar.js";
import { resolveControlTargets } from "../build/passes/control-target-resolver.js";

const context = () => ({ diagnostics: [], bindings: new BindingManager() });
const comma = () => IR.binary(",", IR.call(IR.id("tick"), []), IR.update("++", IR.id("i"), false));
const loop = (update, body = IR.block([])) => IR.for(IR.varDecl("i", IR.number(0)), IR.bool(true), update, body, undefined, 7);

function freeze(value) {
  if (value && typeof value === "object") {
    Object.freeze(value);
    Object.values(value).forEach(freeze);
  }
  return value;
}

test("simple for update is an immutable no-op", () => {
  const program = freeze(IR.program([loop(IR.update("++", IR.id("i"), false))]));
  assert.equal(forUpdateDesugarPass.run(program, context()), program);
});

test("binary, sequence and grouped updates split without mutating input", () => {
  for (const update of [comma(), IR.sequence([IR.call(IR.id("tick"), []), IR.update("++", IR.id("i"), false)]), IR.grouping(comma())]) {
    const program = freeze(IR.program([loop(update)]));
    const result = forUpdateDesugarPass.run(program, context());
    const block = result.body[0];
    assert.equal(block.kind, "BlockStatement");
    const replacement = block.body[2];
    assert.equal(replacement.kind, "WhileStatement");
    assert.equal(replacement.controlTargetId, 7);
    const updates = replacement.body.body[0].alternate.body;
    assert.deepEqual(
      updates.map((stmt) => stmt.expression.kind),
      ["CallExpression", "UpdateExpression"],
    );
    assert.equal(forUpdateDesugarPass.run(result, context()), result);
  }
});

test("both chained labels and native continue resolve to the replacement iteration", () => {
  const labelled = IR.continue("a");
  const native = IR.continue();
  const program = IR.program([
    IR.labeled("a", IR.labeled("b", loop(comma(), IR.block([labelled, native])), 7, "iteration"), 7, "iteration"),
  ]);
  const result = forUpdateDesugarPass.run(program, context());
  const resolution = resolveControlTargets(result);
  assert.deepEqual(resolution.errors, []);
  assert.equal(resolution.jumps.get(labelled).target.id, 7);
  assert.equal(resolution.jumps.get(native).target.id, 7);
  assert.deepEqual(resolution.jumps.get(native).crossedFinalizers, []);
});

test("nested loops and nested functions are normalized when outer loop is replaced", () => {
  const nested = loop(comma());
  const fn = IR.functionDecl("inner", [], [loop(comma())], undefined, true);
  const result = forUpdateDesugarPass.run(IR.program([loop(comma(), IR.block([nested, fn]))]), context());
  const body = result.body[0].body[2].body.body[2].body;
  assert.equal(body[0].kind, "BlockStatement");
  assert.equal(body[1].plainSignature, true);
  assert.equal(body[1].body[0].kind, "BlockStatement");
});

test("comma detection excludes argument separators but includes consumed subexpressions", () => {
  assert.equal(containsCommaOperator(IR.call(IR.id("next"), [IR.id("i"), IR.number(1)])), false);
  assert.equal(containsCommaOperator(IR.assign("=", IR.id("i"), IR.grouping(comma()))), true);
  assert.equal(containsCommaOperator(IR.call(IR.id("next"), [IR.grouping(comma())])), true);
});

test("emitter rejects unsafe updates even when nested or grouped", () => {
  for (const update of [comma(), IR.sequence([IR.id("a"), IR.id("b")]), IR.assign("=", IR.id("i"), IR.grouping(comma()))]) {
    assert.throws(() => emit(IR.program([loop(update)])), /Comma operator in for update/);
  }
});
