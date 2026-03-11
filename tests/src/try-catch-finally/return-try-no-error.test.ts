let sideEffect = "";

function tryReturnCatchReturn(): string {
  try {
    sideEffect += "try";
    return "from-try";
  } catch (e) {
    sideEffect += "catch";
    return "from-catch";
  } finally {
    sideEffect += "finally";
  }
}

const val = tryReturnCatchReturn();

botest.assertValueEquals(val, "from-try", "return in try wins when no error");
botest.assertValueEquals(sideEffect, "tryfinally", "catch skipped, finally still runs");

botest.assertOk();

export {};
