/**
 * Expression Visitors  barrel re-export
 *
 * Код разбит на модули в директории expressions/:
 * - dispatch.ts   visitExpression (main dispatch) + shared utilities
 * - operators.ts  visitBinaryExpression, visitPrefixUnary, visitPostfixUnary
 * - calls.ts      visitCallExpression, visitNewExpression
 * - literals.ts   visitIdentifier, visitTemplateExpression, visitObjectLiteral, visitArrayLiteral
 *
 * @module lowering/expressions
 */

export {
  visitExpression,
  maybeExtract,
  visitBinaryExpression,
  visitPrefixUnaryExpression,
  visitPostfixUnaryExpression,
  visitCallExpression,
  visitNewExpression,
  visitIdentifier,
  visitTemplateExpression,
  visitObjectLiteral,
  visitArrayLiteral,
} from "./expressions/index.ts";
