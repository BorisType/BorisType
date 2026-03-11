let log = "";

function multipleReturns(x: number): string {
  try {
    log += "try";
    if (x === 1) {
      return "one";
    }
    if (x === 2) {
      return "two";
    }
    return "other";
  } finally {
    log += "finally";
  }
}

log = "";
const r1 = multipleReturns(1);
botest.assertValueEquals(r1, "one", "first return path");
botest.assertValueEquals(log, "tryfinally", "finally after first return");

log = "";
const r2 = multipleReturns(2);
botest.assertValueEquals(r2, "two", "second return path");
botest.assertValueEquals(log, "tryfinally", "finally after second return");

log = "";
const r3 = multipleReturns(3);
botest.assertValueEquals(r3, "other", "fallthrough return");
botest.assertValueEquals(log, "tryfinally", "finally after fallthrough");

botest.assertOk();

export {};
