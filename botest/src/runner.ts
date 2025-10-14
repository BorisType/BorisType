import { readdirSync, readFileSync, statSync } from 'fs';
import { JsEvalCode, JsParseCode, JsGlobalEnv, FaStartApp } from './main';
import { join } from 'path';
import chalk from 'chalk';

interface TestResult {
    name: string;
    status: TestStatus;
    time: number;
}

type TestStatus = "PASSED" | "FAILED";

interface TestCase {
    name: string;
    code: string;
}

export function runTest(buildDir: string) {
    const startTime = new Date();

    const header = `╔══════════════════════════════════════════════════════════════╗
                          RUNNING TESTS                         
                     Run: ${startTime.toISOString().replace('T', ' ').substring(0, 19)}                   
╚══════════════════════════════════════════════════════════════╝`

    const files = getTestFiles(buildDir);

    console.log(files);

    console.log(header);
    console.log()
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
    // const totalTimeMs = results.flat().reduce((sum, r) => sum + r.time, 0) / 1e6;
    const totalTimeMs = 0

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

    return results;
}


function runTestFile(filePath: string): TestResult[] {
    const results: TestResult[] = [];

    extractTestsReliably(filePath).forEach((test) => {
        let fullCode: string | undefined = undefined;
        let timeNs = 0;
        let timeMs = 0;
        let status: TestStatus = "FAILED";
        let errorObj: Error | undefined = undefined;
        let errorMsg: string[] = [];

        try {
            fullCode = appendHeaderToCode(test.code);
            const startTime = Date.now();
            evalBorisScript(fullCode);
            const endTime = Date.now();
            timeMs = (endTime - startTime);
        } catch (error) {
            const errorStr = String((error as any).errorCode);

            if (errorStr.startsWith("TEST-RUNNER")) {
                const [_, command, ...args] = errorStr.split(":");
                const arg = args.join(":");

                if (command === "exit") {
                    const exitCode = parseInt(arg);
                    if (exitCode === 0) {
                        status = "PASSED";
                        // console.log(0)
                    } else {
                        status = "FAILED";
                        errorMsg.push(`Exit code: ${exitCode}`);
                        // console.log(1)
                    }
                } else if (command.startsWith("assert")) {
                    const assertData = JSON.parse(arg);

                    status = "FAILED";
                    errorMsg.push(`Assertion failed: ${assertData.message}`);
                    errorMsg.push(`Expected: ${assertData.expected}`);
                    errorMsg.push(`Actual: ${assertData.actual}`);
                    // console.log(2)
                } else {
                    status = "FAILED";
                    errorMsg.push(`Unknown TEST-RUNNER command: ${command}`);
                    // console.log(3)
                }
            } else {
                status = "FAILED";
                errorObj = error as Error;
                // console.log(4)
            }
            // console.log(5) // пока только для async методов
        }

        // console.log(timeNs)

        if (status === "PASSED") {
            console.log(`${chalk.green("PASSED")}: ${test.name} (${chalk.yellow(timeMs.toFixed(0) + "ms")})`);
        } else {
            console.log(`${chalk.red("FAILED")}: ${test.name} (${chalk.yellow(timeMs.toFixed(0) + "ms")})`);
            if (errorMsg.length > 0) {
                console.log(chalk.gray(`        ${errorMsg.join("\n        ")}`));
            } else {
                console.error(errorObj);
                if (errorObj !== undefined && ((errorObj as any).customText as string).startsWith("JavaScript syntax error.")) {
                    // const debugCode = fullCode?.split('\n')
                    //     .map((line, index) => `${(index + 1).toString().padStart(4, ' ')} | ${line}`)
                    //     .join('\n') || ''
                    // console.log(debugCode);
                }
            }
            // const debugCode = fullCode?.split('\n')
            //             .map((line, index) => `${(index + 1).toString().padStart(4, ' ')} | ${line}`)
            //             .join('\n') || ''
            // console.log(debugCode);
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
    const header = `
    function assertValueEquals(actual, expected, message) {
        if (message === undefined) message = "";

        if (actual !== expected) {
            throw "TEST-RUNNER:assertValueEquals:" + EncodeJson({ "actual": actual, "expected": expected, "message": message });
        }
    }

    function assertJsArrayEquals(actual, expected, message) {
        if (message === undefined) message = "";
        if (ArrayCount(actual) !== ArrayCount(expected)) {
            throw "TEST-RUNNER:assertJsArrayEquals:" + EncodeJson({ "actual": EncodeJson(actual), "expected": EncodeJson(expected), "message": message });
        }
        // for (var i = 0; i < ArrayCount(actual); i++) {
        //     if (actual[i] !== expected[i]) {
        //         throw "TEST-RUNNER:assertJsArrayEquals:" + EncodeJson({ "actual": EncodeJson(actual), "expected": EncodeJson(expected), "message": message });
        //     }
        // }
        if (EncodeJson(actual) !== EncodeJson(expected)) {
            throw "TEST-RUNNER:assertJsArrayEquals:" + EncodeJson({ "actual": EncodeJson(actual), "expected": EncodeJson(expected), "message": message });
        }
    }

    function assertJsObjectEquals(actual, expected, message) {
        if (message === undefined) message = "";

        if (EncodeJson(actual) === EncodeJson(expected)) {
            return;
        }

        throw "TEST-RUNNER:assertJsObjectEquals:" + EncodeJson({ "actual": EncodeJson(actual), "expected": EncodeJson(expected), "message": message });
    }
    `;

    const footer = `
    throw "TEST-RUNNER:exit:0";`;
    return header + code + footer;
}

function evalBorisScript(code: string) {
    return JsEvalCode(JsParseCode(code), JsGlobalEnv());
}

export function extractTestsReliably(filePath: string): TestCase[] {
    const fs = require('fs');
    const content = fs.readFileSync(filePath, 'utf-8');

    const tests: TestCase[] = [];
    const nonTestContent = extractNonTestContent(content);

    let pos = nonTestContent.length;

    while (pos < content.length) {
        // Ищем 'test('
        if (content.substr(pos, 5) === 'test(') {
            pos += 5;

            // Пропускаем пробелы
            while (pos < content.length && /\s/.test(content[pos])) pos++;

            // Ищем кавычки
            if (content[pos] === '"' || content[pos] === "'") {
                const quoteChar = content[pos];
                pos++;

                // Извлекаем имя теста
                let testName = '';
                while (pos < content.length && content[pos] !== quoteChar) {
                    testName += content[pos];
                    pos++;
                }
                pos++; // Пропускаем закрывающую кавычку

                // Ищем function
                while (pos < content.length && content.substr(pos, 8) !== 'function') pos++;
                if (pos >= content.length) break;

                pos += 8;

                // Ищем {
                while (pos < content.length && content[pos] !== '{') pos++;
                if (pos >= content.length) break;

                const braceStart = pos;
                pos++;

                // Парсим тело функции
                let braceCount = 1;
                let testBody = '';

                while (braceCount > 0 && pos < content.length) {
                    const char = content[pos];
                    if (char === '{') braceCount++;
                    if (char === '}') braceCount--;

                    if (braceCount > 0) {
                        testBody += char;
                    }
                    pos++;
                }

                tests.push({
                    name: testName,
                    code: `${nonTestContent}\n${testBody.trim()}`
                });
            }
        } else {
            pos++;
        }
    }

    return tests;
}

function extractNonTestContent(content: string): string {
    const firstTest = content.indexOf('test(');
    if (firstTest === -1) return content.trim();

    return content.substring(0, firstTest).trim();
}