// =============================================================================
// Combined — взаимодействие нескольких BS-safety passes
//
// Тесты проверяют, что pipeline из passes корректно работает в связке:
//   parenthesize → comma-safety → literal-extract → cleanup-grouping
//
// Каждый тест задействует минимум 2 pass-а одновременно.
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

const r2 = "hello".length * 2 + 1;
botest.assertValueEquals(r2, 11, "\"hello\".length * 2 + 1 = 11");

const r3 = 1 + "hello".length * 2;
botest.assertValueEquals(r3, 11, "1 + \"hello\".length * 2 = 11");

// ---- Comma-safety + literal-extract ----

function first(a: string, b: string): string {
  return a;
}

function second(a: string, b: string): string {
  return b;
}

// FIXME: .join() транспилируется в bt.polyfill.Array.join() — не поддерживается в botest
// const r4 = first([1, 2, 3].join(","), "other");
// botest.assertValueEquals(r4, "1,2,3", "first([1,2,3].join(','), 'other') = '1,2,3'");

// FIXME: .join() транспилируется в bt.polyfill.Array.join() — не поддерживается в botest
// const r5 = second("other", [4, 5, 6].join("-"));
// botest.assertValueEquals(r5, "4-5-6", "second('other', [4,5,6].join('-')) = '4-5-6'");

// ---- Precedence + cleanup-grouping ----
// Парентизированное выражение, где внутренние скобки потом убираются

const a = 10;
const b = 5;
const c = 2;

// (a) + (b) * (c) — cleanup убирает скобки вокруг идентификаторов,
// parenthesize обеспечивает приоритет операторов
const r6 = (a) + (b) * (c);
botest.assertValueEquals(r6, 20, "(a) + (b) * (c) = 20");

// ---- Literal-extract + cleanup-grouping ----
// (arr).length where arr is variable — cleanup removes parens, no extraction needed
const arr = [1, 2, 3, 4, 5];
const r7 = (arr).length;
botest.assertValueEquals(r7, 5, "(arr).length = 5");

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
botest.assertValueEquals(r9, 22, "pick(!flag?10:20, !flag?1:2) = pick(20,2) = 22");

// ---- All passes: complex expression ----
// Комплексное выражение задействующее все 4 pass-а

function compute(len: number, extra: number): number {
  return len + extra;
}

// "abc".length → literal-extract
// * 2 + 1 → precedence
// result в аргументе + другой arg → comma-safety
// (cleanup убирает лишние скобки)
const r10 = compute("abc".length * 2 + 1, [10, 20].length);
botest.assertValueEquals(r10, 9, "compute(\"abc\".length*2+1, [10,20].length) = compute(7, 2) = 9");

// ---- Nested literal extractions in complex expression ----
const r11 = "ab".length + "cde".length + [1, 2, 3, 4].length;
botest.assertValueEquals(r11, 9, "\"ab\".length + \"cde\".length + [1,2,3,4].length = 2+3+4 = 9");

// ---- Assignment with complex RHS ----
const x = 3;
const r12 = x > 0 ? "yes".length : "no".length;
botest.assertValueEquals(r12, 3, "x>0 ? \"yes\".length : \"no\".length = 3");

const r13 = x < 0 ? "yes".length : "no".length;
botest.assertValueEquals(r13, 2, "x<0 ? \"yes\".length : \"no\".length = 2");

botest.assertOk();

export {};
