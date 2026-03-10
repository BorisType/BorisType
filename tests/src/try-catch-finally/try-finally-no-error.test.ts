let result = "";

try {
  result += "try";
} finally {
  result += "finally";
}

botest.assertValueEquals(result, "tryfinally", "try-finally without error should run both blocks");

botest.assertOk();

export {};
