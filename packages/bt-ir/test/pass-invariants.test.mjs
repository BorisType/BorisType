import assert from "node:assert/strict";
import test from "node:test";
import ts from "typescript";
import { IR } from "../build/ir/index.js";
import { emit } from "../build/emitter/index.js";
import { analyzeScopes } from "../build/analyzer/index.js";
import { BindingManager } from "../build/lowering/binding.js";
import { mapStatements } from "../build/passes/walker.js";
import { abruptCompletionDesugarPass } from "../build/passes/abrupt-completion-desugar.js";

test("unaffected program is an identity transformation", () => {
  const program = IR.program([IR.functionDecl("f", [], [IR.if(IR.bool(true), IR.block([IR.return(IR.number(1))]))])]);
  const result = abruptCompletionDesugarPass.run(program, { diagnostics: [], bindings: new BindingManager() });
  assert.equal(result, program);
});

test("walker preserves source target identities when rebuilding every boundary", () => {
  const body = IR.block([IR.empty()]);
  const statements = [
    IR.for(null, null, null, body, undefined, 1),
    IR.forIn("item", IR.id("items"), body, undefined, 2),
    IR.while(IR.bool(true), body, undefined, 3),
    IR.doWhile(body, IR.bool(false), undefined, 4),
    IR.switch(IR.number(1), [IR.case(null, body.body)], undefined, 5),
  ];
  const result = mapStatements(statements, (statement) => (statement.kind === "EmptyStatement" ? IR.exprStmt(IR.number(0)) : null));
  assert.deepEqual(
    result.map((statement) => statement.controlTargetId),
    [1, 2, 3, 4, 5],
  );
});

test("emitter rejects all unsupported control-flow survivors", () => {
  for (const jump of [IR.break("outer"), IR.continue("outer")]) {
    assert.throws(() => emit(IR.program([jump])), /before required desugaring/);
  }
  assert.throws(() => emit(IR.program([IR.try(IR.block([]), null, IR.block([]))])), /Native finally/);
  assert.throws(() => emit(IR.program([IR.try(IR.block([]), IR.catch(null, IR.block([])), null)])), /named catch/);
});

test("blocks resolve catch shadows without spuriously capturing outer bindings", () => {
  const file = ts.createSourceFile(
    "fixture.ts",
    `function f(error: string) {try {throw 'x';}catch(error){{error;}} return error;}`,
    ts.ScriptTarget.Latest,
    true,
  );
  const scopes = analyzeScopes(file);
  const fn = scopes.nodeToScope.get(file.statements[0]);
  const caught = scopes.nodeToScope.get(file.statements[0].body.statements[0].catchClause);
  assert.equal(fn.variables.get("error").isCaptured, false);
  assert.equal(caught.variables.get("error").isCaptured, false);
  assert.match(caught.variables.get("error").renamedTo, /^__caught/);
});

test("only the captured catch binding creates an environment", () => {
  const file = ts.createSourceFile(
    "fixture.ts",
    `function f(error: string) {try {throw 'x';}catch(error){const read=()=>error;} return error;}`,
    ts.ScriptTarget.Latest,
    true,
  );
  const scopes = analyzeScopes(file);
  const fn = scopes.nodeToScope.get(file.statements[0]);
  const caught = scopes.nodeToScope.get(file.statements[0].body.statements[0].catchClause);
  assert.equal(fn.variables.get("error").isCaptured, false);
  assert.equal(caught.variables.get("error").isCaptured, true);
  assert.equal(caught.hasCaptured, true);
});
