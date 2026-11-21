const state = { trace: "" };

function multipleReturns(x: number, state: { trace: string }): string {
  try {
    state.trace += "try";
    if (x === 1) {
      return "one";
    }
    if (x === 2) {
      return "two";
    }
    return "other";
  } finally {
    state.trace += "finally";
  }
}

state.trace = "";
const r1 = multipleReturns(1, state);
botest.assertValueEquals(r1, "one", "first return path");
botest.assertValueEquals(state.trace, "tryfinally", "finally after first return");

state.trace = "";
const r2 = multipleReturns(2, state);
botest.assertValueEquals(r2, "two", "second return path");
botest.assertValueEquals(state.trace, "tryfinally", "finally after second return");

state.trace = "";
const r3 = multipleReturns(3, state);
botest.assertValueEquals(r3, "other", "fallthrough return");
botest.assertValueEquals(state.trace, "tryfinally", "finally after fallthrough");

botest.assertOk();

export {};
