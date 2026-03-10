let result = "";
let caughtError: any;

try {
  try {
    result += "try";
    throw "boom";
  } finally {
    result += "finally";
  }
} catch (e) {
  caughtError = e;
  result += "outer";
}

botest.assertValueEquals(result, "tryfinallyouter", "finally should run before error propagates");
botest.assertTrue(StrBegins(caughtError + "", "boom"), "error should propagate after finally");

botest.assertOk();

export {};
