#!/usr/bin/env node
/**
 * CLI entry point for bt-ir compiler
 *
 * Usage:
 *   node --experimental-strip-types src/cli.ts <file.ts>
 *   npm test <file.ts>
 */

import * as fs from "node:fs";
import * as path from "node:path";
import ts from "typescript";
import { compileFile } from "./pipeline/index.ts";

const args = process.argv.slice(2);

if (args.length === 0) {
  console.log("BT-IR Compiler - TypeScript to BorisScript via IR");
  console.log("");
  console.log("Usage: npm test <file.ts>");
  console.log("");
  console.log("Options:");
  console.log("  --debug-ir      Print IR JSON");
  console.log("  --debug-scopes  Print scope tree with captured variables");
  console.log("  --output, -o    Output file path");
  process.exit(0);
}

// Parse arguments
let inputFile: string | null = null;
let outputFile: string | null = null;
let debugIR = false;
let debugScopes = false;

for (let i = 0; i < args.length; i++) {
  const arg = args[i];

  if (arg === "--debug-ir") {
    debugIR = true;
  } else if (arg === "--debug-scopes") {
    debugScopes = true;
  } else if (arg === "--output" || arg === "-o") {
    outputFile = args[++i];
  } else if (!arg.startsWith("-")) {
    inputFile = arg;
  }
}

if (!inputFile) {
  console.error("Error: No input file specified");
  process.exit(1);
}

// Resolve path
const absolutePath = path.resolve(inputFile);

if (!fs.existsSync(absolutePath)) {
  console.error(`Error: File not found: ${absolutePath}`);
  process.exit(1);
}

// Read source
const sourceCode = fs.readFileSync(absolutePath, "utf-8");

console.log("=== BT-IR Compiler ===");
console.log(`Input: ${absolutePath}`);
console.log("");
console.log("--- Source (TS) ---");
console.log(sourceCode);
console.log("");

// Compile
const result = compileFile(absolutePath, { debugIR, debugScopes });

// Print IR if debug
if (debugIR && result.ir) {
  console.log("--- IR ---");
  console.log(JSON.stringify(result.ir, null, 2));
  console.log("");
}

// Print output
const firstOutput = result.outputs[0];
const outputCode = firstOutput?.code ?? "";

console.log("--- Output (BT) ---");
console.log(outputCode);

// Print errors
if (result.diagnostics.length > 0) {
  console.log("");
  console.log("--- Diagnostics ---");
  const formatHost: ts.FormatDiagnosticsHost = {
    getCurrentDirectory: () => process.cwd(),
    getCanonicalFileName: (f) => f,
    getNewLine: () => "\n",
  };
  console.error(ts.formatDiagnosticsWithColorAndContext(result.diagnostics, formatHost));
}

// Write output file
if (outputFile && firstOutput) {
  const outputPath = path.resolve(outputFile);
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  fs.writeFileSync(outputPath, firstOutput.code, "utf-8");
  console.log("");
  console.log(`Written to: ${outputPath}`);
}

// Exit code
process.exit(result.success ? 0 : 1);
