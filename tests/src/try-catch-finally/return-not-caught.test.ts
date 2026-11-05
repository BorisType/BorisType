function returnMustNotReachUserCatch(): number {
  try {
    try {
      return 1;
    } catch (error) {
      return 2;
    }
  } finally {
    // The finalizer forces abrupt-completion lowering.
  }
}

botest.assertValueEquals(returnMustNotReachUserCatch(), 1, "user catch must not observe an internal return completion");
botest.assertOk();

export {};
