let result = "";

try {
  try {
    result += "inner-try";
    throw "inner-error";
  } catch (e) {
    result += "inner-catch";
  } finally {
    result += "inner-finally";
  }
  result += "after-inner";
} catch (e) {
  result += "outer-catch";
} finally {
  result += "outer-finally";
}

botest.assertValueEquals(
  result,
  "inner-tryinner-catchinner-finallyafter-innerouter-finally",
  "nested try-catch-finally should execute in correct order",
);

botest.assertOk();

export {};
