let result = "";

try {
  throw "This is an error";
} catch (error) {
  result += "catch";
} finally {
  result += "finally";
}

botest.assertValueEquals(result, "catchfinally", "The finally block should execute after the catch block");

botest.assertOk();

export {};
