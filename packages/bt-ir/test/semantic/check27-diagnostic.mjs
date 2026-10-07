/** Bounded C-runtime diagnosis: compound for update versus continue carrier. */
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import vm from "node:vm";
import ts from "typescript";
import { compile } from "../../build/index.js";
import { evalBorisScriptAsync } from "../../../botest/build/borisscript/runner.js";
import { abruptCases, caseSource } from "./abrupt-cases.mjs";
import { assertSafeForUpdates } from "./output-invariants.mjs";

const root = fileURLToPath(new URL("../../../../", import.meta.url));
process.chdir(root);
const item = abruptCases().find((item) => item.name === "for-update");
assert.ok(item);
const compiled = compile(caseSource([item]), { filename: "check27.ts", mode: "bare" });
assert.equal(compiled.success, true);
const output = compiled.outputs[0].code;
const parsed = ts.createSourceFile("generated.js", output, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const worker = parsed.statements.find((node) => ts.isFunctionDeclaration(node) && node.name.text === "work0");
assert.ok(worker);
const guard = `fuel = fuel + 1;
    if (fuel > 64) { return 'LIMIT:i=' + i + ',trace=' + ledger.value + ',type=' + __acType0; }`;
function boundLoops(code) {
  return code.replace(
    /^([ \t]*)(while \(true\) \{|for \(i = 0; i < 3;[^\n]+\) \{)/gm,
    (header, pad) => header + "\n" + pad + "    " + guard.replaceAll("\n    ", "\n" + pad + "    "),
  );
}
const fixed = boundLoops(
  worker
    .getText(parsed)
    .replace("function work0(ledger) {", "function GeneratedFixed(ledger) {\n    var fuel;")
    .replace("    __acType0 = 0;", "    fuel = 0;\n    __acType0 = 0;"),
);
assertSafeForUpdates(fixed);
// Pre-fix generated shape is retained as a regression fixture, not reintroduced
// through the compiler. These intentionally unsafe headers are bounded.
const legacy = `function GeneratedComma(ledger) {
    var fuel;
    var __acType0;
    var __acTarget0;
    var __acValue0;
    var i;
    fuel = 0;
    __acType0 = 0;
    __acTarget0 = 0;
    __acValue0 = undefined;
    while (true) {
        for (i = 0; i < 3; ledger.value = (ledger.value + "U"), i++) {
            while (true) {
                {
                    try {
                        while (true) {
                            ledger.value = (ledger.value + i);
                            {
                                __acType0 = 4;
                                __acTarget0 = 0;
                                break;
                            }
                            break;
                        }
                    }
                    catch (__abruptError0) {
                        __acValue0 = __abruptError0;
                        __acType0 = 2;
                    }
                    { ledger.value = (ledger.value + "F"); }
                }
                break;
            }
            if (__acType0 === 4) {
                if (__acTarget0 === 0) { __acType0 = 0; continue; }
            }
            if (__acType0 === 3) {
                if (__acTarget0 === 0) { __acType0 = 0; break; }
            }
            if (__acType0 !== 0) { break; }
        }
        if (__acType0 !== 0) { break; }
        return "E";
        break;
    }
    if (__acType0 === 1) { return __acValue0; }
    if (__acType0 === 2) { throw __acValue0; }
}`;
const guarded = boundLoops(legacy);
const simple = guarded
  .replace("function GeneratedComma", "function GeneratedSimple")
  .replace(/for \(i = 0; i < 3;[^\n]+\) \{/, "for (i = 0; i < 3; i++) {");
const helper = guarded
  .replace("function GeneratedComma", "function GeneratedHelper")
  .replace(/for \(i = 0; i < 3;[^\n]+\) \{/, "for (i = 0; i < 3; i = ProbeUpdate(i, ledger)) {");
assert.notEqual(simple, guarded);

const diagnostic = `
function RawCommaNormal() {
    var trace;
    var i;
    var fuel;
    trace = '';
    fuel = 0;
    for (i = 0; i < 3; trace = (trace + 'U'), i++) {
        fuel = fuel + 1;
        if (fuel > 16) { return 'LIMIT:i=' + i + ',trace=' + trace; }
        trace = trace + i;
    }
    return trace;
}
function RawCommaContinue() {
    var trace;
    var i;
    var fuel;
    trace = '';
    fuel = 0;
    for (i = 0; i < 3; trace = (trace + 'U'), i++) {
        fuel = fuel + 1;
        if (fuel > 16) { return 'LIMIT:i=' + i + ',trace=' + trace; }
        trace = trace + i;
        continue;
    }
    return trace;
}
function RawSimpleContinue() {
    var trace;
    var i;
    var fuel;
    trace = '';
    fuel = 0;
    for (i = 0; i < 3; i++) {
        fuel = fuel + 1;
        if (fuel > 16) { return 'LIMIT:i=' + i + ',trace=' + trace; }
        trace = trace + i;
        continue;
    }
    return trace;
}
function ProbeUpdate(i, ledger) {
    ledger.value = ledger.value + 'U';
    return i + 1;
}
${guarded}
${simple}
${helper}
${fixed}
function CheckGenerated(mode) {
    var ledger;
    var outcome;
    ledger = {value: ''};
    outcome = '';
    try {
        if (mode == 0) { outcome = GeneratedComma(ledger); }
        if (mode == 1) { outcome = GeneratedSimple(ledger); }
        if (mode == 2) { outcome = GeneratedHelper(ledger); }
        if (mode == 3) { outcome = GeneratedFixed(ledger); }
    }
    catch (probeError) { return 'ERROR:' + probeError; }
    return ledger.value + '|' + outcome;
}
function Check27Diagnostic() {
    var result;
    result = 'raw-normal=' + RawCommaNormal();
    result = result + '\\nraw-continue=' + RawCommaContinue();
    result = result + '\\nraw-simple=' + RawSimpleContinue();
    result = result + '\\ngenerated-comma=' + CheckGenerated(0);
    result = result + '\\ngenerated-simple=' + CheckGenerated(1);
    result = result + '\\ngenerated-helper=' + CheckGenerated(2);
    result = result + '\\ngenerated-fixed=' + CheckGenerated(3);
    return result;
}
MESSAGE = Check27Diagnostic();
`;
const expected =
  "raw-normal=0U1U2U\nraw-continue=0U1U2U\nraw-simple=012\ngenerated-comma=0FU1FU2FU|E\ngenerated-simple=0F1F2F|E\ngenerated-helper=0FU1FU2FU|E\ngenerated-fixed=0FU1FU2FU|E";
assert.equal(vm.runInNewContext(diagnostic + "\nMESSAGE;", {}, { timeout: 1000 }), expected);
assert.equal(await evalBorisScriptAsync(diagnostic + "\nreturn MESSAGE;", undefined, 3000), expected);
const artifacts = resolve(root, "packages/bt-ir/build/semantic");
mkdirSync(artifacts, { recursive: true });
writeFileSync(resolve(artifacts, "Check27Diagnostic.js"), diagnostic);
writeFileSync(resolve(artifacts, "Check27Diagnostic.expected.txt"), expected + "\n");
console.log(expected);
const fixedProbe =
  fixed +
  "\nvar ledger;\nvar outcome;\nledger = {value: ''};\noutcome = GeneratedFixed(ledger);\nMESSAGE = ledger.value + '|' + outcome;\n";
assert.equal(vm.runInNewContext(fixedProbe + "MESSAGE;", {}, { timeout: 1000 }), "0FU1FU2FU|E");
assert.equal(await evalBorisScriptAsync(fixedProbe + "return MESSAGE;", undefined, 3000), "0FU1FU2FU|E");
writeFileSync(resolve(artifacts, "Check27Fixed.js"), fixedProbe);
writeFileSync(resolve(artifacts, "Check27Fixed.expected.txt"), "0FU1FU2FU|E\n");
console.log("Saved packages/bt-ir/build/semantic/Check27Diagnostic.js and Check27Fixed.js (bounded)");
