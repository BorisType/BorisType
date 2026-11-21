let result = "";

const left = false;
const right = true;
if (left || right) {
  result = "entered";
}
botest.assertValueEquals(result, "entered", "if: false || true enters block");

if (left || false) {
  result = "entered";
} else {
  result = "else";
}
botest.assertValueEquals(result, "else", "if: false || false goes to else");

let iterations = 0;
let flag = true;
while (flag || left) {
  iterations += 1;
  flag = false;
}
botest.assertValueEquals(iterations, 1, "while: disjunction runs once");

let forCount = 0;
let forFlag = true;
for (; forFlag || left;) {
  forCount += 1;
  forFlag = false;
}
botest.assertValueEquals(forCount, 1, "for: disjunction runs once");

const either = left || right ? "yes" : "no";
const neither = left || false ? "yes" : "no";
botest.assertValueEquals(either, "yes", "ternary branches on a true disjunction");
botest.assertValueEquals(neither, "no", "ternary branches on a false disjunction");
botest.assertValueEquals(!(left || right), false, "negation of a true disjunction");
botest.assertValueEquals(!(left || false), true, "negation of a false disjunction");

botest.assertOk();

export {};
