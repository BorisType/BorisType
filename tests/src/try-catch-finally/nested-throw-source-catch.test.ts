let nestedThrowTrace = "";

function catchAfterNestedFinalizer(): string {
  try {
    try {
      throw "nested-boom";
    } finally {
      nestedThrowTrace += "F";
    }
  } catch (error) {
    nestedThrowTrace += "C";
    return "caught";
  }
}

botest.assertValueEquals(catchAfterNestedFinalizer(), "caught", "source catch must receive a throw after nested finally");
botest.assertValueEquals(nestedThrowTrace, "FC", "nested finally must run before the source catch");
botest.assertOk();

export {};
