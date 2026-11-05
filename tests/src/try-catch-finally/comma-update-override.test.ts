let commaOverrideTrace = "";

function commaOverride(): string {
  outer: for (let i = 0; i < 3; commaOverrideTrace += "U", i++) {
    try {
      commaOverrideTrace += i;
      return "bad";
    } finally {
      commaOverrideTrace += "F";
      if (i < 2) continue outer;
      break outer;
    }
  }
  return "E";
}

botest.assertValueEquals(commaOverride(), "E", "finalizer jump replaces return in a comma-update loop");
botest.assertValueEquals(commaOverrideTrace, "0FU1FU2F", "finalizer continue runs update but finalizer break skips it");
botest.assertOk();

export {};
