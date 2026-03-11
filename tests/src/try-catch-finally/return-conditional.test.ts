let sideEffect = "";

function conditionalReturn(shouldReturn: boolean): string {
  try {
    sideEffect += "try";
    if (shouldReturn) {
      return "early";
    }
    sideEffect += "after-if";
  } finally {
    sideEffect += "finally";
  }
  return "normal";
}

const val1 = conditionalReturn(true);
botest.assertValueEquals(val1, "early", "conditional return should return early value");
botest.assertValueEquals(sideEffect, "tryfinally", "finally runs on early return");

sideEffect = "";
const val2 = conditionalReturn(false);
botest.assertValueEquals(val2, "normal", "no early return should fall through");
botest.assertValueEquals(sideEffect, "tryafter-iffinally", "finally runs after full try body");

botest.assertOk();

export {};
