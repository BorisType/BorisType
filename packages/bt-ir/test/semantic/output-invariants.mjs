import assert from "node:assert/strict";
import ts from "typescript";

/** Check comma operators, not argument/property separators, inside for updates. */
export function assertSafeForUpdates(output) {
  const file = ts.createSourceFile("output.js", output, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  assert.equal(file.parseDiagnostics.length, 0);
  function visit(node) {
    if (ts.isForStatement(node) && node.incrementor) {
      function check(expression) {
        assert.ok(
          !ts.isBinaryExpression(expression) || expression.operatorToken.kind !== ts.SyntaxKind.CommaToken,
          `Unsafe for update: ${node.incrementor.getText(file)}`,
        );
        ts.forEachChild(expression, check);
      }
      check(node.incrementor);
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
}
