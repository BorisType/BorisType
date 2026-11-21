const state = { trace: "" };

function preserveReturnAcrossNestedFinalizers(state: { trace: string }): number {
  try {
    return 7;
  } finally {
    try {
      state.trace += "I";
    } finally {
      state.trace += "J";
    }
  }
}

botest.assertValueEquals(
  preserveReturnAcrossNestedFinalizers(state),
  7,
  "normally completed nested finalizers must preserve an outer pending return",
);
botest.assertValueEquals(state.trace, "IJ", "nested finalizers must run inside-out");
botest.assertOk();

export {};
