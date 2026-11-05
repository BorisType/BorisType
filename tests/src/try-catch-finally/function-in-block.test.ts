function blockFunctionProbe(): number {
  if (true) {
    function inner(): number {
      try {
        return 1;
      } finally {
        unused: {
          2;
        }
      }
    }
    return inner();
  }
  return 0;
}
botest.assertValueEquals(blockFunctionProbe(), 1, "function beneath a block owns an independently lowered finalizer");
botest.assertOk();
export {};
