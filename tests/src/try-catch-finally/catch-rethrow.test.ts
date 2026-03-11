let result = "";
let caughtError: any;

try {
  try {
    throw "original";
  } catch (e) {
    result += "catch";
    throw "from-catch";
  } finally {
    result += "finally";
  }
} catch (outer) {
  caughtError = outer;
  result += "outer";
}

botest.assertValueEquals(result, "catchfinallyouter", "finally should run when catch rethrows");
botest.assertTrue(StrBegins(caughtError + "", "from-catch"), "rethrown error should propagate");

botest.assertOk();

export {};
