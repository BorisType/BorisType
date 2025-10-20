import chalk, { Chalk } from 'chalk';
import { extractTestsFromFile, TestCase } from './parser';
import { evalBorisScriptAsync } from "./borisscript/runner";
import { readdirSync, statSync } from 'fs';
import path, { join } from 'path';


interface TestResult {
    file: string;
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


export async function runTestsAsync(filePath: string): Promise<void> {
    const testResults: TestResult[] = [];

    const startTime = new Date();

    const files = getTestFiles(filePath);
    for (const file of files) {
        const relativeFilePath = path.relative(filePath, file);

        console.log(chalk.bgCyanBright(` ./${relativeFilePath} `));
        const results = await runTestFileAsync(file);
        testResults.push(...results);
        console.log();
    }

    printTestReport(files, startTime, testResults);

    if (testResults.some(result => result.status === "FAILED")) {
        process.exit(1);
    }
}

function getTestFiles(dir: string): string[] {
    let results: string[] = [];

    readdirSync(dir).forEach((file) => {
        const filePath = join(dir, file);
        const stat = statSync(filePath);
        if (stat && stat.isDirectory()) {
            results = results.concat(getTestFiles(filePath));
        } else {
            results.push(filePath);
        }
    });

    return results.filter(f => f.endsWith('.test.js'));
}

async function runTestFileAsync(filePath: string): Promise<TestResult[]> {
    const testResults: TestResult[] = [];
    const testCases = extractTestsFromFile(filePath);

    for (const testCase of testCases) {
        const testResult = await runTestAsync(testCase);
        printTestResult(testCase, testResult);
        testResults.push(testResult);
    }

    return testResults;
}

async function runTestAsync(testCase: TestCase): Promise<TestResult> {
    const testCode = testCase.code + `\nthrow "TEST-RUNNER:exit:0";`;

    let status: TestStatus = "SKIPPED";
    let assertion: TestAssertionResult | undefined = undefined;
    let error: any = undefined;

    let resultValue: any = null;
    let resultError: Error | null = null;

    const startTime = Date.now();
    try {
        resultValue = await evalBorisScriptAsync(testCode);
    } catch (error) {
        resultError = error as Error;
    }

    const endTime = Date.now();

    const timeMs = endTime - startTime;
    const errorStr = String((resultError as any)?.errorCode);

    if (!errorStr.startsWith("TEST-RUNNER")) {
        status = "FAILED";
        error = resultError

        return {
            file: testCase.file,
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
                error = resultError
            }
            break;
        }
        case "assert": {
            const {message, expected, actual} = JSON.parse(arg);
            status = "FAILED";
            assertion = {
                message,
                expected,
                actual
            };
            break;
        }
        default: {
            status = "FAILED";
            error = resultError
            break;
        }
    }

    return {
        file: testCase.file,
        name: testCase.name,
        status,
        time: timeMs,
        assertion,
        error
    };
}

function printTestResult(testCase: TestCase, testReuslt: TestResult) {
    let statusFormatted = '';
    const testNameFormatted = chalk.white(testCase.name);
    let timeFormatted = chalk.blue(`${testReuslt.time.toFixed(0)}ms`);

    if (testReuslt.status === "PASSED") {
        statusFormatted = chalk.green(testReuslt.status);
    } else if (testReuslt.status === "SKIPPED") {
        statusFormatted = chalk.yellow(testReuslt.status);
    } else {
        statusFormatted = chalk.red(testReuslt.status);
    }

    console.log(chalk.gray(`${statusFormatted}: ${testNameFormatted} (${timeFormatted})`));

    if (testReuslt.status === "FAILED") {
        const testAssertion = testReuslt.assertion;
        if (testAssertion) {
            const assertionString = [
                testAssertion.message,
                `Expected: ${testAssertion.expected}`,
                `Actual: ${testAssertion.actual}`
            ].map((line) => `  ${chalk.gray(line)}`).join('\n');
            console.log(assertionString)
        }

        const testError = testReuslt.error;
        if (testError) {
            const errorLineNumber = getErrorLineNumber(testError);
            console.log(testError);
            console.log(`  Error in test "${testCase.name}" at line ${errorLineNumber}:`);
            outputTestCode(testCase.code, errorLineNumber);
        }
    }
}

function getErrorLineNumber(error: any): number {
    const errorCustomText = (error as any)?.customText as string | undefined;

    if (errorCustomText !== undefined && errorCustomText.startsWith("JavaScript syntax error.")) {
        const errorLineMatch = errorCustomText.match(/line (\d+)/);
        const errorLineNumber: number = errorLineMatch && errorLineMatch[1] ? parseInt(errorLineMatch[1], 10) : -1;

        return errorLineNumber;
    } else {
        const errorLine = (error as any)?.callStack?.find(Boolean)?.sourceLineIndex as number | undefined;

        return errorLine !== undefined ? errorLine + 1 : -1;
    }
}

function outputTestCode(code: string, contrastLineNumber: number) {
    code = code.split('\n')
        .map((line, index) => {
            const realLineNumber = index + 1;
            if (realLineNumber === contrastLineNumber) {
                return chalk.bgRed(`${realLineNumber.toString().padStart(4, ' ')} | ${line}`);
            } else {
                return `${realLineNumber.toString().padStart(4, ' ')} | ${line}`;
            }
        })
        .join('\n');

    console.log(code);
}

function printTestReport(files: string[], startTime: Date, testResults: TestResult[]) {
    const totalDuration = testResults.reduce((sum, r) => sum + r.time, 0);
    const totalTestsCount = testResults.length;
    const totalFilesCount = files.length;

    const passedTests = testResults.filter(r => r.status === "PASSED");
    const failedTests = testResults.filter(r => r.status === "FAILED");

    const passedFiles = new Set(files);
    const failedFiles = new Set(failedTests.map(r => r.file));

    failedFiles.forEach(file => passedFiles.delete(file));

    const passedFilesCount = passedFiles.size;
    const failedFilesCount = failedFiles.size;
    const passedTestsCount = passedTests.length;
    const failedTestsCount = failedTests.length;

    const passedFilesFormatted = chalk.green(`${passedFilesCount} passed`);
    const failedFilesFormatted = chalk.red(`${failedFilesCount} failed`);
    const totalFilesFormatted = `${totalFilesCount}`;
    const passedTestsFormatted = chalk.green(`${passedTestsCount} passed`);
    const failedTestsFormatted = chalk.red(`${failedTestsCount} failed`);
    const totalTestsFormatted = `${totalTestsCount}`;

    let testFilesFormatted = '';
    let testsFormatted = '';
    const runAtFormatted = chalk.white(startTime.toISOString().replace('T', ' ').substring(0, 19));
    const durationFormatted = chalk.blue(`${totalDuration.toFixed(0)}ms`);

    if (failedTestsCount === 0) {
        testFilesFormatted = `${passedFilesFormatted} (${totalFilesFormatted})`;
        testsFormatted = `${passedTestsFormatted} (${totalTestsFormatted})`;
    } else {
        testFilesFormatted = `${failedFilesFormatted} | ${passedFilesFormatted} (${totalFilesFormatted})`;
        testsFormatted = `${failedTestsFormatted} | ${passedTestsFormatted} (${totalTestsFormatted})`;
    }

    console.log(chalk.gray(`Test Files:  ${testFilesFormatted}`));
    console.log(chalk.gray(`     Tests:  ${testsFormatted}`));
    console.log(chalk.gray(`    Run at:  ${runAtFormatted}`));
    console.log(chalk.gray(`  Duration:  ${durationFormatted}`));
    console.log();

    if (failedTestsCount === 0) {
        console.log(chalk.green("ALL TESTS PASSED"));
    } else {
        console.log(chalk.red("SOME TESTS FAILED"));
    }
}