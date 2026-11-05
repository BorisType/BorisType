/** Avoid the C runtime's unsafe comma-operator evaluation in for updates. */
import { IR, containsCommaOperator, type IRExpression, type IRProgram, type IRStatement } from "../ir/index.ts";
import type { IRPass } from "./types.ts";
import { mapStatements } from "./walker.ts";

/** @deprecated Import the shared predicate from ir/index instead. */
export { containsCommaOperator } from "../ir/index.ts";

/**
 * Normalize affected for loops before lexical jump resolution and finalizer lowering.
 *
 * A native continue must enter update, then condition, after source finalizers.
 * Moving update to the body tail would skip it on continue. Instead a first-entry
 * flag skips update exactly once; every subsequent while entry evaluates it.
 * Break/return/throw leave the while before that entry. No helper scope or call
 * is introduced, and the replacement loop retains the source control target.
 * Simple updates preserve input identity and incur no additional runtime work.
 */
export const forUpdateDesugarPass: IRPass = {
  name: "for-update-desugar",
  run(program, ctx): IRProgram {
    const mapper = (statement: IRStatement): IRStatement | null => {
      if (statement.kind !== "ForStatement" || !statement.update || !containsCommaOperator(statement.update)) return null;

      // A mapper replacement is not revisited by the walker: explicitly normalize
      // children, including nested functions, before replacing this loop.
      const [body] = mapStatements([statement.body], mapper, { enterFunctions: true });
      const first = ctx.bindings.create("forFirst");
      const prelude: IRStatement[] = [];
      if (statement.init) {
        prelude.push(statement.init.kind === "VariableDeclaration" ? statement.init : IR.exprStmt(statement.init, statement.loc));
      }
      prelude.push(IR.varDecl(first, IR.bool(true), statement.loc));
      const loopBody: IRStatement[] = [
        IR.if(
          IR.id(first),
          IR.block([IR.exprStmt(IR.assign("=", IR.id(first), IR.bool(false)))]),
          IR.block(discardedUpdate(statement.update)),
          statement.loc,
        ),
      ];
      if (statement.test) {
        loopBody.push(IR.if(IR.unary("!", IR.grouping(statement.test)), IR.block([IR.break()]), null, statement.loc));
      }
      loopBody.push(body);
      prelude.push(IR.while(IR.bool(true), IR.block(loopBody, statement.loc), statement.loc, statement.controlTargetId));
      return IR.block(prelude, statement.loc);
    };
    const body = mapStatements(program.body, mapper, { enterFunctions: true });
    return body === program.body ? program : IR.program(body, program.sourceFile, program.noHoist);
  },
};

/** Split discarded sequences in order; keep value-consuming subexpressions intact. */
function discardedUpdate(expression: IRExpression): IRStatement[] {
  switch (expression.kind) {
    case "GroupingExpression":
      return discardedUpdate(expression.expression);
    case "SequenceExpression":
      return expression.expressions.flatMap(discardedUpdate);
    case "BinaryExpression":
      if (expression.operator === ",") return [...discardedUpdate(expression.left), ...discardedUpdate(expression.right)];
      break;
    case "ConditionalExpression":
      return [
        IR.if(
          expression.test,
          IR.block(discardedUpdate(expression.consequent)),
          IR.block(discardedUpdate(expression.alternate)),
          expression.loc,
        ),
      ];
    case "LogicalExpression":
      return [
        IR.if(
          expression.operator === "&&" ? expression.left : IR.unary("!", IR.grouping(expression.left)),
          IR.block(discardedUpdate(expression.right)),
          null,
          expression.loc,
        ),
      ];
  }
  return [IR.exprStmt(expression, expression.loc)];
}
