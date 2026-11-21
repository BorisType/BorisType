let result = "";

const left = true;
const right = true;
if (left && right) {
  result = "entered";
}
botest.assertValueEquals(result, "entered", "if: true && true enters block");

if (left && false) {
  result = "entered";
} else {
  result = "else";
}
botest.assertValueEquals(result, "else", "if: true && false goes to else");

if (false && right) {
  result = "entered";
} else {
  result = "else";
}
botest.assertValueEquals(result, "else", "if: false && true goes to else");

let iterations = 0;
let flag = true;
while (flag && right) {
  iterations += 1;
  flag = false;
}
botest.assertValueEquals(iterations, 1, "while: conjunction runs once");

let skipped = 0;
const disabled = false;
while (disabled && right) {
  skipped += 1;
}
botest.assertValueEquals(skipped, 0, "while: a false conjunction skips the body");

let forCount = 0;
let forFlag = true;
for (; forFlag && right;) {
  forCount += 1;
  forFlag = false;
}
botest.assertValueEquals(forCount, 1, "for: conjunction runs once");

const both = left && right ? "yes" : "no";
const neither = false && right ? "yes" : "no";
botest.assertValueEquals(both, "yes", "ternary branches on a true conjunction");
botest.assertValueEquals(neither, "no", "ternary branches on a false conjunction");
botest.assertValueEquals(!(left && right), false, "negation of a true conjunction");
botest.assertValueEquals(!(false && right), true, "negation of a false conjunction");

botest.assertOk();

export {};
