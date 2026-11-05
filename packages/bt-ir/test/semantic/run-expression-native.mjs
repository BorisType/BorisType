/** Capability survey, not a green semantic gate: native errors are reported separately. */
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import assert from "node:assert/strict";
import { expressionNativeCases } from "./expression-native-cases.mjs";
import { runIsolatedTarget, sha256 } from "./expression-support.mjs";

const root = fileURLToPath(new URL("../../../../", import.meta.url));
const artifacts = resolve(root, "packages/bt-ir/build/semantic/expressions/native");
mkdirSync(artifacts, { recursive: true });
const manifest = {
  kind: "raw capability survey, not acceptance",
  runtimeSha256: sha256(readFileSync(resolve(root, "packages/botest/build/borisscript/main.js"))),
  c: "pending",
  results: [],
};
for (const item of expressionNativeCases) {
  assert.equal(vm.runInNewContext(item.code + "\nresult;", {}, { timeout: 1000 }), item.expected);
  const outputPath = resolve(artifacts, item.id + ".js");
  // Separate files: a parser rejection must not prevent other capability probes from running.
  const cCode = item.code + "\nMESSAGE = result;\n";
  writeFileSync(outputPath, cCode);
  const row = { id: item.id, expected: item.expected, outputSha256: sha256(cCode) };
  try {
    row.actual = await runIsolatedTarget({ root, code: item.code, outputPath, mode: "bare" });
    row.status = row.actual === item.expected ? "MATCH" : "MISMATCH";
  } catch (error) {
    row.status = /JavaScript syntax error/.test(String(error?.message)) ? "PARSER_REJECTION" : "ERROR";
    row.error = String(error?.message ?? error);
  }
  manifest.results.push(row);
  writeFileSync(resolve(artifacts, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  console.log(`${row.status} ${row.id}: ${row.actual ?? row.error}`);
}
if (manifest.results.some((row) => row.status !== "MATCH")) process.exitCode = 1;
