import assert from "node:assert/strict";
import test from "node:test";

import { compile } from "../build/index.js";

function compileBare(source) {
  const result = compile(source, { filename: "fixture.ts", mode: "bare" });
  const diagnostics = result.diagnostics.map((diagnostic) => String(diagnostic.messageText)).join("\n");

  assert.equal(result.success, true, diagnostics);
  assert.equal(result.outputs.length, 1);
  return result.outputs[0].code;
}

test("catch binding uses a unique physical parameter", () => {
  const output = compileBare(`
    let error = "outer";
    try { throw "inner"; } catch (error) { error + ""; }
  `);

  assert.match(output, /catch \(__caught0\)/);
  assert.doesNotMatch(output, /catch \(error\)/);
  assert.match(output, /__caught0 \+ ""/);
});

test("optional catch binding is normalized for the target parser", () => {
  const output = compileBare(`
    try { throw "inner"; } catch { }
  `);

  assert.match(output, /catch \(__caught0\)/);
  assert.doesNotMatch(output, /catch\s+\{/);
});

test("catch physical name avoids source identifiers", () => {
  const output = compileBare(`
    let __caught0 = "source";
    try { throw "inner"; } catch (error) { error + __caught0; }
  `);

  assert.match(output, /catch \(__caught1\)/);
  assert.doesNotMatch(output, /catch \(__caught0\)/);
});

test("catch destructuring is rejected explicitly instead of silently dropping bindings", () => {
  for (const binding of ["{message}", "[message]"]) {
    const result = compile(`try { throw "inner"; } catch (${binding}: any) { message; }`, {
      filename: "fixture.ts",
      mode: "bare",
    });
    assert.equal(result.success, false);
    assert.ok(result.diagnostics.some((diagnostic) => String(diagnostic.messageText).includes("catch binding pattern")));
  }
});
