import assert from "node:assert/strict";
import test from "node:test";
import ts from "typescript";
import { compile, compileSourceFile } from "../build/index.js";
import * as diagnostics from "../build/pipeline/diagnostics.js";
import * as ir from "../build/ir/index.js";
import { BindingManager } from "../build/lowering/binding.js";
import { emit } from "../build/emitter/index.js";
import { forEachStatement } from "../build/passes/walker.js";
import { runPasses, abruptCompletionDesugarPass, forUpdateDesugarPass, tryFinallyDesugarPass } from "../build/passes/index.js";
import { containsCommaOperator as legacyContainsCommaOperator } from "../build/passes/for-update-desugar.js";

const { IR } = ir;
const context = () => ({ diagnostics: [], bindings: new BindingManager() });

function freeze(value) {
  if (value && typeof value === "object") {
    Object.freeze(value);
    Object.values(value).forEach(freeze);
  }
  return value;
}

test("collector traverses chained labels, single bodies and blocks in source order without mutation", () => {
  const returned = IR.return(IR.number(1));
  const inner = IR.labeled("inner", returned, 2, "statement");
  const block = IR.block([inner]);
  const outer = IR.labeled("outer", block, 1, "statement");
  const single = IR.labeled("single", IR.empty(), 3, "statement");
  const statements = freeze([outer, single]);
  const seen = [];
  forEachStatement(statements, (statement) => seen.push(statement));
  assert.deepEqual(seen, [outer, block, inner, returned, single, single.body]);
});

test("collector respects function boundaries inside and outside labels", () => {
  const returned = IR.return(IR.number(1));
  const inner = IR.labeled("inner", returned, 2, "statement");
  const fn = IR.functionDecl("f", [], [inner]);
  const outer = IR.labeled("outer", IR.block([fn]), 1, "statement");
  const statements = freeze([outer]);
  for (const enterFunctions of [false, true]) {
    const seen = [];
    forEachStatement(statements, (statement) => seen.push(statement), { enterFunctions });
    assert.deepEqual(seen, [outer, outer.body, fn, ...(enterFunctions ? [inner, returned] : [])]);
  }
  const seen = [];
  forEachStatement(statements, (statement) => seen.push(statement));
  assert.deepEqual(seen, [outer, outer.body, fn]);
});

test("pass manager rejects missing/reversed update normalization and accepts the declared order", () => {
  const program = IR.program([]);
  assert.equal(tryFinallyDesugarPass, abruptCompletionDesugarPass);
  for (const passes of [[abruptCompletionDesugarPass], [abruptCompletionDesugarPass, forUpdateDesugarPass]]) {
    assert.throws(() => runPasses(program, passes, context()), /depends on "for-update-desugar"/);
  }
  assert.equal(runPasses(program, [forUpdateDesugarPass, abruptCompletionDesugarPass], context()), program);
});

test("pass manager halts on newly reported errors, without hiding existing diagnostics or halting on warnings", () => {
  for (const category of [ts.DiagnosticCategory.Error, ts.DiagnosticCategory.Warning]) {
    const ctx = context();
    ctx.diagnostics.push(diagnostics.createBtDiagnosticMessage("existing error"));
    const calls = [];
    const report = {
      name: "report",
      run(program, passContext) {
        calls.push("report");
        passContext.diagnostics.push(diagnostics.createBtDiagnosticMessage("new diagnostic", category));
        return program;
      },
    };
    const after = {
      name: "after",
      run(program) {
        calls.push("after");
        return program;
      },
    };
    const program = IR.program([]);
    assert.equal(runPasses(program, [report, after], ctx), program);
    assert.deepEqual(calls, category === ts.DiagnosticCategory.Error ? ["report"] : ["report", "after"]);
    assert.equal(ctx.diagnostics.length, 2);
  }
});

function virtualProgram(source) {
  const filename = "invalid.ts";
  const options = { target: ts.ScriptTarget.Latest, noEmit: true, noLib: true };
  const file = ts.createSourceFile(filename, source, options.target, true);
  const host = ts.createCompilerHost(options);
  host.getSourceFile = (name) => (name === filename ? file : undefined);
  const program = ts.createProgram([filename], options, host);
  return { file, program };
}

test("both compilation entrypoints report every invalid control target at its source range, in every mode", () => {
  const source =
    "// 😀\r\nfunction probe() {\r\n  outer: {\r\n    continue outer;\r\n  }\r\n  break absent;\r\n  same: same: {}\r\n  break;\r\n  continue;\r\n}";
  const ranges = ["continue outer;", "break absent;", "same: {}", "break;", "continue;"];
  const { file, program } = virtualProgram(source);
  for (const mode of ["bare", "script", "module"]) {
    const results = [compile(source, { filename: file.fileName, mode }), compileSourceFile(file, program, { mode })];
    for (const result of results) {
      assert.equal(result.success, false);
      assert.deepEqual(result.outputs, []);
      assert.equal(
        result.diagnostics.some((item) => item.code === 90013 || item.code === 90014),
        false,
      );
      const errors = result.diagnostics.filter((item) => item.code === 90018);
      assert.equal(errors.length, ranges.length);
      errors.forEach((error, index) => {
        assert.equal(error.category, ts.DiagnosticCategory.Error);
        assert.equal(error.file.fileName, file.fileName);
        assert.equal(error.start, source.indexOf(ranges[index]));
        assert.equal(error.length, ranges[index].length);
        assert.equal(source.slice(error.start, error.start + error.length), ranges[index]);
      });
    }
    assert.ok(
      results[0].diagnostics.some((item) => item.code === 1115),
      "compile must preserve TypeScript diagnostics",
    );
    assert.ok(
      results[1].diagnostics.every((item) => item.code === 90018),
      "compileSourceFile reports only BT diagnostics",
    );
  }
});

test("resolver diagnostics have a safe positionless fallback and leave invalid IR unchanged", () => {
  const program = freeze(IR.program([IR.break("missing"), IR.continue()]));
  const ctx = context();
  assert.equal(abruptCompletionDesugarPass.run(program, ctx), program);
  assert.deepEqual(
    ctx.diagnostics.map((item) => item.code),
    [90018, 90018],
  );
  for (const item of ctx.diagnostics) {
    assert.equal(item.file, undefined);
    assert.equal(item.start, undefined);
    assert.equal(item.length, undefined);
  }
  const managed = context();
  const later = {
    name: "must-not-run",
    run() {
      assert.fail("invalid IR must not reach subsequent passes");
    },
  };
  assert.equal(runPasses(program, [forUpdateDesugarPass, abruptCompletionDesugarPass, later], managed), program);
  assert.deepEqual(managed.diagnostics, ctx.diagnostics);
});

test("standalone blocks keep nested indentation for spaces and tabs", () => {
  const program = IR.program([IR.functionDecl("f", [], [IR.block([IR.block([IR.return(IR.number(1))])])], undefined, true)]);
  for (const [options, indent] of [
    [{}, "    "],
    [{ indentSize: 2 }, "  "],
    [{ useTabs: true }, "\t"],
  ]) {
    const expected = [
      "function f() {",
      `${indent}{`,
      `${indent.repeat(2)}{`,
      `${indent.repeat(3)}return 1;`,
      `${indent.repeat(2)}}`,
      `${indent}}`,
      "}",
    ].join("\n");
    assert.equal(emit(program, options).code, expected);
  }
});

test("unused nested labels are stripped from native regions in an otherwise stateful scope", () => {
  const result = compile(
    `function probe(value: boolean) {
      done: { if (value) break done; }
      for (var i = 0; i < 2; i++) { unused: { if (i === 1) break; } }
      return i;
    }`,
    { filename: "fixture.ts", mode: "bare" },
  );
  assert.equal(result.success, true, JSON.stringify(result.diagnostics));
  const output = result.outputs[0].code;
  assert.match(output, /__acType/);
  assert.doesNotMatch(output, /\b(?:done|unused)\s*:/);
  assert.doesNotMatch(output, /\b(?:break|continue)\s+(?:done|unused)/);
  assert.match(output, /for \(i = 0; i < 2; i\+\+\)/);
});

test("IR-location diagnostics support CRLF, UTF-16 offsets, absent source names and invalid metadata", () => {
  const file = ts.createSourceFile("fixture.ts", "// 😀\r\n  break missing;\r\n", ts.ScriptTarget.Latest);
  const loc = { start: { line: 2, column: 2 }, end: { line: 2, column: 16 } };
  const create = (sourceFile, location) =>
    diagnostics.createBtDiagnosticAtLocation(sourceFile, location, "invalid target", ts.DiagnosticCategory.Error, 90018);
  const diagnostic = create(file, loc);
  assert.equal(diagnostic.file, file);
  assert.equal(diagnostic.start, file.text.indexOf("break"));
  assert.equal(diagnostic.length, "break missing;".length);
  const multiline = create(file, { start: { line: 1, column: 3 }, end: { line: 2, column: 16 }, source: file.fileName });
  assert.equal(multiline.start, 3);
  assert.equal(file.text.slice(multiline.start, multiline.start + multiline.length), "😀\r\n  break missing;");
  for (const [sourceFile, location] of [
    [undefined, loc],
    [file, undefined],
    [file, { ...loc, source: "different.ts" }],
    [file, { ...loc, start: { line: 0, column: 2 } }],
    [file, { ...loc, end: { line: 99, column: 0 } }],
    [file, { ...loc, start: { line: 2, column: -1 } }],
    [file, { ...loc, end: { line: 2, column: 99 } }],
    [file, { ...loc, start: loc.end, end: loc.start }],
  ]) {
    const fallback = create(sourceFile, location);
    assert.equal(fallback.file, undefined);
    assert.equal(fallback.start, undefined);
    assert.equal(fallback.length, undefined);
    assert.equal(fallback.code, 90018);
    assert.equal(fallback.messageText, "invalid target");
  }
});

test("shared IR comma predicate visits all expression child positions without confusing list separators", () => {
  const wrappers = [
    (value) => IR.grouping(value),
    (value) => IR.binary("+", value, IR.number(1)),
    (value) => IR.binary("+", IR.number(1), value),
    (value) => IR.logical("&&", value, IR.bool(true)),
    (value) => IR.logical("||", IR.bool(false), value),
    (value) => IR.unary("!", value),
    (value) => IR.conditional(value, IR.number(1), IR.number(2)),
    (value) => IR.conditional(IR.bool(true), value, IR.number(2)),
    (value) => IR.conditional(IR.bool(true), IR.number(1), value),
    (value) => IR.call(value, []),
    (value) => IR.call(IR.id("f"), [IR.number(0), value]),
    (value) => IR.member(value, IR.id("x"), true),
    (value) => IR.member(IR.id("obj"), value, true),
    (value) => IR.array([null, value]),
    (value) => IR.object([IR.prop("x", value)]),
    (value) => IR.assign("=", IR.member(value, IR.id("x"), true), IR.number(0)),
    (value) => IR.assign("=", IR.id("x"), value),
    (value) => IR.update("++", IR.member(IR.id("obj"), value, true), false),
    (value) => IR.polyfillCall("array", "map", value, []),
    (value) => IR.polyfillCall("array", "map", IR.id("items"), [value]),
    (value) => IR.runtimeCall("array", "map", [value]),
    (value) => IR.btGetProperty(value, IR.string("x")),
    (value) => IR.btGetProperty(IR.id("obj"), value),
    (value) => IR.btSetProperty(value, IR.string("x"), IR.number(0)),
    (value) => IR.btSetProperty(IR.id("obj"), value, IR.number(0)),
    (value) => IR.btSetProperty(IR.id("obj"), IR.string("x"), value),
    (value) => IR.btCallFunction(value, []),
    (value) => IR.btCallFunction(IR.id("f"), [value]),
    (value) => IR.btIsFunction(value),
    (value) => IR.btIsTrue(value),
  ];
  assert.equal(ir.containsCommaOperator, legacyContainsCommaOperator, "keep the earlier pass-module export compatible");
  for (const wrap of wrappers) {
    for (const comma of [IR.sequence([IR.number(0), IR.number(1)]), IR.binary(",", IR.number(0), IR.number(1))]) {
      const expression = freeze(wrap(comma));
      assert.equal(ir.containsCommaOperator(expression), true, expression.kind);
    }
    assert.equal(ir.containsCommaOperator(freeze(wrap(IR.number(1)))), false);
  }
  for (const expression of [IR.id("x"), IR.number(1), IR.argsAccess(0, "x"), IR.envAccess(0, "x")]) {
    assert.equal(ir.containsCommaOperator(expression), false);
  }
});
