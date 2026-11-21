/**
 * Lowering module - преобразование TypeScript AST в IR
 *
 * Структура модуля:
 * - visitor.ts — entry point, VisitorContext, transformToIR
 * - statements.ts — visitors для statements
 * - expressions.ts — visitors для expressions
 * - helpers.ts — вспомогательные функции (операторы, scope, location)
 * - binding.ts — менеджер генерации уникальных имён
 *
 * @module lowering
 */

// Main entry point
export { transformToIR, type VisitorContext, type TransformToIROptions, type TransformResult } from "./visitor.ts";

// Mode configuration
export { type CompileMode, type ModeConfig, createModeConfig } from "./mode-config.ts";

// Statement visitors
export {
  visitStatement,
  visitStatementList,
  visitBlock,
  visitReturnStatement,
  visitIfStatement,
  visitForStatement,
  visitForInStatement,
  visitForOfStatement,
  visitWhileStatement,
  visitDoWhileStatement,
  visitSwitchStatement,
  visitTryStatement,
  visitStatementAsBlock,
} from "./statements.ts";

// Expression visitors
export {
  visitExpression,
  visitIdentifier,
  visitTemplateExpression,
  visitBinaryExpression,
  visitPrefixUnaryExpression,
  visitPostfixUnaryExpression,
  visitCallExpression,
  visitObjectLiteral,
  visitArrayLiteral,
  visitNewExpression,
} from "./expressions.ts";

// Helper functions
export {
  getLoc,
  isInternalAccess,
  isAssignmentOperator,
  getAssignmentOperator,
  getUnaryOperator,
  resolveVariableInScope,
} from "./helpers.ts";

// Binding manager
export { BindingManager, createBindings, initBindings, getBindings } from "./binding.ts";

// Bare mode visitors
export {
  visitBareFunctionDeclaration,
  visitBareVariableStatement,
  visitBareNamespaceDeclaration,
  visitBareArrowFunction,
  visitBareFunctionExpression,
  visitBareObjectMethod,
} from "./bare-visitors.ts";
