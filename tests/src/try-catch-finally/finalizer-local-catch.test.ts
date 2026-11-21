const state = { trace: "" };
function preserveReturn(state: { trace: string }): string {
  try {
    return "R";
  } finally {
    try {
      throw "local";
    } catch {
      state.trace += "C";
    }
    state.trace += "F";
  }
}
function recoverFromOverride(state: { trace: string }): string {
  try {
    try {
      return "wrong";
    } finally {
      throw "override";
    }
  } catch {
    state.trace += "O";
  }
  state.trace += "A";
  return "E";
}
botest.assertValueEquals(preserveReturn(state), "R", "handled local finalizer exception preserves pending return");
botest.assertValueEquals(recoverFromOverride(state), "E", "recovering from finalizer throw discards stale return completion");
botest.assertValueEquals(state.trace, "CFOA", "local catch and overriding catch run in source order");
botest.assertOk();
export {};
