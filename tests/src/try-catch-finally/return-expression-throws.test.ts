let returnExpressionTrace = "";
let returnExpressionError: any = null;

function throwFromReturnExpression(): string {
  throw "return-boom";
}

function evaluateThrowingReturn(): string {
  try {
    return throwFromReturnExpression();
  } finally {
    returnExpressionTrace += "F";
  }
}

try {
  evaluateThrowingReturn();
} catch (error) {
  returnExpressionError = error;
  returnExpressionTrace += "C";
}

botest.assertValueEquals(returnExpressionTrace, "FC", "return expression error must propagate after finally");
botest.assertTrue(StrBegins(returnExpressionError + "", "return-boom"), "return expression error must not become an undefined return");
botest.assertOk();

export {};
