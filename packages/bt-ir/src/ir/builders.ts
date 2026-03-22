/**
 * IR Builders - фабрики для удобного создания IR нод
 *
 * Использование:
 * ```typescript
 * import { IR } from "./builders.js";
 *
 * const program = IR.program([
 *   IR.varDecl("x", IR.literal(42)),
 *   IR.exprStmt(IR.call(IR.id("print"), [IR.id("x")])),
 * ]);
 * ```
 *
 * @module ir/builders
 */

import type {
  IRProgram,
  IRFunctionDeclaration,
  IRFunctionParam,
  IRVariableDeclaration,
  IRReturnStatement,
  IRExpressionStatement,
  IRIfStatement,
  IRForStatement,
  IRForInStatement,
  IRWhileStatement,
  IRDoWhileStatement,
  IRSwitchStatement,
  IRCaseClause,
  IRTryStatement,
  IRCatchClause,
  IRThrowStatement,
  IRBreakStatement,
  IRContinueStatement,
  IRBlockStatement,
  IREmptyStatement,
  IRIdentifier,
  IRLiteral,
  IRBinaryExpression,
  IRUnaryExpression,
  IRConditionalExpression,
  IRLogicalExpression,
  IRCallExpression,
  IRMemberExpression,
  IRArrayExpression,
  IRObjectExpression,
  IRObjectProperty,
  IRAssignmentExpression,
  IRUpdateExpression,
  IRSequenceExpression,
  IRArgsAccess,
  IREnvAccess,
  IRPolyfillCall,
  IRRuntimeCall,
  IREnvDeclaration,
  IREnvAssign,
  IRBTGetProperty,
  IRBTSetProperty,
  IRBTCallFunction,
  IRBTIsFunction,
  IRBTIsTrue,
  IRGroupingExpression,
  IRStatement,
  IRExpression,
  BinaryOperator,
  UnaryOperator,
  AssignmentOperator,
  SourceLocation,
} from "./nodes.ts";

/**
 * Фабрики для создания IR нод
 */
export const IR = {
  // =========================================================================
  // Program
  // =========================================================================

  /**
   * Создаёт программу
   */
  /**
   * Создаёт программу
   * @param noHoist - если true, эмиттер не будет хоистить функции и переменные (bare mode)
   */
  program(body: IRStatement[], sourceFile?: string, noHoist?: boolean): IRProgram {
    return { kind: "Program", body, sourceFile, noHoist };
  },

  // =========================================================================
  // Statements
  // =========================================================================

  /**
   * Создаёт объявление функции
   * @param plainSignature - если true, сигнатура function name(p1, p2) без __env/__this/__args
   */
  functionDecl(
    name: string,
    originalParams: IRFunctionParam[],
    body: IRStatement[],
    loc?: SourceLocation,
    plainSignature?: boolean,
  ): IRFunctionDeclaration {
    return { kind: "FunctionDeclaration", name, originalParams, body, loc, plainSignature };
  },

  /**
   * Создаёт параметр функции
   */
  param(
    name: string,
    defaultValue?: IRExpression,
    rest?: boolean,
    isCaptured?: boolean,
  ): IRFunctionParam {
    return { name, defaultValue, rest, isCaptured };
  },

  /**
   * Создаёт объявление переменной
   */
  varDecl(
    name: string,
    init: IRExpression | null = null,
    loc?: SourceLocation,
    isCaptured?: boolean,
    envRef?: string,
    hoistOnly?: boolean,
  ): IRVariableDeclaration {
    return { kind: "VariableDeclaration", name, init, loc, isCaptured, envRef, hoistOnly };
  },

  /**
   * Создаёт return statement
   */
  return(argument: IRExpression | null = null, loc?: SourceLocation): IRReturnStatement {
    return { kind: "ReturnStatement", argument, loc };
  },

  /**
   * Создаёт expression statement
   */
  exprStmt(expression: IRExpression, loc?: SourceLocation): IRExpressionStatement {
    return { kind: "ExpressionStatement", expression, loc };
  },

  /**
   * Создаёт if statement
   */
  if(
    test: IRExpression,
    consequent: IRStatement,
    alternate: IRStatement | null = null,
    loc?: SourceLocation,
  ): IRIfStatement {
    return { kind: "IfStatement", test, consequent, alternate, loc };
  },

  /**
   * Создаёт for statement
   */
  for(
    init: IRVariableDeclaration | IRExpression | null,
    test: IRExpression | null,
    update: IRExpression | null,
    body: IRStatement,
    loc?: SourceLocation,
  ): IRForStatement {
    return { kind: "ForStatement", init, test, update, body, loc };
  },

  /**
   * Создаёт for-in statement
   */
  forIn(
    left: IRVariableDeclaration | IRIdentifier,
    right: IRExpression,
    body: IRStatement,
    loc?: SourceLocation,
  ): IRForInStatement {
    return { kind: "ForInStatement", left, right, body, loc };
  },

  /**
   * Создаёт while statement
   */
  while(test: IRExpression, body: IRStatement, loc?: SourceLocation): IRWhileStatement {
    return { kind: "WhileStatement", test, body, loc };
  },

  /**
   * Создаёт do-while statement
   */
  doWhile(body: IRStatement, test: IRExpression, loc?: SourceLocation): IRDoWhileStatement {
    return { kind: "DoWhileStatement", test, body, loc };
  },

  /**
   * Создаёт switch statement
   */
  switch(
    discriminant: IRExpression,
    cases: IRCaseClause[],
    loc?: SourceLocation,
  ): IRSwitchStatement {
    return { kind: "SwitchStatement", discriminant, cases, loc };
  },

  /**
   * Создаёт case clause
   */
  case(test: IRExpression | null, consequent: IRStatement[]): IRCaseClause {
    return { kind: "CaseClause", test, consequent };
  },

  /**
   * Создаёт try statement
   */
  try(
    block: IRBlockStatement,
    handler: IRCatchClause | null = null,
    finalizer: IRBlockStatement | null = null,
    loc?: SourceLocation,
  ): IRTryStatement {
    return { kind: "TryStatement", block, handler, finalizer, loc };
  },

  /**
   * Создаёт catch clause
   */
  catch(param: string | null, body: IRBlockStatement): IRCatchClause {
    return { kind: "CatchClause", param, body };
  },

  /**
   * Создаёт throw statement
   */
  throw(argument: IRExpression, loc?: SourceLocation): IRThrowStatement {
    return { kind: "ThrowStatement", argument, loc };
  },

  /**
   * Создаёт break statement
   */
  break(label?: string, loc?: SourceLocation): IRBreakStatement {
    return { kind: "BreakStatement", label, loc };
  },

  /**
   * Создаёт continue statement
   */
  continue(label?: string, loc?: SourceLocation): IRContinueStatement {
    return { kind: "ContinueStatement", label, loc };
  },

  /**
   * Создаёт block statement
   */
  block(body: IRStatement[], loc?: SourceLocation): IRBlockStatement {
    return { kind: "BlockStatement", body, loc };
  },

  /**
   * Создаёт empty statement
   */
  empty(loc?: SourceLocation): IREmptyStatement {
    return { kind: "EmptyStatement", loc };
  },

  // =========================================================================
  // Expressions
  // =========================================================================

  /**
   * Создаёт identifier
   */
  id(name: string, loc?: SourceLocation): IRIdentifier {
    return { kind: "Identifier", name, loc };
  },

  /**
   * Создаёт literal
   */
  literal(value: string | number | boolean | null, raw?: string, loc?: SourceLocation): IRLiteral {
    return {
      kind: "Literal",
      value,
      raw: raw ?? stringifyLiteral(value),
      loc,
    };
  },

  /**
   * Создаёт строковый literal
   */
  string(value: string, loc?: SourceLocation): IRLiteral {
    return IR.literal(value, `"${escapeString(value)}"`, loc);
  },

  /**
   * Создаёт числовой literal
   */
  number(value: number, loc?: SourceLocation): IRLiteral {
    return IR.literal(value, String(value), loc);
  },

  /**
   * Создаёт boolean literal
   */
  bool(value: boolean, loc?: SourceLocation): IRLiteral {
    return IR.literal(value, String(value), loc);
  },

  /**
   * Создаёт null literal
   */
  null(loc?: SourceLocation): IRLiteral {
    return IR.literal(null, "null", loc);
  },

  /**
   * Создаёт grouping expression (expr) — явные скобки
   */
  grouping(expression: IRExpression, loc?: SourceLocation): IRGroupingExpression {
    return { kind: "GroupingExpression", expression, loc };
  },

  /**
   * Создаёт binary expression
   */
  binary(
    operator: BinaryOperator,
    left: IRExpression,
    right: IRExpression,
    loc?: SourceLocation,
  ): IRBinaryExpression {
    return { kind: "BinaryExpression", operator, left, right, loc };
  },

  /**
   * Создаёт unary expression
   */
  unary(
    operator: UnaryOperator,
    argument: IRExpression,
    prefix = true,
    loc?: SourceLocation,
  ): IRUnaryExpression {
    return { kind: "UnaryExpression", operator, argument, prefix, loc };
  },

  /**
   * Создаёт conditional expression (ternary)
   */
  conditional(
    test: IRExpression,
    consequent: IRExpression,
    alternate: IRExpression,
    loc?: SourceLocation,
  ): IRConditionalExpression {
    return { kind: "ConditionalExpression", test, consequent, alternate, loc };
  },

  /**
   * Создаёт logical expression
   */
  logical(
    operator: "&&" | "||",
    left: IRExpression,
    right: IRExpression,
    loc?: SourceLocation,
  ): IRLogicalExpression {
    return { kind: "LogicalExpression", operator, left, right, loc };
  },

  /**
   * Создаёт call expression
   */
  call(callee: IRExpression, args: IRExpression[], loc?: SourceLocation): IRCallExpression {
    return { kind: "CallExpression", callee, arguments: args, loc };
  },

  /**
   * Создаёт member expression
   */
  member(
    object: IRExpression,
    property: IRExpression,
    computed = false,
    loc?: SourceLocation,
  ): IRMemberExpression {
    return { kind: "MemberExpression", object, property, computed, loc };
  },

  /**
   * Создаёт member expression с dot notation (a.b)
   */
  dot(object: IRExpression, property: string, loc?: SourceLocation): IRMemberExpression {
    return IR.member(object, IR.id(property), false, loc);
  },

  /**
   * Создаёт array expression
   */
  array(elements: (IRExpression | null)[], loc?: SourceLocation): IRArrayExpression {
    return { kind: "ArrayExpression", elements, loc };
  },

  /**
   * Создаёт object expression
   */
  object(properties: IRObjectProperty[], loc?: SourceLocation): IRObjectExpression {
    return { kind: "ObjectExpression", properties, loc };
  },

  /**
   * Создаёт object property
   */
  prop(key: string, value: IRExpression, computed = false): IRObjectProperty {
    return { kind: "ObjectProperty", key, value, computed };
  },

  /**
   * Создаёт assignment expression
   */
  assign(
    operator: AssignmentOperator,
    left: IRIdentifier | IRMemberExpression | IREnvAccess,
    right: IRExpression,
    loc?: SourceLocation,
  ): IRAssignmentExpression {
    return { kind: "AssignmentExpression", operator, left, right, loc };
  },

  /**
   * Создаёт update expression
   */
  update(
    operator: "++" | "--",
    argument: IRIdentifier | IRMemberExpression,
    prefix = false,
    loc?: SourceLocation,
  ): IRUpdateExpression {
    return { kind: "UpdateExpression", operator, argument, prefix, loc };
  },

  /**
   * Создаёт sequence expression
   */
  sequence(expressions: IRExpression[], loc?: SourceLocation): IRSequenceExpression {
    return { kind: "SequenceExpression", expressions, loc };
  },

  // =========================================================================
  // Special Expressions
  // =========================================================================

  /**
   * Создаёт args access
   */
  argsAccess(index: number, originalName: string, loc?: SourceLocation): IRArgsAccess {
    return { kind: "ArgsAccess", index, originalName, loc };
  },

  /**
   * Создаёт env access
   */
  envAccess(depth: number, key: string, loc?: SourceLocation): IREnvAccess {
    return { kind: "EnvAccess", depth, key, loc };
  },

  /**
   * Создаёт polyfill call
   */
  polyfillCall(
    polyfillType: string,
    method: string,
    target: IRExpression,
    args: IRExpression[],
    loc?: SourceLocation,
  ): IRPolyfillCall {
    return { kind: "PolyfillCall", polyfillType, method, target, arguments: args, loc };
  },

  /**
   * Создаёт runtime call
   */
  runtimeCall(
    namespace: string,
    method: string,
    args: IRExpression[],
    loc?: SourceLocation,
  ): IRRuntimeCall {
    return { kind: "RuntimeCall", namespace, method, arguments: args, loc };
  },

  // =========================================================================
  // Environment
  // =========================================================================

  /**
   * Создаёт env declaration
   *
   * @param declare - Если false, emit без `var` (переменная уже hoisted). По умолчанию true.
   */
  envDecl(
    name: string,
    parentEnv: string | null = null,
    loc?: SourceLocation,
    declare: boolean = true,
  ): IREnvDeclaration {
    return { kind: "EnvDeclaration", name, parentEnv, declare, loc };
  },

  /**
   * Создаёт env assign
   */
  envAssign(envName: string, key: string, value: IRExpression, loc?: SourceLocation): IREnvAssign {
    return { kind: "EnvAssign", envName, key, value, loc };
  },

  // =========================================================================
  // BT Runtime Calls
  // =========================================================================

  /**
   * Создаёт bt.getProperty(obj, prop)
   */
  btGetProperty(
    object: IRExpression,
    property: IRExpression,
    loc?: SourceLocation,
  ): IRBTGetProperty {
    return { kind: "BTGetProperty", object, property, loc };
  },

  /**
   * Создаёт bt.setProperty(obj, prop, value)
   */
  btSetProperty(
    object: IRExpression,
    property: IRExpression,
    value: IRExpression,
    loc?: SourceLocation,
  ): IRBTSetProperty {
    return { kind: "BTSetProperty", object, property, value, loc };
  },

  /**
   * Создаёт bt.callFunction(func, [args])
   */
  btCallFunction(
    callee: IRExpression,
    args: IRExpression[],
    loc?: SourceLocation,
  ): IRBTCallFunction {
    return { kind: "BTCallFunction", callee, arguments: args, loc };
  },

  /**
   * Создаёт bt.isFunction(value)
   */
  btIsFunction(value: IRExpression, loc?: SourceLocation): IRBTIsFunction {
    return { kind: "BTIsFunction", value, loc };
  },

  /**
   * Создаёт bt.isTrue(value)
   */
  btIsTrue(value: IRExpression, loc?: SourceLocation): IRBTIsTrue {
    return { kind: "BTIsTrue", value, loc };
  },
};

// =========================================================================
// Helpers
// =========================================================================

/**
 * Преобразует значение литерала в строку
 */
function stringifyLiteral(value: string | number | boolean | null): string {
  if (typeof value === "string") {
    return `"${escapeString(value)}"`;
  }
  if (value === null) {
    return "null";
  }
  return String(value);
}

/**
 * Экранирует строку для вывода
 */
function escapeString(str: string): string {
  return str
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t");
}
