let sideEffect = "";

function catchReturn(): string {
  try {
    sideEffect += "try";
    throw "error";
  } catch (e) {
    sideEffect += "catch";
    return "from-catch";
  } finally {
    sideEffect += "finally";
  }
}

const val = catchReturn();

botest.assertValueEquals(val, "from-catch", "return value from catch should be preserved");
botest.assertValueEquals(sideEffect, "trycatchfinally", "finally should run after catch return");

botest.assertOk();

export {};
