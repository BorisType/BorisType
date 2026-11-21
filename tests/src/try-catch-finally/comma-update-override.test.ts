const state = { trace: "" };

function commaOverride(state: { trace: string }): string {
  outer: for (let i = 0; i < 3; state.trace += "U", i++) {
    try {
      state.trace += i;
      return "bad";
    } finally {
      state.trace += "F";
      if (i < 2) continue outer;
      break outer;
    }
  }
  return "E";
}

botest.assertValueEquals(commaOverride(state), "E", "finalizer jump replaces return in a comma-update loop");
botest.assertValueEquals(state.trace, "0FU1FU2F", "finalizer continue runs update but finalizer break skips it");
botest.assertOk();

export {};
