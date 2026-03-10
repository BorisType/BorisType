let result = "";

try {
  throw "error";
} catch (e) {
  result += "catch";
}

result += "after";

botest.assertValueEquals(result, "catchafter", "try-catch without finally should work normally");

botest.assertOk();

export {};
