import { readdirSync, readFileSync, statSync } from 'fs';
import { JsEvalCode, JsParseCode, JsGlobalEnv, FaStartApp, JsEvalCodeAsyncExt } from './main';
import path, { join } from 'path';
import chalk from 'chalk';
import { extractTestsFromFile, extractTestsReliably, TestCase } from './parser';

interface TestResult {
    name: string;
    status: TestStatus;
    time: number;
}

type TestStatus = "PASSED" | "FAILED";

export function runTest(buildDir: string) {
    const startTime = new Date();

    const header = `╔══════════════════════════════════════════════════════════════╗
                          RUNNING TESTS                         
                     Run: ${startTime.toISOString().replace('T', ' ').substring(0, 19)}                   
╚══════════════════════════════════════════════════════════════╝`

    const files = getTestFiles(buildDir);

    console.log(files);

    console.log(header);
    console.log();
    const results = files.map((file) => {
        const relativeFilePath = file.replace(buildDir, '').substring(1);

        console.log(`Running Test File: ${relativeFilePath}\n`);
        const testResults = runTestFile(file);
        console.log(`\nFinished Test File: ${relativeFilePath}`);
        return testResults;
    });

    const totalPassed = results.flat().filter(r => r.status === "PASSED").length;
    const totalFailed = results.flat().filter(r => r.status === "FAILED").length;
    const totalTests = totalPassed + totalFailed;

    const successRate = totalTests === 0 ? 0 : (totalPassed / totalTests) * 100;
    const totalTimeMs = results.flat().reduce((sum, r) => sum + r.time, 0);

    const footer = `
╔══════════════════════════════════════════════════════════════╗
  SUMMARY:
  ${chalk.green(`Passed: ${totalPassed}`)}
  ${chalk.red(`Failed: ${totalFailed}`)}
  ${chalk.gray(`Total: ${totalTests}`)}
  ${chalk.blue(`Success Rate: ${successRate.toFixed(0)}%`)}
  ${chalk.magenta(`Time: ${totalTimeMs.toFixed(0)}ms`)}
╚══════════════════════════════════════════════════════════════╝`;
    console.log(footer);
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

function outputTestCode(testCase: TestCase, fullCode: string, contrastLineNumber?: number) {
    const testCodeLineCount = testCase.code.split('\n').length;
    const fullCodeLineCount = fullCode.split('\n').length - 1; // -1 : в конце добавлен главный выход
    const delta = fullCodeLineCount - testCodeLineCount;

    const debugCode = testCase.code.split('\n')
        .map((line, index) => {
            const realLineNumber = index + 1 + delta;
            if (realLineNumber === contrastLineNumber) {
                return chalk.bgRed(`${realLineNumber.toString().padStart(4, ' ')} | ${line}`);
            } else {
                return `${realLineNumber.toString().padStart(4, ' ')} | ${line}`;
            }
        })
        .join('\n');
    console.log(debugCode);
}


function runTestFile(filePath: string): TestResult[] {
    const results: TestResult[] = [];

    extractTestsFromFile(filePath).forEach((test) => {
        let status: TestStatus = "FAILED";
        let errorObj: Error | undefined = undefined;

        const fullCode = appendHeaderToCode(test.code);
        const startTime = Date.now();
        try {
            evalBorisScript(fullCode);
        } catch (error) {
            errorObj = error as Error;
        }
        const endTime = Date.now();
        const timeMs = (endTime - startTime);

        const errorStr = String((errorObj as any).errorCode);
        const errorMsg: string[] = [];

        if (errorStr.startsWith("TEST-RUNNER")) {
            const [_, command, ...args] = errorStr.split(":");
            const arg = args.join(":");

            if (command === "exit") {
                const exitCode = parseInt(arg);
                if (exitCode === 0) {
                    status = "PASSED";
                } else {
                    status = "FAILED";
                    errorMsg.push(`Exit code: ${exitCode}`);
                }
            } else if (command.startsWith("assert")) {
                const assertData = JSON.parse(arg);

                status = "FAILED";
                errorMsg.push(`Assertion failed: ${assertData.message}`);
                errorMsg.push(`Expected: ${assertData.expected}`);
                errorMsg.push(`Actual: ${assertData.actual}`);
            } else {
                status = "FAILED";
                errorMsg.push(`Unknown TEST-RUNNER command: ${command}`);
            }
        } else {
            status = "FAILED";
            // errorMsg.push(errorStr);
        }

        if (status === "PASSED") {
            console.log(`${chalk.green("PASSED")}: ${test.name} (${chalk.yellow(timeMs.toFixed(0) + "ms")})`);
        } else {
            console.log(`${chalk.red("FAILED")}: ${test.name} (${chalk.yellow(timeMs.toFixed(0) + "ms")})`);
            if (errorMsg.length > 0) {
                console.log(chalk.gray(`        ${errorMsg.join("\n        ")}`));
            } else {
                console.error(errorObj);
                // console.log(`>>${fullCode}<<`);

                // for 'JavaScript syntax error'
                const errorCustomText = (errorObj as any)?.customText as string | undefined;

                if (errorCustomText !== undefined && errorCustomText.startsWith("JavaScript syntax error.")) {
                    const errorLineMatch = errorCustomText.match(/line (\d+)/);
                    const errorLineNumber: number = errorLineMatch && errorLineMatch[1] ? parseInt(errorLineMatch[1], 10) : -1;

                    outputTestCode(test, fullCode, errorLineNumber);
                } else {
                    // for any other errors
                    const errorLine = (errorObj as any)?.callStack?.find(Boolean)?.sourceLineIndex ?? -1 as number;
                    outputTestCode(test, fullCode, errorLine + 1); // +1 потому что ХЗ
                }
            }
        }

        results.push({
            name: test.name,
            status: status,
            time: timeMs
        });
    });

    return results;
}

function appendHeaderToCode(code: string) {
    const header = readFileSync(path.resolve(__dirname, '../resources/test.bs'), 'utf-8') + '\n';

    const footer = `\nthrow "TEST-RUNNER:exit:0";`;
    return header + code + footer;
}


type JsEvalReturnValue = {
    err: any;
    retVal: any;
};

export async function evalBorisScriptAsync(code: string): Promise<any> {
    return new Promise((resolve, reject) => {
        JsEvalCodeAsyncExt(JsParseCode(code), JsGlobalEnv(), undefined, (result: JsEvalReturnValue) => {
            if (result.err) {
                reject(result.err);
            } else {
                resolve(result.retVal);
            }
        });
    });
}

function evalBorisScript(code: string) {
    return JsEvalCode(JsParseCode(code), JsGlobalEnv());
}