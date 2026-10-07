import assert from "node:assert/strict";
import test from "node:test";
import ts from "typescript";

import { compile } from "../build/index.js";

function compileBare(source) {
  const result = compile(source, { filename: "fixture.ts", mode: "bare" });
  const diagnostics = result.diagnostics.map((diagnostic) => String(diagnostic.messageText)).join("\n");
  assert.equal(result.success, true, diagnostics);
  return result.outputs[0].code;
}

test("try/finally output contains no native finally or throw sentinel return", () => {
  const output = compileBare(`
    function work(): void {}
    function probe() {
      try { return 1; }
      catch (error) { return 2; }
      finally { work(); }
    }
  `);

  assert.doesNotMatch(output, /\bfinally\b/);
  assert.doesNotMatch(output, /__f(Type|Val)/);
  assert.match(output, /__acType0/);
  assert.match(output, /__acValue0/);
});

test("return expression is evaluated before RETURN completion is recorded", () => {
  const output = compileBare(`
    function boom() { throw "boom"; }
    function cleanup(): void {}
    function probe() {
      try { return boom(); }
      finally { cleanup(); }
    }
  `);

  const valueAssignment = output.indexOf("__acValue0 = boom()");
  const returnCompletion = output.indexOf("__acType0 = 1", valueAssignment);
  assert.notEqual(valueAssignment, -1);
  assert.ok(returnCompletion > valueAssignment);
});

test("completion temporaries avoid every conflicting source prefix", () => {
  const output = compileBare(`
    let __acType0 = 1;
    let __acTarget0 = 2;
    let __acValue0 = 3;
    let __savedType0 = 4;
    function probe() {
      try { return __acType0; }
      finally { done: { break done; } __savedType0; }
    }
  `);

  assert.match(output, /var __acType1/);
  assert.match(output, /var __acTarget1/);
  assert.match(output, /var __acValue1/);
  assert.match(output, /var __savedType1/);
});

test("plain finalizer and unprotected return need no save record or target slot", () => {
  const output = compileBare(`function cleanup() {} function probe() { try { return 1; } finally { cleanup(); } }`);
  assert.doesNotMatch(output, /__saved|__acTarget/);
  assert.ok(output.length < 1500, `Simple finalizer grew to ${output.length} bytes`);
});

test("return outside a protected region remains native", () => {
  const output = compileBare(`function probe() { try { 1; } finally { 2; } return 3; }`);
  assert.match(output, /return 3;/);
  assert.doesNotMatch(output, /__acValue\d+ = 3/);
});

test("unaffected native loop boundaries preserve their local jumps", () => {
  const output = compileBare(`
    function probe() {
      try { 1; } finally { 2; }
      for (var i=0;i<3;i++) { if(i===0)continue; if(i===2)break; }
      return 3;
    }
  `);
  assert.doesNotMatch(output, /__acTarget/);
  assert.match(output, /continue;/);
  assert.equal((output.match(/while \(true\)/g) ?? []).length, 1);
});

test("ordinary code receives no completion-state overhead", () => {
  const output = compileBare(`
    function add(a: number, b: number) { return a + b; }
  `);

  assert.doesNotMatch(output, /__ac(Type|Target|Value)/);
  assert.doesNotMatch(output, /while \(true\)/);
});

test("functions nested under source containers get independent completion lowering", () => {
  const output = compileBare(`
    function outer() {
      if (true) {
        function inner() {
          try { return 1; } finally { unused: { 2; } }
        }
        return inner();
      }
    }
  `);
  assert.doesNotMatch(output, /\bfinally\b|unused:/);
  assert.match(output, /__acType0/);
});

test("erased labels are not restored by unaffected enclosing containers", () => {
  const output = compileBare(`
    function probe() {
      try {
        while (false) { unused: { 1; } }
        switch (1) { case 1: another: { 2; } }
        try { third: { 3; } } catch (e) { fourth: { 4; } }
      } finally { 5; }
    }
  `);
  assert.doesNotMatch(output, /unused:|another:|third:|fourth:|\bfinally\b/);
});

test("nested finalizers grow structurally instead of duplicating continuations", () => {
  const sizes = [];
  for (let depth = 1; depth <= 4; depth++) {
    let body = "return 1;";
    for (let level = 0; level < depth; level++) body = `try { ${body} } finally { cleanup(); }`;
    const output = compileBare(`function cleanup() {} function probe() { ${body} }`);
    const file = ts.createSourceFile("output.js", output, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    let nodes = 0;
    function count(node) {
      nodes++;
      ts.forEachChild(node, count);
    }
    count(file);
    sizes.push(nodes);
  }
  const increments = sizes.slice(1).map((size, index) => size - sizes[index]);
  assert.ok(Math.max(...increments) <= Math.min(...increments) * 1.2, `Nonlinear output AST growth: ${sizes.join(", ")}`);
});
