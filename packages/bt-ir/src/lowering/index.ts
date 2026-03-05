/**
 * Lowering module - преобразование TypeScript AST в IR
 *
 * Структура модуля:
 * - visitor.ts — entry point, VisitorContext, transformToIR
 * - statements.ts — visitors для statements
 * - expressions.ts — visitors для expressions  
 * - helpers.ts — вспомогательные функции (операторы, scope, location)
 * - function-builder.ts — построение env/desc паттерна для функций
 * - binding.ts — менеджер генерации уникальных имён
 *
 * @module lowering
 */

// Main entry point
export {
  transformToIR,
  type VisitorContext,
  type CompileMode,
  type TransformToIROptions,
} from "./visitor.ts";

// Statement visitors
export {
  visitStatement,
  visitStatementList,
  visitBlock,
  visitFunctionDeclaration,
  visitVariableStatement,
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
  visitArrowFunction,
  visitFunctionExpression,
  visitNewExpression,
  helperEnvAccess,
} from "./expressions.ts";

// Helper functions
export {
  getLoc,
  getPolyfillType,
  isInternalAccess,
  isTypeOnlyImport,
  isBuiltinFunction,
  isAssignmentOperator,
  getAssignmentOperator,
  getUnaryOperator,
  resolveVariableInScope,
  isScopeInsideOrEqual,
  getAllScopes,
  getCapturedVariablesInScope,
  collectCapturedVarsForArrow,
} from "./helpers.ts";

// Binding manager
export { BindingManager, createBindings, initBindings, getBindings } from "./binding.ts";

// Function builder
export {
  buildFunction,
  assignDescriptorObj,
  getEnvFunctionRef,
  type FunctionBuildResult,
  type FunctionBuildOptions,
  type CapturedVarInfo,
} from "./function-builder.ts";

// Bare mode visitors
export {
  visitBareFunctionDeclaration,
  visitBareVariableStatement,
  visitBareNamespaceDeclaration,
  visitBareArrowFunction,
  visitBareFunctionExpression,
  visitBareObjectMethod,
} from "./bare-visitors.ts";
