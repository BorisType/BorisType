let result = "";

try {
  result += "try";
} finally {
  result += "finally";
}

try {
  throw "err";
} catch (e) {
  result += "catch";
} finally {
  result += "finally2";
}

botest.assertValueEquals(result, "tryfinallycatchfinally2", "catch without param should still work with finally");

botest.assertOk();

export {};
