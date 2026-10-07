import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { compile } from "../build/index.js";
import { caseSource } from "./semantic/abrupt-cases.mjs";
import { forUpdateCases } from "./semantic/for-update-cases.mjs";
import { assertSafeForUpdates } from "./semantic/output-invariants.mjs";

test("comma-update regressions preserve Node semantics and never emit unsafe headers", () => {
  const source = caseSource(forUpdateCases());
  const expected = vm.runInNewContext(ts.transpileModule(source + "runAll();", {}).outputText, {}, { timeout: 2000 });
  const result = compile(source, { filename: "updates.ts", mode: "bare" });
  assert.equal(result.success, true, result.diagnostics.map((item) => String(item.messageText)).join("\n"));
  const output = result.outputs[0].code;
  assertSafeForUpdates(output);
  assert.equal(vm.runInNewContext(output + "runAll();", {}, { timeout: 2000 }), expected);
});

test("simple updates and ordinary argument commas incur no loop rewrite", () => {
  const result = compile(
    `function next(i: number, n: number) { return i + n; }
     function probe() { for(var i=0;i<3;i=next(i,1)) { if(i===0)continue; } }`,
    { filename: "simple.ts", mode: "bare" },
  );
  assert.equal(result.success, true);
  const output = result.outputs[0].code;
  assertSafeForUpdates(output);
  assert.match(output, /for \(i = 0; i < 3; i = next\(i, 1\)\)/);
  assert.doesNotMatch(output, /__forFirst|while \(true\)|__acType/);
});

test("loop temporaries avoid source names and add no helper call or completion carrier", () => {
  const result = compile(
    `function probe() { var __forFirst0=7; var trace='';
      for(var i=0;i<3;trace+='U',i++){trace+=i;continue;}
      return trace+__forFirst0; }`,
    { filename: "collision.ts", mode: "bare" },
  );
  assert.equal(result.success, true);
  const output = result.outputs[0].code;
  assertSafeForUpdates(output);
  assert.match(output, /__forFirst1/);
  assert.doesNotMatch(output, /__acType/);
  const file = ts.createSourceFile("output.js", output, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  assert.equal(file.statements.filter(ts.isFunctionDeclaration).length, 1);
  assert.ok(output.length < 750, `Simple rewrite grew to ${output.length} bytes`);
  assert.equal(vm.runInNewContext(output + "probe();", {}, { timeout: 1000 }), "0U1U2U7");
});

test("moved condition exits natively even when the body crosses finally", () => {
  const result = compile(
    `function probe(ledger: {value:string}) {
      outer:for(var i=0;i<3;ledger.value+='U',i++){
        try{ledger.value+=i;continue outer;}finally{ledger.value+='F';}
      }return 'E';
    }`,
    { filename: "native-prefix.ts", mode: "bare" },
  );
  assert.equal(result.success, true);
  const output = result.outputs[0].code;
  assert.match(output, /if \(!\(i < 3\)\) \{\s+break;\s+\}/);
  assert.ok(output.length < 3000, `Affected update rewrite grew to ${output.length} bytes`);
});
