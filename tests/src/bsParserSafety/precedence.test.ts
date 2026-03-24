// =============================================================================
// Parenthesize pass — operator precedence correctness
//
// BS парсер не всегда корректно обрабатывает приоритеты операторов.
// Parenthesize pass добавляет GroupingExpression (скобки) вокруг операндов,
// когда приоритеты различаются. Этот тест проверяет, что результаты вычислений
// остаются математически корректными после транспиляции.
//
// В BS без скобок: `a + b * c` может быть интерпретировано как `(a + b) * c`.
// С parenthesize pass: `a + (b * c)` — корректный результат.
// =============================================================================

// ---- Arithmetic precedence ----

// Multiplication binds tighter than addition
const r1 = 2 + 3 * 4;
botest.assertValueEquals(r1, 14, "2 + 3 * 4 = 14 (mul before add)");

const r2 = 3 * 4 + 2;
botest.assertValueEquals(r2, 14, "3 * 4 + 2 = 14 (mul before add, reversed)");

// Subtraction and addition — same precedence, left-associative
// prettier-ignore
const r3 = 10 - 3 + 2;
botest.assertValueEquals(r3, 9, "10 - 3 + 2 = 9 (left-to-right)");

// Division and multiplication — same precedence, left-associative
// prettier-ignore
const r4 = 100 / 2 * 5;
botest.assertValueEquals(r4, 250, "100 / 2 * 5 = 250 (left-to-right)");

// Modulo with addition
const r5 = 10 + 7 % 3;
botest.assertValueEquals(r5, 11, "10 + 7 % 3 = 11 (mod before add)");

// ---- Explicit parentheses preserved ----

// prettier-ignore
const r6 = (2 + 3) * 4;
botest.assertValueEquals(r6, 20, "(2 + 3) * 4 = 20");

// prettier-ignore
const r7 = 100 / (2 * 5);
botest.assertValueEquals(r7, 10, "100 / (2 * 5) = 10");

// ---- Comparison + logical ----

// Comparison binds tighter than logical AND
const a = 5;
const b = 10;
// prettier-ignore
const r8 = a > 0 && b < 20;
botest.assertValueEquals(r8, true, "a > 0 && b < 20 (comparison before logical)");

// Logical AND binds tighter than logical OR
// prettier-ignore
const r9 = false && true || true;
botest.assertValueEquals(r9, true, "false && true || true = true (AND before OR)");

// prettier-ignore
const r10 = true || false && false;
botest.assertValueEquals(r10, true, "true || false && false = true (AND before OR)");

// ---- Ternary with expressions ----

// Ternary branches contain binary expressions
const cond = true;
// prettier-ignore
const r11 = cond ? 2 + 3 : 10 - 1;
botest.assertValueEquals(r11, 5, "cond ? 2 + 3 : 10 - 1 = 5");

// Comparison as ternary test
// prettier-ignore
const r12 = a > b ? a : b;
botest.assertValueEquals(r12, 10, "a > b ? a : b = max(a,b) = 10");

// ---- Bitwise vs comparison ----

// Bitwise AND has LOWER precedence than === in JS, so a & b === c → a & (b === c)
// But BS may parse differently. Parenthesize pass should handle this.
const x = 3;
const y = 3;
// prettier-ignore
const r13 = (x & y) === 3;
botest.assertValueEquals(r13, true, "(3 & 3) === 3 should be true");

// Bitwise OR lower than comparison
// prettier-ignore
const r14 = (1 | 2) === 3;
botest.assertValueEquals(r14, true, "(1 | 2) === 3 should be true");

// ---- Nested same-precedence (associativity) ----

// Subtraction is left-associative: a - b - c = (a - b) - c
// prettier-ignore
const r15 = 10 - 3 - 2;
botest.assertValueEquals(r15, 5, "10 - 3 - 2 = 5 (left-associative)");

// Mixed division: a / b / c = (a / b) / c
// prettier-ignore
const r16 = 24 / 4 / 2;
botest.assertValueEquals(r16, 3, "24 / 4 / 2 = 3 (left-associative)");

botest.assertOk();

export {};
