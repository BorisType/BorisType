/**
 * Node.js test runner — executes `.test.ts` source files in Node.js
 * via tsx to validate that test logic is correct independently of BorisScript.
 */

import { execFileSync } from "child_process";
import { existsSync } from "fs";
import { resolve, dirname } from "path";

/** Result of running a test in Node.js. */
export interface NodeCheckResult {
  status: "NODE_PASSED" | "NODE_FAILED" | "NODE_SKIPPED";
  error?: string;
  time: number;
}

const shimPath = resolve(__dirname, "node-shim.js");

/**
 * Resolves the tsx CLI entry point (`dist/cli.mjs`) from botest's dependency tree.
 * Running `node <tsx-cli> --require <shim> <file>` is equivalent to `npx tsx ...`
 * but doesn't depend on `npx` resolution or `.bin` shims.
 */
function resolveTsxCli(): string {
  const tsxPkgPath = require.resolve("tsx/package.json");
  return resolve(dirname(tsxPkgPath), "dist", "cli.mjs");
}

/**
 * Checks that the `tsx` package is available for Node.js test execution.
 * tsx is required to run `.ts` test files directly in Node.
 */
export function checkTsxAvailable(): boolean {
  try {
    require.resolve("tsx/package.json");
    return true;
  } catch {
    return false;
  }
}

/**
 * Runs a single `.test.ts` file in Node.js via tsx.
 *
 * The test is executed in a subprocess:
 * - tsx CLI handles TypeScript compilation on the fly
 * - `--require node-shim.js` provides the `botest` global + `alert()` stub
 *
 * @param testSourcePath - Absolute path to the `.test.ts` source file.
 * @param timeout - Maximum execution time in ms (default: 30000).
 */
export function runTestInNode(testSourcePath: string, timeout = 30000): NodeCheckResult {
  if (!existsSync(testSourcePath)) {
    return { status: "NODE_SKIPPED", error: "Source file not found", time: 0 };
  }

  const tsxCli = resolveTsxCli();
  const startTime = Date.now();
  try {
    execFileSync(process.execPath, [tsxCli, "--require", shimPath, testSourcePath], {
      timeout,
      stdio: "pipe",
      cwd: process.cwd(),
    });
    return { status: "NODE_PASSED", time: Date.now() - startTime };
  } catch (err: any) {
    const time = Date.now() - startTime;
    if (err.killed) {
      return { status: "NODE_FAILED", error: `Timeout (${timeout}ms)`, time };
    }
    const stderr = err.stderr?.toString().trim() || "";
    return { status: "NODE_FAILED", error: stderr || err.message, time };
  }
}
