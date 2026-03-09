// =============================================================================
// || in boolean contexts (if, while, for, ternary)
// Тесты используют только скалярные значения (boolean, number, string),
// потому что BS ternary бросает "Value is not effective boolean" для объектов.
// Поддержка объектов в boolean-контекстах будет добавлена позже.
// =============================================================================

// --- if ---

let result = "";

const a1: any = false;
const b1: any = true;
if (a1 || b1) {
  result = "entered";
}
botest.assertValueEquals(result, "entered", "if: false || true enters block");

result = "";
const a2: any = false;
const b2: any = false;
if (a2 || b2) {
  result = "entered";
} else {
  result = "else";
}
botest.assertValueEquals(result, "else", "if: false || false goes to else");

result = "";
const a3: any = 0;
const b3: any = "";
if (a3 || b3) {
  result = "entered";
} else {
  result = "else";
}
botest.assertValueEquals(result, "else", "if: 0 || '' goes to else (empty string is falsy)");

result = "";
const a4: any = 0;
const b4: any = 1;
if (a4 || b4) {
  result = "entered";
}
botest.assertValueEquals(result, "entered", "if: 0 || 1 enters block");

result = "";
const a5: any = "";
const b5: any = "hello";
if (a5 || b5) {
  result = "entered";
}
botest.assertValueEquals(result, "entered", "if: empty || non-empty string enters block");

// --- while ---

let iterations = 0;
let flag: any = true;
while (flag || false) {
  iterations = iterations + 1;
  flag = false; // stop after first iteration
}
botest.assertValueEquals(iterations, 1, "while: true || false runs once then stops");

// --- for ---

let forCount = 0;
let forFlag: any = true;
for (; forFlag || false; ) {
  forCount = forCount + 1;
  forFlag = false;
}
botest.assertValueEquals(forCount, 1, "for: condition with || works");

// --- ternary condition ---

const t1: any = "";
const t2: any = "value";
const tern1 = (t1 || t2) ? "truthy" : "falsy";
botest.assertValueEquals(tern1, "truthy", "ternary: '' || 'value' is truthy");

const t3: any = 0;
const t4: any = 0;
const tern2 = (t3 || t4) ? "truthy" : "falsy";
botest.assertValueEquals(tern2, "falsy", "ternary: 0 || 0 is falsy");

// --- negation ---

const n1: any = "";
const n2: any = "hello";
const neg1 = !(n1 || n2);
botest.assertValueEquals(neg1, false, "negation: !('' || 'hello') is false");

const n3: any = 0;
const n4: any = 0;
const neg2 = !(n3 || n4);
botest.assertValueEquals(neg2, true, "negation: !(0 || 0) is true");

botest.assertOk();

export {};
