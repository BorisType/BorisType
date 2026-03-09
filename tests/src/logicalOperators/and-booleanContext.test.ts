// =============================================================================
// && in boolean contexts (if, while, for, ternary)
// Тесты используют только скалярные значения (boolean, number, string),
// потому что BS ternary бросает "Value is not effective boolean" для объектов.
// Поддержка объектов в boolean-контекстах будет добавлена позже.
// =============================================================================

// --- if ---

let result = "";

const a1: any = true;
const b1: any = true;
if (a1 && b1) {
  result = "entered";
}
botest.assertValueEquals(result, "entered", "if: true && true enters block");

result = "";
const a2: any = true;
const b2: any = false;
if (a2 && b2) {
  result = "entered";
} else {
  result = "else";
}
botest.assertValueEquals(result, "else", "if: true && false goes to else");

result = "";
const a3: any = false;
const b3: any = true;
if (a3 && b3) {
  result = "entered";
} else {
  result = "else";
}
botest.assertValueEquals(result, "else", "if: false && true goes to else");

result = "";
const a4: any = 1;
const b4: any = "hello";
if (a4 && b4) {
  result = "entered";
}
botest.assertValueEquals(result, "entered", "if: 1 && 'hello' enters block (both truthy)");

result = "";
const a5: any = "hello";
const b5: any = 0;
if (a5 && b5) {
  result = "entered";
} else {
  result = "else";
}
botest.assertValueEquals(result, "else", "if: 'hello' && 0 goes to else (right falsy)");

// --- while ---

let iterations = 0;
let flag: any = true;
while (flag && true) {
  iterations = iterations + 1;
  flag = false; // stop after first iteration
}
botest.assertValueEquals(iterations, 1, "while: true && true runs once then stops");

let iterations2 = 0;
const flag2: any = false;
while (flag2 && true) {
  iterations2 = iterations2 + 1;
}
botest.assertValueEquals(iterations2, 0, "while: false && true never enters");

// --- for ---

let forCount = 0;
let forFlag: any = true;
for (; forFlag && true; ) {
  forCount = forCount + 1;
  forFlag = false;
}
botest.assertValueEquals(forCount, 1, "for: condition with && works");

// --- ternary condition ---

const t1: any = "hello";
const t2: any = "world";
const tern1 = (t1 && t2) ? "truthy" : "falsy";
botest.assertValueEquals(tern1, "truthy", "ternary: 'hello' && 'world' is truthy");

const t3: any = "hello";
const t4: any = 0;
const tern2 = (t3 && t4) ? "truthy" : "falsy";
botest.assertValueEquals(tern2, "falsy", "ternary: 'hello' && 0 is falsy");

const t5: any = 0;
const t6: any = "world";
const tern3 = (t5 && t6) ? "truthy" : "falsy";
botest.assertValueEquals(tern3, "falsy", "ternary: 0 && 'world' is falsy (left falsy)");

// --- negation ---

const n1: any = "hello";
const n2: any = "world";
const neg1 = !(n1 && n2);
botest.assertValueEquals(neg1, false, "negation: !('hello' && 'world') is false");

const n3: any = "hello";
const n4: any = 0;
const neg2 = !(n3 && n4);
botest.assertValueEquals(neg2, true, "negation: !('hello' && 0) is true");

botest.assertOk();

export {};
