const state = { trace: "" };

function catchAfterNestedFinalizer(state: { trace: string }): string {
  try {
    try {
      throw "nested-boom";
    } finally {
      state.trace += "F";
    }
  } catch (error) {
    state.trace += "C";
    return "caught";
  }
}

botest.assertValueEquals(catchAfterNestedFinalizer(state), "caught", "source catch must receive a throw after nested finally");
botest.assertValueEquals(state.trace, "FC", "nested finally must run before the source catch");
botest.assertOk();

export {};
