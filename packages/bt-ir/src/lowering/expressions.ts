/**
 * Expression Visitors  barrel re-export
 *
 * Код разбит на модули в директории expressions/:
 * - dispatch.ts   visitExpression (main dispatch) + shared utilities
 * - operators.ts  visitBinaryExpression, visitPrefixUnary, visitPostfixUnary
 * - calls.ts      visitCallExpression, visitNewExpression, resolveCallableRef
 * - literals.ts   visitIdentifier, visitTemplateExpression, visitObjectLiteral, visitArrayLiteral
 * - functions.ts  visitArrowFunction, visitFunctionExpression
 * - module-access.ts  importModuleVarAccess, helperEnvAccess
 *
 * @module lowering/expressions
 */

export {
  visitExpression,
  maybeExtract,
  createOptionalCheck,
  chainOptionalAccess,
  visitBinaryExpression,
  visitPrefixUnaryExpression,
  visitPostfixUnaryExpression,
  visitCallExpression,
  visitNewExpression,
  resolveCallableRef,
  visitIdentifier,
  visitTemplateExpression,
  visitObjectLiteral,
  visitArrayLiteral,
  visitArrowFunction,
  visitFunctionExpression,
  importModuleVarAccess,
  helperEnvAccess,
} from "./expressions/index.ts";
