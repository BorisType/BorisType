/**
 * Expression Visitors — barrel re-exports
 *
 * @module lowering/expressions
 */

// Main dispatcher + shared utilities
export { visitExpression, maybeExtract } from "./dispatch.ts";

// Operators
export { visitBinaryExpression, visitPrefixUnaryExpression, visitPostfixUnaryExpression } from "./operators.ts";

// Calls
export { visitCallExpression, visitNewExpression } from "./calls.ts";

// Literals
export { visitIdentifier, visitTemplateExpression, visitObjectLiteral, visitArrayLiteral } from "./literals.ts";
