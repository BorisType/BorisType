const state = { trace: "" };

function catchReturn(state: { trace: string }): string {
  try {
    state.trace += "try";
    throw "error";
  } catch (e) {
    state.trace += "catch";
    return "from-catch";
  } finally {
    state.trace += "finally";
  }
}

const val = catchReturn(state);

botest.assertValueEquals(val, "from-catch", "return value from catch should be preserved");
botest.assertValueEquals(state.trace, "trycatchfinally", "finally should run after catch return");

botest.assertOk();

export {};
