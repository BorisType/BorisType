export interface TestCase {
    name: string;
    code: string;
}

type TestExtracted = {
    name: string;
    start: number;
    end: number;
}

function parseTests(content: string): TestExtracted[] {
    const tests: TestExtracted[] = [];

    const firstTest = content.indexOf('test(');
    if (firstTest === -1) return tests;

    let pos = firstTest;

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
                pos++;

                // Парсим тело функции
                let braceCount = 1;
                // let testBody = '';
                let testBodyStart = pos;
                let testBodyEnd = pos;

                while (braceCount > 0 && pos < content.length) {
                    const char = content[pos];
                    if (char === '{') braceCount++;
                    if (char === '}') braceCount--;

                    if (braceCount > 0) {
                        // testBody += char;
                        testBodyEnd++;
                    }
                    pos++;
                }

                if (content[testBodyStart] === '\n') testBodyStart++; // Убираем первую пустую строку, если она есть
                if (testBodyEnd > 0 && content[testBodyEnd - 1] === '\n') testBodyEnd--; // Убираем последнюю пустую строку, если она есть

                tests.push({
                    name: testName,
                    start: testBodyStart,
                    end: testBodyEnd,
                });
            }
        } else {
            pos++;
        }
    }

    return tests;
}

function getTextFromExtractedTest(content: string, test: TestExtracted): string {
    const raw = content.substring(test.start, test.end);
    // Убираем общий отступ (так как первый символ это \n, то отступ будет на единицу меньше, но такой вариант не очень надежен)
    const indentOfFirstLine = (raw.match(/^\s*/)?.[0] || ' ').length;
    const lines = raw.split('\n').map(line => line.substring(indentOfFirstLine));
    return lines.join('\n');
}
// function joinNonTestContent(content, tests: TestExtracted[]): string {

// }

export function extractTestsFromFile(filePath: string): TestCase[] {
    const fs = require('fs');
    const content = fs.readFileSync(filePath, 'utf-8');
    const extracted = parseTests(content);
    const nonTestContent = extractNonTestContent(content);
    return extracted.map(test => {
        const code = getTextFromExtractedTest(content, test);
        const fullCode = nonTestContent + '\n' + code;

        return { name: test.name, code: fullCode };
    });
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
                    code: `${nonTestContent}\n${testBody}`
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