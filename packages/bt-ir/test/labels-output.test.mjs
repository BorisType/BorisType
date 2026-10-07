import assert from "node:assert/strict";
import test from "node:test";

import { compile } from "../build/index.js";

test("unsupported and invalid labels fail without emitting partial code", () => {
  for (const source of ["missing: { continue missing; }", "break missing;", "same: same: {}", "annex: function f() {}"]) {
    const result = compile(source, { filename: "fixture.ts", mode: "bare" });
    assert.equal(result.success, false);
    assert.deepEqual(result.outputs, []);
  }
  const annex = compile("annex: function f() {}", { filename: "fixture.ts", mode: "bare" });
  assert.ok(annex.diagnostics.some((item) => item.code === 90017));
});

function compileBare(source) {
  const result = compile(source, { filename: "fixture.ts", mode: "bare" });
  const diagnostics = result.diagnostics.map((diagnostic) => String(diagnostic.messageText)).join("\n");
  assert.equal(result.success, true, diagnostics);
  return result.outputs[0].code;
}

test("unused label is erased with no completion-state overhead", () => {
  const output = compileBare(`
    let value = 0;
    unused: { value = 1; }
  `);

  assert.doesNotMatch(output, /unused\s*:/);
  assert.doesNotMatch(output, /__acType/);
  assert.doesNotMatch(output, /while \(true\)/);
});

test("arbitrary labeled break is lowered through structured completion", () => {
  const output = compileBare(`
    let trace = "";
    done: {
      trace += "A";
      break done;
      trace += "X";
    }
    trace += "B";
  `);

  assert.doesNotMatch(output, /done\s*:/);
  assert.doesNotMatch(output, /break\s+done/);
  assert.match(output, /var __acType0 = 0;/);
  assert.match(output, /var __acTarget0 = 0;/);
  assert.match(output, /while \(true\)/);
});

test("nested labeled loop and switch leave no target label syntax", () => {
  const output = compileBare(`
    outer: for (let i = 0; i < 3; i++) {
      switch (i) {
        case 1: continue outer;
        case 2: break outer;
      }
    }
  `);

  assert.doesNotMatch(output, /outer\s*:/);
  assert.doesNotMatch(output, /(break|continue)\s+outer/);
  assert.match(output, /__acType0 = 4/);
  assert.match(output, /__acType0 = 3/);
});
