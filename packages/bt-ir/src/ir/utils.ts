/** Shared, read-only IR utilities with no dependency on transformation passes. */
import type { IRExpression } from "./nodes.ts";

/**
 * Exhaustiveness check for switches over IR discriminated unions.
 * Adding a new kind without handling it is a compile-time error at the call site.
 * @param value - Unreachable value, narrowed to never
 */
export function assertNever(value: never): never {
  throw new Error(`Unhandled IR node kind: ${(value as { kind?: string })?.kind ?? value}`);
}

/**
 * Detects comma operators anywhere in an expression, not list separators.
 * Traverses typed expression children without rebuilding or mutating the IR.
 * @param expression - Root expression to inspect
 */
export function containsCommaOperator(expression: IRExpression): boolean {
  switch (expression.kind) {
    case "SequenceExpression":
      return true;
    case "BinaryExpression":
      return expression.operator === "," || containsCommaOperator(expression.left) || containsCommaOperator(expression.right);
    case "LogicalExpression":
    case "AssignmentExpression":
      return containsCommaOperator(expression.left) || containsCommaOperator(expression.right);
    case "GroupingExpression":
      return containsCommaOperator(expression.expression);
    case "UnaryExpression":
    case "UpdateExpression":
      return containsCommaOperator(expression.argument);
    case "ConditionalExpression":
      return (
        containsCommaOperator(expression.test) ||
        containsCommaOperator(expression.consequent) ||
        containsCommaOperator(expression.alternate)
      );
    case "CallExpression":
      return containsCommaOperator(expression.callee) || expression.arguments.some(containsCommaOperator);
    case "MemberExpression":
      return containsCommaOperator(expression.object) || containsCommaOperator(expression.property);
    case "ArrayExpression":
      return expression.elements.some((element) => element !== null && containsCommaOperator(element));
    case "ObjectExpression":
      return expression.properties.some((property) => containsCommaOperator(property.value));
    case "RuntimeCall":
      return expression.arguments.some(containsCommaOperator);
    case "Identifier":
    case "Literal":
      return false;
    default:
      return assertNever(expression);
  }
}
