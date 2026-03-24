// =============================================================================
// Literal-extract pass — extraction of literal receivers
//
// BS не поддерживает обращение к свойствам и методам непосредственно у литералов:
//   "hello".length     → BS syntax error
//   [1,2,3].join(",")  → BS syntax error
//
// Literal-extract pass находит MemberExpression где object — Literal или
// ArrayExpression, и извлекает его во временную переменную:
//   var __lit0 = "hello"; __lit0.length        → OK
//   var __lit1 = [1,2,3]; __lit1.join(",")     → OK
//
// В module mode большинство property access обёрнуто в bt.getProperty(),
// но extracted переменная всё равно генерируется в IR и hoisted наверх.
// Тест проверяет, что семантика сохраняется: значения правильные.
// =============================================================================

// ---- String literal property access ----

// String length
const r1 = "hello".length;
botest.assertValueEquals(r1, 5, "\"hello\".length = 5");

// String with spaces
const r2 = "hello world".length;
botest.assertValueEquals(r2, 11, "\"hello world\".length = 11");

// Empty string length
const r3 = "".length;
botest.assertValueEquals(r3, 0, "\"\".length = 0");

// ---- String literal method calls ----

// FIXME: .indexOf() транспилируется в bt.polyfill.String.indexOf() — не поддерживается в botest
// const r4 = "hello world".indexOf("world");
// botest.assertValueEquals(r4, 6, "\"hello world\".indexOf(\"world\") = 6");

// FIXME: .indexOf() транспилируется в bt.polyfill.String.indexOf() — не поддерживается в botest
// const r5 = "hello".indexOf("xyz");
// botest.assertValueEquals(r5, -1, "\"hello\".indexOf(\"xyz\") = -1");

// ---- Array literal property access ----

// Array length
const r6 = [1, 2, 3].length;
botest.assertValueEquals(r6, 3, "[1,2,3].length = 3");

// Empty array length
const r7 = [].length;
botest.assertValueEquals(r7, 0, "[].length = 0");

// ---- Array literal method calls ----

// FIXME: .join() транспилируется в bt.polyfill.Array.join() — не поддерживается в botest
// const r8 = [1, 2, 3].join(",");
// botest.assertValueEquals(r8, "1,2,3", "[1,2,3].join(',') = '1,2,3'");

// FIXME: .join() транспилируется в bt.polyfill.Array.join() — не поддерживается в botest
// const r9 = [1, 2, 3].join("");
// botest.assertValueEquals(r9, "123", "[1,2,3].join('') = '123'");

// ---- Multiple literal extractions in one expression ----

// Two string literal property accesses in one expression
const r10 = "abc".length + "defgh".length;
botest.assertValueEquals(r10, 8, "\"abc\".length + \"defgh\".length = 8");

// ---- Control: non-literal receivers should NOT be extracted ----

// Variable receiver — no extraction needed
const str = "hello";
const r11 = str.length;
botest.assertValueEquals(r11, 5, "str.length = 5 (variable, not extracted)");

// Variable array — no extraction needed
const arr = [10, 20, 30];
const r12 = arr.length;
botest.assertValueEquals(r12, 3, "arr.length = 3 (variable, not extracted)");

// ---- Literal in computed access ----

// FIXME: bt.getProperty("abc", 0) — botest runtime не поддерживает индексацию строк числом
// const r13 = ("abc" as any)[0];
// botest.assertValueEquals(r13, "a", "\"abc\"[0] = 'a'");

// FIXME: bt.getProperty("abc", 2) — botest runtime не поддерживает индексацию строк числом
// const r14 = ("abc" as any)[2];
// botest.assertValueEquals(r14, "c", "\"abc\"[2] = 'c'");

// Array element access
const r15 = [10, 20, 30][1];
botest.assertValueEquals(r15, 20, "[10,20,30][1] = 20");

botest.assertOk();

export {};
