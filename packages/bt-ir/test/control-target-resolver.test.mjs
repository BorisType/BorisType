import assert from "node:assert/strict";
import test from "node:test";

import { IR } from "../build/ir/index.js";
import { resolveControlTargets } from "../build/passes/control-target-resolver.js";

test("resolver rejects undefined labels and duplicate active names", () => {
  const missing = IR.break("missing");
  const duplicate = IR.labeled("same", IR.labeled("same", IR.block([]), 2, "statement"), 1, "statement");
  const resolution = resolveControlTargets(IR.program([missing, duplicate]));
  assert.equal(resolution.errors.length, 2);
  assert.match(resolution.errors[0].message, /Undefined break label: missing/);
  assert.match(resolution.errors[1].message, /Duplicate active label: same/);
});

test("resolver marks returns in protected bodies but not their own finalizer", () => {
  const protectedReturn = IR.return(IR.number(1));
  const finalizerReturn = IR.return(IR.number(2));
  const statement = IR.try(IR.block([protectedReturn]), null, IR.block([finalizerReturn]));
  const resolution = resolveControlTargets(IR.program([statement]));
  assert.equal(resolution.protectedReturns.has(protectedReturn), true);
  assert.equal(resolution.protectedReturns.has(finalizerReturn), false);
});

test("resolver distinguishes switch break from enclosing-loop continue", () => {
  const switchBreak = IR.break();
  const loopContinue = IR.continue();
  const switchStatement = IR.switch(IR.id("value"), [IR.case(null, [switchBreak, loopContinue])], undefined, 2);
  const loop = IR.while(IR.bool(true), IR.block([switchStatement]), undefined, 1);
  const program = IR.program([loop]);

  const resolution = resolveControlTargets(program);

  assert.deepEqual(resolution.errors, []);
  assert.equal(resolution.jumps.get(switchBreak)?.target.id, 2);
  assert.equal(resolution.jumps.get(switchBreak)?.target.kind, "switch");
  assert.equal(resolution.jumps.get(loopContinue)?.target.id, 1);
  assert.equal(resolution.jumps.get(loopContinue)?.target.kind, "iteration");
});

test("resolver maps labeled break and continue to exact lexical targets", () => {
  const breakDone = IR.break("done");
  const continueOuter = IR.continue("outer");
  const loop = IR.while(IR.bool(true), IR.block([continueOuter]), undefined, 7);
  const labeledLoop = IR.labeled("outer", loop, 7, "iteration");
  const labeledBlock = IR.labeled("done", IR.block([labeledLoop, breakDone]), 8, "statement");

  const resolution = resolveControlTargets(IR.program([labeledBlock]));

  assert.deepEqual(resolution.errors, []);
  assert.equal(resolution.jumps.get(continueOuter)?.target.id, 7);
  assert.equal(resolution.jumps.get(breakDone)?.target.id, 8);
});

test("resolver reports exactly which finalizer a jump crosses", () => {
  const localBreak = IR.break();
  const breakDone = IR.break("done");
  const localLoop = IR.while(IR.bool(true), IR.block([localBreak]), undefined, 3);
  const protectedTry = IR.try(IR.block([localLoop, breakDone]), null, IR.block([]));
  const labeled = IR.labeled("done", protectedTry, 4, "statement");

  const resolution = resolveControlTargets(IR.program([labeled]));

  assert.deepEqual(resolution.errors, []);
  assert.deepEqual(resolution.jumps.get(localBreak)?.crossedFinalizers, []);
  assert.deepEqual(resolution.jumps.get(breakDone)?.crossedFinalizers, [protectedTry]);
});

test("labels do not cross function boundaries", () => {
  const invalidBreak = IR.break("outer");
  const nestedFunction = IR.functionDecl("nested", [], [invalidBreak]);
  const labeled = IR.labeled("outer", IR.block([nestedFunction]), 9, "statement");

  const resolution = resolveControlTargets(IR.program([labeled]));

  assert.equal(resolution.jumps.has(invalidBreak), false);
  assert.match(resolution.errors[0]?.message ?? "", /Undefined break label: outer/);
});

test("continue rejects a non-iteration label", () => {
  const invalidContinue = IR.continue("blockLabel");
  const labeled = IR.labeled("blockLabel", IR.block([invalidContinue]), 5, "statement");

  const resolution = resolveControlTargets(IR.program([labeled]));

  assert.equal(resolution.jumps.has(invalidContinue), false);
  assert.match(resolution.errors[0]?.message ?? "", /not an iteration target/);
});
