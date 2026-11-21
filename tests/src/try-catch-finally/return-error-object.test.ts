type ErrorState = { original: unknown; textBefore: string };

const state: ErrorState = { original: undefined, textBefore: "" };

function returnCaughtError(state: ErrorState): unknown {
  try {
    throw "boom";
  } catch (error) {
    state.original = error;
    state.textBefore = "" + error;
    return error;
  } finally {
    // The returned platform error must not be thrown as a control-flow sentinel.
  }
}

const returned = returnCaughtError(state);
botest.assertTrue(returned === state.original, "return through finally preserves the caught platform error reference");
botest.assertValueEquals("" + returned, state.textBefore, "return carrier does not mutate the caught platform error text");
botest.assertOk();
export {};
