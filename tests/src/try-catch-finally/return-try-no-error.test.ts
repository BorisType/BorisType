const state = { trace: "" };

function tryReturnCatchReturn(state: { trace: string }): string {
  try {
    state.trace += "try";
    return "from-try";
  } catch (e) {
    state.trace += "catch";
    return "from-catch";
  } finally {
    state.trace += "finally";
  }
}

const val = tryReturnCatchReturn(state);

botest.assertValueEquals(val, "from-try", "return in try wins when no error");
botest.assertValueEquals(state.trace, "tryfinally", "catch skipped, finally still runs");

botest.assertOk();

export {};
