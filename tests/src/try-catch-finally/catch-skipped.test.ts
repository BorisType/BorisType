let result = "";

try {
  result += "try";
} catch (e) {
  result += "catch";
} finally {
  result += "finally";
}

botest.assertValueEquals(result, "tryfinally", "catch should be skipped when no error");

botest.assertOk();

export {};
