import {
  convertSemverToWsVersion,
  convertSemverRangeToWsRange,
  compareWsVersions,
  isValidWsVersion,
  isValidWsRange,
} from "./index.js";

// Тестовые примеры
const testCases = [
  // Обычные версии
  { input: "1.0.0", expected: "1.0.0.9999" },
  { input: "2.5.3", expected: "2.5.3.9999" },
  { input: "0.1.2", expected: "0.1.2.9999" },

  // С prerelease
  { input: "1.0.0-alpha", expected: "1.0.0.1000" },
  { input: "1.0.0-alpha.1", expected: "1.0.0.1001" },
  { input: "1.0.0-alpha.2", expected: "1.0.0.1002" },
  { input: "1.0.0-beta", expected: "1.0.0.2000" },
  { input: "1.0.0-beta.1", expected: "1.0.0.2001" },
  { input: "1.0.0-rc.1", expected: "1.0.0.3001" },
  { input: "1.0.0-1", expected: "1.0.0.5001" },
];

console.log("🧪 Тестирование convertSemverToWsVersion:");
console.log("=".repeat(50));

let passedTests = 0;

testCases.forEach((testCase, index) => {
  try {
    const result = convertSemverToWsVersion(testCase.input);
    const passed = result === testCase.expected;

    console.log(`${index + 1}. ${testCase.input} → ${result} ${passed ? "✅" : "❌"}`);

    if (!passed) {
      console.log(`   Ожидалось: ${testCase.expected}`);
    }

    if (passed) passedTests++;
  } catch (error) {
    console.log(`${index + 1}. ${testCase.input} → ERROR: ${error.message} ❌`);
  }
});

console.log("\n📊 Результаты тестов:");
console.log(`Прошло: ${passedTests}/${testCases.length}`);

// Тест сравнения версий
console.log("\n🔄 Тестирование порядка версий:");
console.log("=".repeat(50));

const versions = [
  "1.0.0-alpha.1",
  "1.0.0-alpha.2",
  "1.0.0-beta.1",
  "1.0.0-rc.1",
  "1.0.0",
  "1.0.1",
  "1.1.0",
  "2.0.0",
];

const wsVersions = versions.map((v) => ({
  semver: v,
  ws: convertSemverToWsVersion(v),
}));

console.log("Исходный порядок (semver):");
wsVersions.forEach((v) => console.log(`  ${v.semver} → ${v.ws}`));

// Сортируем ws-версии
wsVersions.sort((a, b) => compareWsVersions(a.ws, b.ws));

console.log("\nПорядок после сортировки ws-версий (теперь правильный):");
wsVersions.forEach((v) => console.log(`  ${v.semver} → ${v.ws}`));

// Проверка валидации
console.log("\n✅ Тестирование валидации ws-версий:");
console.log("=".repeat(50));

const validationTests = [
  { version: "1.0.0", expected: true },
  { version: "1.0.0.0", expected: true },
  { version: "2.5.3.123", expected: true },
  { version: "0.01.002", expected: true },
  { version: "1.0", expected: false },
  { version: "1.0.0.0.0", expected: false },
  { version: "1.a.0", expected: false },
];

validationTests.forEach((test) => {
  const result = isValidWsVersion(test.version);
  const passed = result === test.expected;
  console.log(`${test.version} → ${result} ${passed ? "✅" : "❌"}`);
});

// Тест преобразования промежутков версий
console.log("\n🎯 Тестирование convertSemverRangeToWsRange:");
console.log("=".repeat(50));

const rangeTests = [
  { input: "1.2.3", expected: "1.2.3.9999" },
  { input: "^1.2.3", expected: "^1.2.3.9999" },
  { input: "~1.2.3", expected: "^1.2.3.9999" },
  { input: "*", expected: "^0.0.0.0" },
  { input: "^1.0.0-alpha.1", expected: "^1.0.0.1001" },
  { input: "~2.1.0-beta.5", expected: "^2.1.0.2005" },
];

let passedRangeTests = 0;

rangeTests.forEach((testCase, index) => {
  try {
    const result = convertSemverRangeToWsRange(testCase.input);
    const passed = result === testCase.expected;

    console.log(
      `${index + 1}. ${testCase.input.padEnd(20)} → ${result.padEnd(15)} ${passed ? "✅" : "❌"}`,
    );

    if (!passed) {
      console.log(`   Ожидалось: ${testCase.expected}`);
    }

    if (passed) passedRangeTests++;
  } catch (error) {
    console.log(`${index + 1}. ${testCase.input.padEnd(20)} → ERROR: ${error.message} ❌`);
  }
});

console.log(`\nПрошло промежутков: ${passedRangeTests}/${rangeTests.length}`);

// Тест валидации ws-промежутков
console.log("\n✅ Тестирование валидации ws-промежутков:");
console.log("=".repeat(50));

const wsRangeValidationTests = [
  { range: "1.0.0.0", expected: true },
  { range: "^1.0.0.0", expected: true },
  { range: "^0.0.0.0", expected: true },
  { range: "^1.0", expected: false },
  { range: "^1.a.0.0", expected: false },
  { range: "~1.0.0.0", expected: false }, // ~ не поддерживается в ws-формате
];

wsRangeValidationTests.forEach((test) => {
  const result = isValidWsRange(test.range);
  const passed = result === test.expected;
  console.log(`${test.range.padEnd(15)} → ${result} ${passed ? "✅" : "❌"}`);
});

console.log("\n🎉 Тестирование завершено!");
