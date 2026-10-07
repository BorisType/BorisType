let original: unknown;
let textBefore = "";
function returnCaughtError(): unknown {
  try {
    throw "boom";
  } catch (error) {
    original = error;
    textBefore = "" + error;
    return error;
  } finally {
    // The returned platform error must not be thrown as a control-flow sentinel.
  }
}
const returned = returnCaughtError();
botest.assertTrue(returned === original, "return through finally preserves the caught platform error reference");
botest.assertValueEquals("" + returned, textBefore, "return carrier does not mutate the caught platform error text");
botest.assertOk();
export {};
