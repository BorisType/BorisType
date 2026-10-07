import assert from "node:assert/strict";
import test from "node:test";
import ts from "typescript";

import { analyzeScopes } from "../build/analyzer/index.js";
import { emit } from "../build/emitter/index.js";
import { transformToIR } from "../build/lowering/index.js";

function lowerBare(source) {
  const filename = "fixture.ts";
  const compilerOptions = {
    target: ts.ScriptTarget.Latest,
    module: ts.ModuleKind.ESNext,
    strict: true,
    noEmit: true,
  };
  const sourceFile = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const host = ts.createCompilerHost(compilerOptions);
  const defaultGetSourceFile = host.getSourceFile.bind(host);
  const defaultFileExists = host.fileExists.bind(host);
  const defaultReadFile = host.readFile.bind(host);

  host.getSourceFile = (requested, languageVersion, onError, shouldCreateNewSourceFile) =>
    requested === filename ? sourceFile : defaultGetSourceFile(requested, languageVersion, onError, shouldCreateNewSourceFile);
  host.fileExists = (requested) => requested === filename || defaultFileExists(requested);
  host.readFile = (requested) => (requested === filename ? source : defaultReadFile(requested));

  const program = ts.createProgram([filename], compilerOptions, host);
  const checkedSourceFile = program.getSourceFile(filename);
  assert.ok(checkedSourceFile);
  const scopeAnalysis = analyzeScopes(sourceFile);
  const { ir, diagnostics } = transformToIR(checkedSourceFile, program.getTypeChecker(), scopeAnalysis, { mode: "bare" });

  assert.deepEqual(diagnostics, []);
  return ir;
}

test("lowering preserves a labeled loop and its jump", () => {
  const ir = lowerBare(`
    outer: while (true) {
      break outer;
    }
  `);

  const labeled = ir.body[0];
  assert.equal(labeled.kind, "LabeledStatement");
  assert.equal(labeled.label, "outer");
  assert.equal(labeled.targetKind, "iteration");
  assert.equal(labeled.body.kind, "WhileStatement");
  assert.equal(labeled.body.controlTargetId, labeled.controlTargetId);
  assert.equal(labeled.body.body.kind, "BlockStatement");
  assert.equal(labeled.body.body.body[0].kind, "BreakStatement");
  assert.equal(labeled.body.body.body[0].label, "outer");
});

test("expanded for-of keeps the source iteration target identity", () => {
  const ir = lowerBare(`
    outer: for (const item of [1, 2]) {
      continue outer;
    }
  `);

  const labeled = ir.body[0];
  assert.equal(labeled.kind, "LabeledStatement");
  assert.equal(labeled.targetKind, "iteration");
  assert.equal(labeled.body.kind, "BlockStatement");

  const generatedLoop = labeled.body.body.find((statement) => statement.kind === "ForInStatement");
  assert.ok(generatedLoop);
  assert.equal(generatedLoop.controlTargetId, labeled.controlTargetId);
});

test("emitter rejects labels that survive the required desugar pass", () => {
  const ir = lowerBare(`done: { break done; }`);

  assert.throws(() => emit(ir), /LabeledStatement reached BorisScript emitter before required desugaring/);
});
