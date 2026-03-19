import chalk from "chalk";
import { evalBorisScriptAsync } from "./borisscript/runner";
import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import { relative, join, resolve } from "path";
import type {
  TestCase,
  TestResult,
  TestAssertionResult,
  TestStatus,
  TestSuite,
  RunOptions,
} from "./types";

/** Converts a Windows path to POSIX format. */
function toPosixPath(p: string): string {
  return p.replace(/\\/g, "/");
}

/** Returns the POSIX-style relative path from `workdir` to `absPath`. */
function relPosix(workdir: string, absPath: string): string {
  return toPosixPath(relative(workdir, absPath));
}

/**
 * Checks whether a filter string matches the given suite or test path.
 * A filter matches if it equals the path or is a prefix followed by `/`.
 */
function filterMatches(filter: string, ...candidates: string[]): boolean {
  const f = toPosixPath(filter);
  return candidates.some((c) => f === c || f.startsWith(c + "/"));
}

function shouldRunSuite(workdir: string, suiteDirPath: string, filters: string[]): boolean {
  if (filters.length === 0) return true;
  const rel = relPosix(workdir, suiteDirPath);
  // Include suite if any filter targets it or a test within it
  return filters.some((f) => filterMatches(f, rel));
}

/**
 * Determines whether an individual test should run given the active filters.
 *
 * - Filter equals the suite name → run all tests in the suite.
 * - Filter equals the test's relative path → run that specific test.
 */
function shouldRunTest(
  workdir: string,
  testFilePath: string,
  suiteRel: string,
  filters: string[],
): boolean {
  if (filters.length === 0) return true;
  const testRel = relPosix(workdir, testFilePath);
  return filters.some((f) => {
    const n = toPosixPath(f);
    return n === suiteRel || n === testRel;
  });
}

/**
 * Scans `workdir` for directories containing `_suite.json` and returns
 * an array of discovered (non-disabled) test suites, sorted by directory name.
 */
function discoverSuites(workdir: string): TestSuite[] {
  const suites: TestSuite[] = [];

  for (const fileName of readdirSync(workdir)) {
    const dirPath = join(workdir, fileName);
    const stat = statSync(dirPath);
    if (!stat || !stat.isDirectory()) continue;

    const suiteFile = join(dirPath, "_suite.json");
    if (!existsSync(suiteFile)) continue;

    try {
      const suiteConfig = JSON.parse(readFileSync(suiteFile, "utf-8"));
      if (suiteConfig.disabled === true) continue;

      suites.push({
        dirPath,
        name: suiteConfig.name || "Unnamed Suite",
        tests: suiteConfig.tests || {},
      });
    } catch (_err) {
      console.log(
        `${chalk.bgRedBright(` ${relative(workdir, dirPath)} `)} - failed to parse _suite.json`,
      );
    }
  }

  suites.sort((a, b) => a.name.localeCompare(b.name));
  return suites;
}

/**
 * Main entry point for the test runner. Discovers suites, filters them,
 * executes all matching tests, and prints the report.
 *
 * @param filePath - Relative or absolute path to the test build directory.
 * @param cwdPath - Current working directory (used for resolving relative paths).
 * @param filters - Optional list of suite/test path filters.
 * @param options - Runner options (verbose, etc.).
 */
export async function runTestsAsync(
  filePath: string,
  cwdPath: string,
  filters: string[] = [],
  options: RunOptions = { verbose: false },
): Promise<void> {
  const testResults: TestResult[] = [];
  const workdir = resolve(cwdPath, filePath);
  const { verbose } = options;

  const startTime = new Date();
  try {
    await loadTestEnv();
  } catch (err) {
    console.error(chalk.red("Failed to load test environment:"), err);
    process.exit(1);
  }

  const allSuites = discoverSuites(workdir);

  const suites =
    filters.length === 0
      ? allSuites
      : allSuites.filter((s) => shouldRunSuite(workdir, s.dirPath, filters));

  for (let i = 0; i < suites.length; i++) {
    const suite = suites[i];
    const suiteRel = relPosix(workdir, suite.dirPath);
    const suiteResults: TestResult[] = [];

    if (i > 0) console.log();

    if (verbose) {
      console.log(chalk.bgCyanBright(` ${suite.name} `));
    }

    const testFiles = readdirSync(suite.dirPath).filter((f) => f.endsWith(".test.js"));
    for (const testFileName of testFiles) {
      const testFilePath = join(suite.dirPath, testFileName);
      if (!shouldRunTest(workdir, testFilePath, suiteRel, filters)) continue;

      const testName = suite.tests[testFileName];
      if (!testName) {
        console.log(
          chalk.bgYellowBright(` ${relative(workdir, testFilePath)} `) +
            " - skipping test not included in _suite.json",
        );
        continue;
      }

      let testFileContent = readFileSync(testFilePath, "utf-8");
      if (testFileContent.charCodeAt(0) === 0xfeff) {
        testFileContent = testFileContent.slice(1);
      }

      const testCase: TestCase = {
        filePath: relative(cwdPath, testFilePath),
        suite: suite.name,
        name: testName,
        code: testFileContent,
      };

      const testResult = await runTestAsync(testCase);
      suiteResults.push(testResult);

      if (verbose || testResult.status !== "PASSED") {
        printTestResult(testCase, testResult);
      }
    }

    testResults.push(...suiteResults);
    printSuiteStatus(suite.name, suiteResults, verbose);
  }

  printTestReport(
    suites.map((suite) => suite.name),
    startTime,
    testResults,
  );

  if (testResults.some((result) => result.status === "FAILED" || result.status === "SKIPPED")) {
    process.exit(1);
  }
}

/** Loads the BorisScript runtime, polyfills, module system, and botest asserts. */
async function loadTestEnv() {
  await evalBorisScriptAsync(`
    RegisterCodeLibrary("x-local://packages/builtin-runtime/build/polyfill.js");
    RegisterCodeLibrary("x-local://packages/builtin-runtime/build/semantic.js");
    RegisterCodeLibrary("x-local://packages/builtin-runtime/build/destructuring.js");
    RegisterCodeLibrary("x-local://packages/builtin-runtime/build/require.js");
    RegisterCodeLibrary("x-local://packages/builtin-runtime/build/cache.js");
    RegisterCodeLibrary("x-local://packages/builtin-runtime/build/filemap.js");

    bt.init_polyfill();
    bt.init_require();
    bt.init_cache();

    RegisterCodeLibrary("x-local://packages/builtin-botest/build/index.js");
    botest.init();

    bt.loadFileMap("x-local://tests/build/filemap.json");
  `);
}

/**
 * Executes a single test case in the BorisScript interpreter and parses
 * the result protocol (`TEST-RUNNER:exit:N`, `TEST-RUNNER:assert:{json}`).
 */
async function runTestAsync(testCase: TestCase): Promise<TestResult> {
  const testCode = testCase.code + "\n";

  let status: TestStatus = "SKIPPED";
  let assertion: TestAssertionResult | undefined = undefined;
  let error: any = undefined;

  let resultValue: any = null;
  let resultError: Error | null = null;

  const startTime = Date.now();
  try {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    resultValue = await evalBorisScriptAsync(testCode, testCase.filePath);
  } catch (error) {
    resultError = error as Error;
  }

  const endTime = Date.now();

  const timeMs = endTime - startTime;
  const errorStr = String((resultError as any)?.errorCode ?? (resultError as any)?.customText);

  if (errorStr === "undefined") {
    status = "SKIPPED";
    return {
      suite: testCase.suite,
      name: testCase.name,
      status: status,
      time: timeMs,
    };
  }

  if (!errorStr.startsWith("TEST-RUNNER")) {
    status = "FAILED";
    error = resultError;

    return {
      suite: testCase.suite,
      name: testCase.name,
      status: status,
      time: timeMs,
      error,
    };
  }

  const [_, command, ...args] = errorStr.split(":");
  const arg = args.join(":");

  switch (command) {
    case "exit": {
      const exitCode = parseInt(args.join(":"));
      if (exitCode === 0) {
        status = "PASSED";
      } else {
        status = "FAILED";
        error = resultError;
      }
      break;
    }
    case "assert": {
      const { message, expected, actual } = JSON.parse(arg);
      status = "FAILED";
      assertion = {
        message,
        expected,
        actual,
      };
      break;
    }
    default: {
      status = "FAILED";
      error = resultError;
      break;
    }
  }

  return {
    suite: testCase.suite,
    name: testCase.name,
    status,
    time: timeMs,
    assertion,
    error,
  };
}

/**
 * Prints a one-line suite summary after all its tests have been executed.
 *
 * In compact mode (non-verbose): prints the suite header with aggregated status.
 * In verbose mode: prints only the status line (header was already printed).
 *
 * Format examples:
 * - ` Array  ✓ 21 passed (120ms)`
 * - ` Semantic  ✗ 10 passed, 2 failed (85ms)`
 */
function printSuiteStatus(suiteName: string, results: TestResult[], verbose: boolean): void {
  const totalTime = results.reduce((sum, r) => sum + r.time, 0);
  const passed = results.filter((r) => r.status === "PASSED").length;
  const failed = results.filter((r) => r.status === "FAILED").length;
  const skipped = results.filter((r) => r.status === "SKIPPED").length;

  const timePart = chalk.blue(`${totalTime.toFixed(0)}ms`);

  const parts: string[] = [];
  if (passed > 0) parts.push(chalk.green(`${passed} passed`));
  if (failed > 0) parts.push(chalk.red(`${failed} failed`));
  if (skipped > 0) parts.push(chalk.yellow(`${skipped} skipped`));

  let icon: string;
  let nameColor: (s: string) => string;

  if (failed > 0) {
    icon = chalk.red("✗");
    nameColor = chalk.red;
  } else if (skipped > 0) {
    icon = chalk.yellow("⚠");
    nameColor = chalk.yellow;
  } else {
    icon = chalk.green("✓");
    nameColor = chalk.green;
  }

  if (verbose) {
    console.log(`${icon} ${parts.join(", ")} (${timePart})`);
  } else {
    console.log(`${nameColor(` ${suiteName} `)} ${icon} ${parts.join(", ")} (${timePart})`);
  }
}

/** Prints a single test result line with colored status and timing. */
function printTestResult(testCase: TestCase, testResult: TestResult) {
  let statusFormatted = "";
  const testNameFormatted = chalk.white(testCase.name);
  let timeFormatted = chalk.blue(`${testResult.time.toFixed(0)}ms`);

  if (testResult.status === "PASSED") {
    statusFormatted = chalk.green(testResult.status.padEnd(8));
  } else if (testResult.status === "SKIPPED") {
    statusFormatted = chalk.yellow(testResult.status.padEnd(8));
  } else {
    statusFormatted = chalk.red(testResult.status.padEnd(8));
  }

  console.log(chalk.gray(`${statusFormatted} ${testNameFormatted} (${timeFormatted})`));

  if (testResult.status === "FAILED") {
    const testAssertion = testResult.assertion;
    if (testAssertion) {
      const assertionString = [
        testAssertion.message,
        `Expected: ${testAssertion.expected}`,
        `Actual: ${testAssertion.actual}`,
      ]
        .map((line) => `  ${chalk.gray(line)}`)
        .join("\n");
      console.log(assertionString);
    }

    const testError = testResult.error;
    if (testError) {
      const errorLineNumber = getErrorLineNumber(testError);
      console.log(testError);
      console.log(`  Error in test "${testCase.name}" at line ${errorLineNumber}:`);
      outputTestCode(testCase.code, -1);
    }
  }
}

function getErrorLineNumber(error: any): number {
  const errorCustomText = (error as any)?.customText as string | undefined;

  if (errorCustomText !== undefined && errorCustomText.startsWith("JavaScript syntax error.")) {
    const errorLineMatch = errorCustomText.match(/line (\d+)/);
    const errorLineNumber: number =
      errorLineMatch && errorLineMatch[1] ? parseInt(errorLineMatch[1], 10) : -1;

    return errorLineNumber;
  } else {
    const errorLine = (error as any)?.callStack?.find(Boolean)?.sourceLineIndex as
      | number
      | undefined;

    return errorLine !== undefined ? errorLine + 1 : -1;
  }
}

function outputTestCode(code: string, contrastLineNumber: number) {
  code = code
    .split("\n")
    .map((line, index) => {
      const realLineNumber = index + 1;
      if (realLineNumber === contrastLineNumber) {
        return chalk.bgRed(`${realLineNumber.toString().padStart(4, " ")} | ${line}`);
      } else {
        return `${realLineNumber.toString().padStart(4, " ")} | ${line}`;
      }
    })
    .join("\n");

  console.log(code);
}

/** Prints the final summary report with suite/test counts and timing. */
function printTestReport(suiteNames: string[], startTime: Date, testResults: TestResult[]) {
  const totalDuration = testResults.reduce((sum, r) => sum + r.time, 0);
  const totalTestsCount = testResults.length;
  const totalSuitesCount = suiteNames.length;

  const passedTests = testResults.filter((r) => r.status === "PASSED");
  const failedTests = testResults.filter((r) => r.status === "FAILED");
  const skippedTests = testResults.filter((r) => r.status === "SKIPPED");

  const passedSuites = new Set(suiteNames);
  const failedSuites = new Set(failedTests.map((r) => r.suite));
  const skippedSuites = new Set(skippedTests.map((r) => r.suite));

  failedSuites.forEach((s) => passedSuites.delete(s));
  skippedSuites.forEach((s) => passedSuites.delete(s));

  const passedSuitesCount = passedSuites.size;
  const failedSuitesCount = failedSuites.size;
  const skippedSuitesCount = skippedSuites.size;
  const passedTestsCount = passedTests.length;
  const failedTestsCount = failedTests.length;
  const skippedTestsCount = skippedTests.length;

  const passedSuitesFormatted = chalk.green(`${passedSuitesCount} passed`);
  const failedSuitesFormatted = chalk.red(`${failedSuitesCount} failed`);
  const skippedSuitesFormatted = chalk.yellow(`${skippedSuitesCount} skipped`);
  const totalSuitesFormatted = `${totalSuitesCount}`;
  const passedTestsFormatted = chalk.green(`${passedTestsCount} passed`);
  const failedTestsFormatted = chalk.red(`${failedTestsCount} failed`);
  const skippedTestsFormatted = chalk.yellow(`${skippedTestsCount} skipped`);
  const totalTestsFormatted = `${totalTestsCount}`;

  let testFilesFormatted = "";
  let testsFormatted = "";
  const runAtFormatted = chalk.white(startTime.toISOString().replace("T", " ").substring(0, 19));
  const durationFormatted = chalk.blue(`${totalDuration.toFixed(0)}ms`);

  if (failedTestsCount === 0 && skippedTestsCount === 0) {
    testFilesFormatted = `${passedSuitesFormatted} (${totalSuitesFormatted})`;
    testsFormatted = `${passedTestsFormatted} (${totalTestsFormatted})`;
  } else {
    const suiteParts = [];
    const testParts = [];

    if (failedSuitesCount > 0) suiteParts.push(failedSuitesFormatted);
    if (skippedSuitesCount > 0) suiteParts.push(skippedSuitesFormatted);
    suiteParts.push(passedSuitesFormatted);

    if (failedTestsCount > 0) testParts.push(failedTestsFormatted);
    if (skippedTestsCount > 0) testParts.push(skippedTestsFormatted);
    testParts.push(passedTestsFormatted);

    testFilesFormatted = `${suiteParts.join(" | ")} (${totalSuitesFormatted})`;
    testsFormatted = `${testParts.join(" | ")} (${totalTestsFormatted})`;
  }

  console.log();
  console.log(chalk.gray(`  Suites:  ${testFilesFormatted}`));
  console.log(chalk.gray(`   Tests:  ${testsFormatted}`));
  console.log(chalk.gray(`  Run at:  ${runAtFormatted}`));
  console.log(chalk.gray(`Duration:  ${durationFormatted}`));
  console.log();

  if (failedTestsCount === 0 && skippedTestsCount === 0) {
    console.log(chalk.green("ALL TESTS PASSED"));
  } else {
    console.log(chalk.red("SOME TESTS FAILED"));
  }
}
