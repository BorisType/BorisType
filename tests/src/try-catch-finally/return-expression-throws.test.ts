const state = { trace: "" };
let returnExpressionError: any = null;

function throwFromReturnExpression(): string {
  throw "return-boom";
}

function evaluateThrowingReturn(state: { trace: string }): string {
  try {
    return throwFromReturnExpression();
  } finally {
    state.trace += "F";
  }
}

try {
  evaluateThrowingReturn(state);
} catch (error) {
  returnExpressionError = error;
  state.trace += "C";
}

botest.assertValueEquals(state.trace, "FC", "return expression error must propagate after finally");
botest.assertTrue(StrBegins(returnExpressionError + "", "return-boom"), "return expression error must not become an undefined return");
botest.assertOk();

export {};
