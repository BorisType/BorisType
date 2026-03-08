import {
  convertSemverToWsVersion,
  convertSemverRangeToWsRange,
  compareWsVersions,
  isValidWsVersion,
  isValidWsRange,
} from "./index.js";

console.log("🚀 Пример использования ws-version модуля");
console.log("=".repeat(50));

// Примеры преобразования
const examples = [
  "1.0.0",
  "2.1.3-alpha.1",
  "1.5.0-beta.2",
  "3.0.0-rc.1",
  "1.2.3+build.456", // Метадата билда будет проигнорирована
];

console.log("📝 Преобразование версий:");
examples.forEach((version) => {
  try {
    const wsVersion = convertSemverToWsVersion(version);
    console.log(`  ${version.padEnd(20)} → ${wsVersion}`);
  } catch (error) {
    console.log(`  ${version.padEnd(20)} → ERROR: ${error.message}`);
  }
});

// Сравнение версий
console.log("\n🔄 Сравнение ws-версий:");
const comparisons = [
  ["1.0.0.0", "1.0.0.1000"], // Обычная vs alpha
  ["1.0.0.1000", "1.0.0.2000"], // Alpha vs beta
  ["1.0.0.2001", "1.0.0.3001"], // Beta.1 vs rc.1
  ["1.0.0.3001", "1.0.1.0"], // RC vs новая версия
];

comparisons.forEach(([v1, v2]) => {
  const result = compareWsVersions(v1, v2);
  const symbol = result === -1 ? "<" : result === 1 ? ">" : "=";
  console.log(`  ${v1} ${symbol} ${v2}`);
});

// Валидация
console.log("\n✅ Проверка валидности:");
const validationExamples = [
  "1.0.0", // Валидна
  "1.0.0.0", // Валидна
  "0.01.002", // Валидна (с лидирующими нулями)
  "1.0", // Невалидна (мало компонентов)
  "1.0.0.0.0", // Невалидна (много компонентов)
  "1.a.0", // Невалидна (буква в компоненте)
];

validationExamples.forEach((version) => {
  const isValid = isValidWsVersion(version);
  console.log(`  ${version.padEnd(15)} → ${isValid ? "✅ валидна" : "❌ невалидна"}`);
});

console.log("\n🎯 Практический пример:");
console.log(
  "Допустим у нас есть массив semver версий, которые нужно преобразовать и отсортировать:",
);

const semverVersions = [
  "1.0.0",
  "1.0.0-alpha.1",
  "1.0.0-alpha.2",
  "1.0.0-beta.1",
  "1.0.0-rc.1",
  "1.0.1",
  "1.1.0",
  "2.0.0-alpha.1",
];

const converted = semverVersions.map((sv) => ({
  semver: sv,
  ws: convertSemverToWsVersion(sv),
}));

// Сортируем по ws-версиям
converted.sort((a, b) => compareWsVersions(a.ws, b.ws));

console.log("\nОтсортированный список:");
converted.forEach((item, index) => {
  console.log(`  ${(index + 1).toString().padStart(2)}. ${item.semver.padEnd(20)} → ${item.ws}`);
});

// Пример работы с промежутками версий
console.log("\n🎯 Работа с промежутками версий:");
console.log("Преобразование semver range → ws range:");

const rangeExamples = [
  "1.0.0", // Точная версия
  "^1.0.0", // Совместимые версии (caret)
  "~1.0.0", // Приблизительно эквивалентные (tilde)
  "*", // Любая версия
  "^2.1.0-alpha.1", // Caret с prerelease
  "~1.5.0-beta.2", // Tilde с prerelease
];

rangeExamples.forEach((range) => {
  try {
    const wsRange = convertSemverRangeToWsRange(range);
    console.log(`  ${range.padEnd(20)} → ${wsRange}`);
  } catch (error) {
    console.log(`  ${range.padEnd(20)} → ERROR: ${error.message}`);
  }
});

console.log("\n✅ Валидация ws-промежутков:");
const wsRanges = [
  "1.0.0.0", // Точная валидная версия
  "^1.0.0.0", // Валидный caret range
  "^0.0.0.0", // Валидный универсальный range
  "^1.0", // Невалидный (мало компонентов)
  "~1.0.0.0", // Невалидный (tilde не поддерживается в ws)
];

wsRanges.forEach((range) => {
  const isValid = isValidWsRange(range);
  console.log(`  ${range.padEnd(15)} → ${isValid ? "✅ валиден" : "❌ невалиден"}`);
});
