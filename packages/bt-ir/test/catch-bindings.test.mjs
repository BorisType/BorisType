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

test("catch shadowing is resolved before function argument access", () => {
  const result = compile(
    `
    function probe(error: string) {
      try { throw "inner"; } catch (error) { return error; }
    }
  `,
    { filename: "fixture.ts", mode: "script" },
  );
  assert.equal(result.success, true);
  assert.match(result.outputs[0].code, /return __caught0;/);
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

test("catch shadows an import in value access and callable resolution", () => {
  const result = compile(
    `
    import { compile as error } from "@boristype/bt-ir";
    function probe() {
      try { throw 1; } catch (error: any) {
        error = () => 2;
        error();
        return error;
      }
    }
  `,
    { filename: "../bt-cli/fixture.ts", mode: "script" },
  );
  assert.equal(result.success, true, result.diagnostics.map((item) => String(item.messageText)).join("\n"));
  const output = result.outputs[0].code;
  assert.match(output, /bt.callFunction\(__caught0, \[\]\)/);
  assert.match(output, /return __caught0;/);
  assert.doesNotMatch(output, /__env\.__module__boristype_bt_ir/);
});
