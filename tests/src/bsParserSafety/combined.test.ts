// =============================================================================
// Combined — взаимодействие нескольких BS-safety passes
//
// Тесты проверяют, что pipeline из passes корректно работает в связке:
//   parenthesize → comma-safety → cleanup-grouping → literal-extract
// =============================================================================

// ---- Precedence + comma-safety ----
// Вызов с несколькими аргументами, содержащими выражения с разным приоритетом

function sum(a: number, b: number): number {
  return a + b;
}

// f(a * b + c, d - e * f) — precedence парентизирует *, comma-safety оборачивает args
const r1 = sum(2 * 3 + 4, 10 - 2 * 3);
botest.assertValueEquals(r1, 14, "sum(2*3+4, 10-2*3) = sum(10, 4) = 14");

// ---- Precedence + literal-extract ----
// Литерал в member expression + арифметика с приоритетами

const r2 = [1, 2, 3, 4, 5].length * 2 + 1;
botest.assertValueEquals(r2, 11, "[1,2,3,4,5].length * 2 + 1 = 11");

const r3 = 1 + [1, 2, 3, 4, 5].length * 2;
botest.assertValueEquals(r3, 11, "1 + [1,2,3,4,5].length * 2 = 11");

// ---- Precedence + cleanup-grouping ----
// Парентизированное выражение, где внутренние скобки потом убираются

const a = 10;
const b = 5;
const c = 2;

// (a) + (b) * (c) — cleanup убирает скобки вокруг идентификаторов,
// parenthesize обеспечивает приоритет операторов
const r6 = (a) + (b) * (c);
botest.assertValueEquals(r6, 20, "(a) + (b) * (c) = 20");

// ---- Cleanup-grouping + literal-extract ----
// cleanup-grouping открывает литерал массива для literal-extract.
const r7 = ([10, 20, 30])[1];
botest.assertValueEquals(r7, 20, "([10,20,30])[1] = 20");

// ---- Ternary + comma-safety + precedence ----
// Тернарный оператор внутри аргументов функции

function pick(x: number, y: number): number {
  return x + y;
}

const flag = true;
const r8 = pick(flag ? 10 : 20, flag ? 1 : 2);
botest.assertValueEquals(r8, 11, "pick(flag?10:20, flag?1:2) = pick(10,1) = 11");

const flag2 = false;
const r9 = pick(flag2 ? 10 : 20, flag2 ? 1 : 2);
botest.assertValueEquals(r9, 22, "pick(flag2?10:20, flag2?1:2) = pick(20,2) = 22");

// ---- All passes: complex expression ----
// Комплексное выражение задействующее все 4 pass-а

function compute(len: number, extra: number): number {
  return len + extra;
}

const r10 = compute(([1, 2, 3]).length * 2 + 1, [10, 20].length);
botest.assertValueEquals(r10, 9, "compute(([1,2,3]).length*2+1, [10,20].length) = compute(7, 2) = 9");

// ---- Nested literal extractions in complex expression ----
const r11 = [1, 2].length + [1, 2, 3].length + [1, 2, 3, 4].length;
botest.assertValueEquals(r11, 9, "[1,2].length + [1,2,3].length + [1,2,3,4].length = 9");

const emptyArrayLength = [].length;
botest.assertValueEquals(emptyArrayLength, 0, "[].length = 0");

// ---- Assignment with complex RHS ----
const x = 3;
const r12 = x > 0 ? [1, 2, 3].length : [1, 2].length;
botest.assertValueEquals(r12, 3, "x>0 ? [1,2,3].length : [1,2].length = 3");

const r13 = x < 0 ? [1, 2, 3].length : [1, 2].length;
botest.assertValueEquals(r13, 2, "x<0 ? [1,2,3].length : [1,2].length = 2");

botest.assertOk();

export {};
