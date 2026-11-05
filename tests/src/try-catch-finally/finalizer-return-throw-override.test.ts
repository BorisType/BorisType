let returnThrowOverrideTrace = "";
let finalizerThrown: any = null;

function returnOverridesThrow(): string {
  try {
    throw "try-error";
  } finally {
    return "final-return";
  }
}

function throwOverridesReturn(): string {
  try {
    return "try-return";
  } finally {
    throw "final-error";
  }
}

returnThrowOverrideTrace += returnOverridesThrow();

try {
  throwOverridesReturn();
} catch (error) {
  finalizerThrown = error;
  returnThrowOverrideTrace += "|caught";
}

botest.assertValueEquals(returnThrowOverrideTrace, "final-return|caught", "finalizer return/throw must replace the pending completion");
botest.assertTrue(StrBegins(finalizerThrown + "", "final-error"), "finalizer throw must replace a pending return");
botest.assertOk();

export {};
