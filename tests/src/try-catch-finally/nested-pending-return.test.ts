let nestedPendingTrace = "";

function preserveReturnAcrossNestedFinalizers(): number {
  try {
    return 7;
  } finally {
    try {
      nestedPendingTrace += "I";
    } finally {
      nestedPendingTrace += "J";
    }
  }
}

botest.assertValueEquals(
  preserveReturnAcrossNestedFinalizers(),
  7,
  "normally completed nested finalizers must preserve an outer pending return",
);
botest.assertValueEquals(nestedPendingTrace, "IJ", "nested finalizers must run inside-out");
botest.assertOk();

export {};
