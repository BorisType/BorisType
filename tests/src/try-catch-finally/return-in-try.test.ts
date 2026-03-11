let sideEffect = "";

function tryReturn(): string {
  try {
    sideEffect += "try";
    return "from-try";
  } finally {
    sideEffect += "finally";
  }
}

const val = tryReturn();

botest.assertValueEquals(val, "from-try", "return value from try should be preserved");
botest.assertValueEquals(sideEffect, "tryfinally", "finally should run before return completes");

botest.assertOk();

export {};
