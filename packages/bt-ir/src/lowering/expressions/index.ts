/**
 * Expression Visitors — barrel re-exports
 *
 * @module lowering/expressions
 */

// Main dispatcher + shared utilities
export {
  visitExpression,
  maybeExtract,
  createOptionalCheck,
  chainOptionalAccess,
} from "./dispatch.ts";

// Operators
export {
  visitBinaryExpression,
  visitPrefixUnaryExpression,
  visitPostfixUnaryExpression,
} from "./operators.ts";

// Calls
export { visitCallExpression, visitNewExpression, resolveCallableRef } from "./calls.ts";

// Literals
export {
  visitIdentifier,
  visitTemplateExpression,
  visitObjectLiteral,
  visitArrayLiteral,
} from "./literals.ts";

// Functions
export { visitArrowFunction, visitFunctionExpression } from "./functions.ts";

// Module access
export { importModuleVarAccess, helperEnvAccess } from "./module-access.ts";
