// =============================================================================
// Cleanup-grouping pass — удаление избыточных группирующих скобок
//
// BS парсер по-разному обрабатывает скобки:
//   (a).toString()    — лишние скобки, но BS может неверно трактовать
//   (f()).x           — лишние скобки вокруг call result
//
// cleanup-grouping удаляет GroupingExpression вокруг "атомарных" узлов:
//   Identifier, Literal, MemberExpression, CallExpression,
//   ArrayExpression, ObjectExpression, UpdateExpression, и т.д.
//
// KNOWN BUG: ("Hello, world!").length
//   Lowering оборачивает литерал в GroupingExpression.
//   literal-extract видит GroupingExpression (не Literal) → НЕ извлекает.
//   cleanup-grouping затем удаляет скобки → "Hello, world!".length → BS error.
//   Пока баг не исправлен, в тестах проверяем только работающие сценарии.
// =============================================================================

// ---- Grouping around identifier ----

// (someVar).length → someVar.length — скобки не влияют на значение
const str = "hello";
const r1 = (str).length;
botest.assertValueEquals(r1, 5, "(str).length = 5");

// // (someVar).toString() — call на сгруппированном идентификаторе
// const num: any = 42;
// const r2 = (num).toString();
// botest.assertValueEquals(r2, "42", "(num).toString() = '42'");

// ---- Grouping around array variable ----

// (arr)[0] — computed access через скобки
const arr = [10, 20, 30];
const r3 = (arr)[0];
botest.assertValueEquals(r3, 10, "(arr)[0] = 10");

// (arr).length
const r4 = (arr).length;
botest.assertValueEquals(r4, 3, "(arr).length = 3");

// ---- Grouping around function call result ----

function getStr(): string {
  return "test";
}

// (getStr()).length — скобки вокруг результата вызова
const r5 = (getStr()).length;
botest.assertValueEquals(r5, 4, "(getStr()).length = 4");

function getArr(): number[] {
  return [1, 2, 3, 4];
}

const r6 = (getArr()).length;
botest.assertValueEquals(r6, 4, "(getArr()).length = 4");

// ---- Double grouping ----

// ((someVar)).length — двойные скобки
const r7 = ((str)).length;
botest.assertValueEquals(r7, 5, "((str)).length = 5");

// ---- Grouping does not affect computed member ----

const obj: Record<string, number> = { a: 1, b: 2 };
const key = "a";
const r8 = (obj)[key];
botest.assertValueEquals(r8, 1, "(obj)[key] = 1");

// ---- Grouping around literal in non-member context ----

// Скобки вокруг литерала в присваивании — просто значение
const r9 = ("hello");
botest.assertValueEquals(r9, "hello", "('hello') = 'hello'");

const r10 = (123);
botest.assertValueEquals(r10, 123, "(123) = 123");

// ---- Mixed: grouping + arithmetic ----

// (a) + (b) — скобки вокруг атомарных выражений в арифметике
const a = 10;
const b = 20;
const r11 = (a) + (b);
botest.assertValueEquals(r11, 30, "(a) + (b) = 30");

botest.assertOk();

export {};
