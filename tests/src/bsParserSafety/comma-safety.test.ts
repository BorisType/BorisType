// =============================================================================
// Comma-safety pass — non-atomic expressions in comma-separated contexts
//
// BS парсер некорректно обрабатывает сложные выражения (binary, ternary, logical)
// в comma-separated контекстах: аргументы функций, элементы массивов, значения
// объектов. При нескольких элементах парсер путает границы выражений.
//
// Comma-safety pass оборачивает не-атомарные выражения в GroupingExpression
// только когда элементов больше одного. Одиночные аргументы/элементы безопасны.
//
// В BS без comma-safety:
//   f(a, b + c, d)     → BS может интерпретировать как f(a, b) + c, d
//   [a, x > 0 ? 1 : 0] → BS путает границы элементов
//
// С comma-safety pass:
//   f(a, (b + c), d)   → корректный вызов
//   [a, (x > 0 ? 1 : 0)] → корректный массив
// =============================================================================

// ---- Helper function ----

// FIXME: rest params транспилируются в bt.Array.slice() — не поддерживается в botest
// function sum(...args: number[]): number {
//   let s = 0;
//   for (const arg of args) {
//     s += arg;
//   }
//   return s;
// }

function sum(a: number, b: number, c: number): number {
  return a + b + c;
}

function first(a: any, _b?: any, _c?: any): any {
  return a;
}

function second(_a: any, b: any, _c?: any): any {
  return b;
}

function third(_a: any, _b: any, c: any): any {
  return c;
}

// =============================================================================
// Group 1: Multi-arg function calls with binary expressions
// =============================================================================

// Binary expression as 2nd argument among 3
const r1 = sum(1, 2 + 3, 4);
botest.assertValueEquals(r1, 10, "sum(1, 2+3, 4) = 10");

// Binary expression as 1st argument among 3
const r2 = sum(10 - 5, 2, 3);
botest.assertValueEquals(r2, 10, "sum(10-5, 2, 3) = 10");

// Multiple binary expressions
const r3 = sum(1 + 1, 2 + 2, 3 + 3);
botest.assertValueEquals(r3, 12, "sum(1+1, 2+2, 3+3) = 12");

// =============================================================================
// Group 2: Multi-arg function calls with ternary
// =============================================================================

const flag = true;

// Ternary as 2nd argument among 3
const r4 = second(1, flag ? 42 : 0, 3);
botest.assertValueEquals(r4, 42, "second(1, flag ? 42 : 0, 3) = 42");

// Ternary as 1st argument among 2
const r5 = first(flag ? 99 : 0, 1);
botest.assertValueEquals(r5, 99, "first(flag ? 99 : 0, 1) = 99");

// =============================================================================
// Group 3: Single-arg calls — should NOT be wrapped (safety check)
// =============================================================================

// Single binary arg — no wrapping needed
const r6 = first(2 + 3);
botest.assertValueEquals(r6, 5, "first(2 + 3) = 5 (single arg, no wrapping needed)");

// Single ternary arg — no wrapping needed
const r7 = first(flag ? 10 : 20);
botest.assertValueEquals(r7, 10, "first(flag ? 10 : 20) = 10 (single arg, no wrapping)");

// =============================================================================
// Group 4: Array literals with multiple elements
// =============================================================================

// Binary in array element
const arr1 = [1, 2 + 3, 4];
botest.assertValueEquals(arr1[0], 1, "[1, 2+3, 4][0] = 1");
botest.assertValueEquals(arr1[1], 5, "[1, 2+3, 4][1] = 5");
botest.assertValueEquals(arr1[2], 4, "[1, 2+3, 4][2] = 4");

// Ternary in array element
const arr2 = [0, flag ? 42 : 0, 100];
botest.assertValueEquals(arr2[1], 42, "[0, flag ? 42 : 0, 100][1] = 42");

// Single element array — no wrapping
const arr3 = [2 + 3];
botest.assertValueEquals(arr3[0], 5, "[2 + 3][0] = 5 (single element, safe)");

// Single element ternary — no wrapping
const arr4 = [flag ? 10 : 20];
botest.assertValueEquals(arr4[0], 10, "[flag ? 10 : 20][0] = 10 (single element, safe)");

// =============================================================================
// Group 5: Object literal values
// =============================================================================

// Binary in object value
const obj1 = { x: 1, y: 2 + 3, z: 4 };
botest.assertValueEquals(obj1.x, 1, "{x:1, y:2+3, z:4}.x = 1");
botest.assertValueEquals(obj1.y, 5, "{x:1, y:2+3, z:4}.y = 5");
botest.assertValueEquals(obj1.z, 4, "{x:1, y:2+3, z:4}.z = 4");

// Ternary in object value
const obj2 = { a: flag ? 42 : 0, b: 10 };
botest.assertValueEquals(obj2.a, 42, "{a: flag ? 42 : 0, b: 10}.a = 42");

// Single-property object — no wrapping
const obj3 = { x: 2 + 3 };
botest.assertValueEquals(obj3.x, 5, "{x: 2+3}.x = 5 (single prop, safe)");

// =============================================================================
// Group 6: Logical expressions in multi-arg context
// =============================================================================

const t = true;
const f = false;

// Logical OR as 2nd argument among 3
const r8 = second(1, t || f, 3);
botest.assertValueEquals(r8, true, "second(1, t || f, 3) = true");

// Logical AND in array
const arr5 = [1, t && f, 3];
botest.assertValueEquals(arr5[1], false, "[1, t && f, 3][1] = false");

// =============================================================================
// Group 7: Unary expressions in multi-arg context
// =============================================================================

// Unary minus in args
const num = 5;
const r9 = sum(1, -num, 10);
botest.assertValueEquals(r9, 6, "sum(1, -5, 10) = 6");

// Logical NOT in array
const arr6 = [true, !flag, false];
botest.assertValueEquals(arr6[1], false, "[true, !flag, false][1] = false");

botest.assertOk();

export {};
