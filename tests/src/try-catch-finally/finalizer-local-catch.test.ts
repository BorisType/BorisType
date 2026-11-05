let trace = "";
function preserveReturn(): string {
  try {
    return "R";
  } finally {
    try {
      throw "local";
    } catch {
      trace += "C";
    }
    trace += "F";
  }
}
function recoverFromOverride(): string {
  try {
    try {
      return "wrong";
    } finally {
      throw "override";
    }
  } catch {
    trace += "O";
  }
  trace += "A";
  return "E";
}
botest.assertValueEquals(preserveReturn(), "R", "handled local finalizer exception preserves pending return");
botest.assertValueEquals(recoverFromOverride(), "E", "recovering from finalizer throw discards stale return completion");
botest.assertValueEquals(trace, "CFOA", "local catch and overriding catch run in source order");
botest.assertOk();
export {};
