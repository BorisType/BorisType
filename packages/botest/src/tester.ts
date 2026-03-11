import chalk from "chalk";
import { TestCase } from "./parser";
import { evalBorisScriptAsync } from "./borisscript/runner";
import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import { relative, join, resolve } from "path";

interface TestResult {
  suite: string;
  name: string;
  status: TestStatus;
  time: number;
  assertion?: TestAssertionResult;
  error?: any;
}

interface TestAssertionResult {
  message: string;
  expected: string;
  actual: string;
}

type TestStatus = "PASSED" | "FAILED" | "SKIPPED";

function toPosixPath(p: string): string {
  return p.replace(/\\/g, "/");
}

function shouldRunSuite(workdir: string, suiteDirPath: string, filters: string[]): boolean {
  if (filters.length === 0) return true;
  const rel = toPosixPath(relative(workdir, suiteDirPath));
  return filters.some((f) => {
    const n = toPosixPath(f);
    return n === rel || n.startsWith(rel + "/");
  });
}

function shouldRunTest(
  workdir: string,
  testFilePath: string,
  suiteRel: string,
  filters: string[],
): boolean {
  if (filters.length === 0) return true;
  const testRel = toPosixPath(relative(workdir, testFilePath));
  return filters.some((f) => {
    const n = toPosixPath(f);
    return n === suiteRel || n === testRel || n.startsWith(suiteRel + "/");
  });
}

export async function runTestsAsync(
  filePath: string,
  cwdPath: string,
  filters: string[] = [],
): Promise<void> {
  const testResults: TestResult[] = [];
  const workdir = resolve(cwdPath, filePath);

  const startTime = new Date();
  try {
    await loadTestEnv();
  } catch (err) {
    console.error(err);
  }

  type TestSuite = {
    dirPath: string;
    name: string;
    tests: { [key: string]: string };
  };
  const allSuites = [] as TestSuite[];
  readdirSync(workdir).forEach((fileName) => {
    const filePathFull = join(workdir, fileName);
    const stat = statSync(filePathFull);
    if (stat && stat.isDirectory()) {
      const suiteFile = join(filePathFull, "_suite.json");
      const suiteStat = existsSync(suiteFile) ? statSync(suiteFile) : null;
      if (suiteStat && suiteStat.isFile()) {
        try {
          const suiteConfig = JSON.parse(readFileSync(suiteFile, "utf-8"));
          const suiteName: string = suiteConfig.name || "Unnamed Suite";
          const suiteTests: { [key: string]: string } = suiteConfig.tests || {};

          if (suiteConfig.disabled !== true) {
            allSuites.push({
              dirPath: filePathFull,
              name: suiteName,
              tests: suiteTests,
            });
          }
        } catch (_err) {
          console.log(
            `${chalk.bgRedBright(` ${relative(workdir, filePathFull)} `)} - failed to parse _suite.json`,
          );
        }
      }
    }
  });

  const suites =
    filters.length === 0
      ? allSuites
      : allSuites.filter((s) => shouldRunSuite(workdir, s.dirPath, filters));

  let firstSuite = false;
  for (const suite of suites) {
    const suiteRel = toPosixPath(relative(workdir, suite.dirPath));

    if (!firstSuite) {
      firstSuite = true;
    } else {
      console.log();
    }

    console.log(chalk.bgCyanBright(` ${suite.name} `));
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
      printTestResult(testCase, testResult);
      testResults.push(testResult);
    }
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

function printTestReport(files: string[], startTime: Date, testResults: TestResult[]) {
  const totalDuration = testResults.reduce((sum, r) => sum + r.time, 0);
  const totalTestsCount = testResults.length;
  const totalFilesCount = files.length;

  const passedTests = testResults.filter((r) => r.status === "PASSED");
  const failedTests = testResults.filter((r) => r.status === "FAILED");
  const skippedTests = testResults.filter((r) => r.status === "SKIPPED");

  const passedSuites = new Set(files);
  const failedSuites = new Set(failedTests.map((r) => r.suite));
  const skippedSuites = new Set(skippedTests.map((r) => r.suite));

  failedSuites.forEach((file) => passedSuites.delete(file));
  skippedSuites.forEach((file) => passedSuites.delete(file));

  const passedSuitesCount = passedSuites.size;
  const failedSuitesCount = failedSuites.size;
  const skippedSuitesCount = skippedSuites.size;
  const passedTestsCount = passedTests.length;
  const failedTestsCount = failedTests.length;
  const skippedTestsCount = skippedTests.length;

  const passedSuitesFormatted = chalk.green(`${passedSuitesCount} passed`);
  const failedSuitesFormatted = chalk.red(`${failedSuitesCount} failed`);
  const skippedSuitesFormatted = chalk.yellow(`${skippedSuitesCount} skipped`);
  const totalFilesFormatted = `${totalFilesCount}`;
  const passedTestsFormatted = chalk.green(`${passedTestsCount} passed`);
  const failedTestsFormatted = chalk.red(`${failedTestsCount} failed`);
  const skippedTestsFormatted = chalk.yellow(`${skippedTestsCount} skipped`);
  const totalTestsFormatted = `${totalTestsCount}`;

  let testFilesFormatted = "";
  let testsFormatted = "";
  const runAtFormatted = chalk.white(startTime.toISOString().replace("T", " ").substring(0, 19));
  const durationFormatted = chalk.blue(`${totalDuration.toFixed(0)}ms`);

  if (failedTestsCount === 0 && skippedTestsCount === 0) {
    testFilesFormatted = `${passedSuitesFormatted} (${totalFilesFormatted})`;
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

    testFilesFormatted = `${suiteParts.join(" | ")} (${totalFilesFormatted})`;
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
