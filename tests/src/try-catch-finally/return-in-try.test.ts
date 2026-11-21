const state = { trace: "" };

function tryReturn(state: { trace: string }): string {
  try {
    state.trace += "try";
    return "from-try";
  } finally {
    state.trace += "finally";
  }
}

const val = tryReturn(state);

botest.assertValueEquals(val, "from-try", "return value from try should be preserved");
botest.assertValueEquals(state.trace, "tryfinally", "finally should run before return completes");

botest.assertOk();

export {};
