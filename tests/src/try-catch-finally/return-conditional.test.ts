const state = { trace: "" };

function conditionalReturn(shouldReturn: boolean, state: { trace: string }): string {
  try {
    state.trace += "try";
    if (shouldReturn) {
      return "early";
    }
    state.trace += "after-if";
  } finally {
    state.trace += "finally";
  }
  return "normal";
}

const val1 = conditionalReturn(true, state);
botest.assertValueEquals(val1, "early", "conditional return should return early value");
botest.assertValueEquals(state.trace, "tryfinally", "finally runs on early return");

state.trace = "";
const val2 = conditionalReturn(false, state);
botest.assertValueEquals(val2, "normal", "no early return should fall through");
botest.assertValueEquals(state.trace, "tryafter-iffinally", "finally runs after full try body");

botest.assertOk();

export {};
