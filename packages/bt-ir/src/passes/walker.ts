/**
 * Generic IR tree walker/transformer utilities
 *
 * Обобщает паттерн рекурсивного обхода IR-дерева,
 * реализованный в transformReturns* (control-flow.ts).
 *
 * Ключевые принципы:
 * - Иммутабельность: если ноды не изменились, возвращается оригинальная ссылка
 * - Scope awareness: по умолчанию не входит в FunctionDeclaration (свой scope)
 * - Replace, insert, remove: функция-маппер может вернуть 0..N statements вместо 1
 *
 * @module passes/walker
 */

import type {
  IRStatement,
  IRExpression,
  IRBlockStatement,
  IRFunctionDeclaration,
  IRIfStatement,
  IRForStatement,
  IRForInStatement,
  IRWhileStatement,
  IRDoWhileStatement,
  IRSwitchStatement,
  IRTryStatement,
  IRCaseClause,
  IRExpressionStatement,
  IRReturnStatement,
  IRThrowStatement,
  IRVariableDeclaration,
  IRBinaryExpression,
  IRUnaryExpression,
  IRConditionalExpression,
  IRLogicalExpression,
  IRCallExpression,
  IRMemberExpression,
  IRArrayExpression,
  IRObjectExpression,
  IRAssignmentExpression,
  IRUpdateExpression,
  IRSequenceExpression,
  IRPolyfillCall,
  IRRuntimeCall,
  IRBTGetProperty,
  IRBTSetProperty,
  IRBTCallFunction,
  IRBTIsFunction,
  IRBTIsTrue,
  IRGroupingExpression,
  IREnvAssign,
} from "../ir/index.ts";
import { IR, assertNever } from "../ir/index.ts";

// ============================================================================
// Statement Mapping
// ============================================================================

/**
 * Результат маппинга одного statement:
 * - IRStatement — заменить на один statement
 * - IRStatement[] — заменить на несколько (или пустой массив для удаления)
 * - null/undefined — оставить без изменений (shortcut)
 */
export type StatementMapResult = IRStatement | IRStatement[] | null | undefined;

/**
 * Функция-маппер для statements.
 *
 * Вызывается для каждого statement **до** рекурсивного обхода его children.
 * Если возвращает не-null результат, замена применяется и children не обходятся.
 * Если возвращает null/undefined — walker продолжает рекурсию в children.
 */
export type StatementMapper = (stmt: IRStatement) => StatementMapResult;

/**
 * Опции для mapStatements
 */
export interface MapStatementsOptions {
  /**
   * Если true, заходит внутрь FunctionDeclaration.
   * По умолчанию false — функции имеют свой scope.
   */
  enterFunctions?: boolean;
}

/**
 * Рекурсивно применяет маппер к списку statements.
 *
 * Маппер вызывается для каждого statement. Если маппер вернул результат,
 * он используется вместо оригинального statement. Если маппер вернул
 * null/undefined, walker рекурсивно обходит children (если они есть).
 *
 * @param stmts - Список statements для обхода
 * @param mapper - Функция-маппер
 * @param options - Опции обхода
 * @returns Новый список statements (или оригинальный, если ничего не изменилось)
 */
export function mapStatements(stmts: IRStatement[], mapper: StatementMapper, options?: MapStatementsOptions): IRStatement[] {
  const enterFunctions = options?.enterFunctions ?? false;
  let changed = false;
  const result: IRStatement[] = [];

  for (const stmt of stmts) {
    const mapped = mapper(stmt);

    if (mapped !== null && mapped !== undefined) {
      // Маппер обработал — используем результат
      changed = true;
      if (Array.isArray(mapped)) {
        result.push(...mapped);
      } else {
        result.push(mapped);
      }
    } else {
      // Рекурсивно обходим children
      const transformed = mapStatementChildren(stmt, mapper, enterFunctions);
      if (transformed !== stmt) changed = true;
      result.push(transformed);
    }
  }

  return changed ? result : stmts;
}

/**
 * Рекурсивно применяет маппер к children одного statement.
 * Не вызывает маппер на самом stmt — только на его вложенных statements.
 */
function mapStatementChildren(stmt: IRStatement, mapper: StatementMapper, enterFunctions: boolean): IRStatement {
  switch (stmt.kind) {
    case "FunctionDeclaration": {
      if (!enterFunctions) return stmt;
      const s = stmt as IRFunctionDeclaration;
      const newBody = mapStatements(s.body, mapper, { enterFunctions });
      return newBody === s.body ? stmt : IR.functionDecl(s.name, s.originalParams, newBody, s.loc, s.plainSignature);
    }

    case "BlockStatement": {
      const s = stmt as IRBlockStatement;
      const newBody = mapStatements(s.body, mapper, { enterFunctions });
      return newBody === s.body ? stmt : IR.block(newBody, s.loc);
    }

    case "IfStatement": {
      const s = stmt as IRIfStatement;
      const newCons = mapStatementBody(s.consequent, mapper, enterFunctions);
      const newAlt = s.alternate ? mapStatementBody(s.alternate, mapper, enterFunctions) : s.alternate;
      if (newCons === s.consequent && newAlt === s.alternate) return stmt;
      return IR.if(s.test, newCons, newAlt, s.loc);
    }

    case "WhileStatement": {
      const s = stmt as IRWhileStatement;
      const newBody = mapStatementBody(s.body, mapper, enterFunctions);
      return newBody === s.body ? stmt : IR.while(s.test, newBody, s.loc);
    }

    case "DoWhileStatement": {
      const s = stmt as IRDoWhileStatement;
      const newBody = mapStatementBody(s.body, mapper, enterFunctions);
      return newBody === s.body ? stmt : IR.doWhile(newBody, s.test, s.loc);
    }

    case "ForStatement": {
      const s = stmt as IRForStatement;
      const newBody = mapStatementBody(s.body, mapper, enterFunctions);
      return newBody === s.body ? stmt : IR.for(s.init, s.test, s.update, newBody, s.loc);
    }

    case "ForInStatement": {
      const s = stmt as IRForInStatement;
      const newBody = mapStatementBody(s.body, mapper, enterFunctions);
      return newBody === s.body ? stmt : IR.forIn(s.left, s.right, newBody, s.loc);
    }

    case "SwitchStatement": {
      const s = stmt as IRSwitchStatement;
      let casesChanged = false;
      const newCases = s.cases.map((c) => {
        const newConsequent = mapStatements(c.consequent, mapper, { enterFunctions });
        if (newConsequent !== c.consequent) casesChanged = true;
        return newConsequent === c.consequent ? c : IR.case(c.test, newConsequent);
      });
      return casesChanged ? IR.switch(s.discriminant, newCases, s.loc) : stmt;
    }

    case "TryStatement": {
      const s = stmt as IRTryStatement;
      const newBlock = mapStatementBlock(s.block, mapper, enterFunctions);
      const newHandler = s.handler
        ? (() => {
            const newBody = mapStatementBlock(s.handler!.body, mapper, enterFunctions);
            return newBody === s.handler!.body ? s.handler : IR.catch(s.handler!.param, newBody);
          })()
        : null;
      const newFinalizer = s.finalizer ? mapStatementBlock(s.finalizer, mapper, enterFunctions) : s.finalizer;
      if (newBlock === s.block && newHandler === s.handler && newFinalizer === s.finalizer) {
        return stmt;
      }
      return IR.try(newBlock, newHandler, newFinalizer, s.loc);
    }

    // Leaf statements — no statement children to recurse into
    case "VariableDeclaration":
    case "ReturnStatement":
    case "ExpressionStatement":
    case "ThrowStatement":
    case "BreakStatement":
    case "ContinueStatement":
    case "EmptyStatement":
    case "EnvDeclaration":
    case "EnvAssign":
    case "CaseClause":
      return stmt;

    default:
      return assertNever(stmt as never);
  }
}

/**
 * Маппит body statement (может быть BlockStatement или одиночный statement).
 * Для одиночного statement: применяет маппер, результат оборачивает в блок если нужно.
 */
function mapStatementBody(stmt: IRStatement, mapper: StatementMapper, enterFunctions: boolean): IRStatement {
  if (stmt.kind === "BlockStatement") {
    return mapStatementBlock(stmt as IRBlockStatement, mapper, enterFunctions);
  }

  // Одиночный statement — сначала вызываем маппер
  const mapped = mapper(stmt);
  if (mapped !== null && mapped !== undefined) {
    if (Array.isArray(mapped)) {
      return mapped.length === 1 ? mapped[0] : IR.block(mapped);
    }
    return mapped;
  }

  // Маппер не обработал — рекурсия в children
  return mapStatementChildren(stmt, mapper, enterFunctions);
}

/**
 * Маппит содержимое блока, сохраняя BlockStatement обёртку.
 */
function mapStatementBlock(block: IRBlockStatement, mapper: StatementMapper, enterFunctions: boolean): IRBlockStatement {
  const newBody = mapStatements(block.body, mapper, { enterFunctions });
  return newBody === block.body ? block : IR.block(newBody, block.loc);
}

// ============================================================================
// Expression Mapping
// ============================================================================

/**
 * Функция-маппер для expressions.
 *
 * Вызывается для каждого expression. Если возвращает не-null,
 * замена применяется и children не обходятся.
 * Если возвращает null/undefined — walker рекурсивно обходит children.
 */
export type ExpressionMapper = (expr: IRExpression) => IRExpression | null | undefined;

/**
 * Рекурсивно применяет маппер к expression и всем вложенным expressions.
 *
 * @param expr - Expression для обхода
 * @param mapper - Функция-маппер
 * @returns Новый expression (или оригинальный, если ничего не изменилось)
 */
export function mapExpression(expr: IRExpression, mapper: ExpressionMapper): IRExpression {
  const mapped = mapper(expr);
  if (mapped !== null && mapped !== undefined) return mapped;

  return mapExpressionChildren(expr, mapper);
}

/**
 * Рекурсивно обходит children expression, применяя маппер.
 */
function mapExpressionChildren(expr: IRExpression, mapper: ExpressionMapper): IRExpression {
  switch (expr.kind) {
    case "BinaryExpression": {
      const e = expr as IRBinaryExpression;
      const newLeft = mapExpression(e.left, mapper);
      const newRight = mapExpression(e.right, mapper);
      if (newLeft === e.left && newRight === e.right) return expr;
      return IR.binary(e.operator, newLeft, newRight, e.loc);
    }

    case "UnaryExpression": {
      const e = expr as IRUnaryExpression;
      const newArg = mapExpression(e.argument, mapper);
      return newArg === e.argument ? expr : IR.unary(e.operator, newArg, e.prefix, e.loc);
    }

    case "ConditionalExpression": {
      const e = expr as IRConditionalExpression;
      const newTest = mapExpression(e.test, mapper);
      const newCons = mapExpression(e.consequent, mapper);
      const newAlt = mapExpression(e.alternate, mapper);
      if (newTest === e.test && newCons === e.consequent && newAlt === e.alternate) return expr;
      return IR.conditional(newTest, newCons, newAlt, e.loc);
    }

    case "LogicalExpression": {
      const e = expr as IRLogicalExpression;
      const newLeft = mapExpression(e.left, mapper);
      const newRight = mapExpression(e.right, mapper);
      if (newLeft === e.left && newRight === e.right) return expr;
      return IR.logical(e.operator, newLeft, newRight, e.loc);
    }

    case "CallExpression": {
      const e = expr as IRCallExpression;
      const newCallee = mapExpression(e.callee, mapper);
      const newArgs = mapExpressionList(e.arguments, mapper);
      if (newCallee === e.callee && newArgs === e.arguments) return expr;
      return IR.call(newCallee, newArgs, e.loc);
    }

    case "MemberExpression": {
      const e = expr as IRMemberExpression;
      const newObj = mapExpression(e.object, mapper);
      const newProp = mapExpression(e.property, mapper);
      if (newObj === e.object && newProp === e.property) return expr;
      return IR.member(newObj, newProp, e.computed, e.loc);
    }

    case "ArrayExpression": {
      const e = expr as IRArrayExpression;
      let changed = false;
      const newElements = e.elements.map((el) => {
        if (el === null) return null;
        const newEl = mapExpression(el, mapper);
        if (newEl !== el) changed = true;
        return newEl;
      });
      return changed ? IR.array(newElements, e.loc) : expr;
    }

    case "ObjectExpression": {
      const e = expr as IRObjectExpression;
      let changed = false;
      const newProps = e.properties.map((p) => {
        const newValue = mapExpression(p.value, mapper);
        if (newValue !== p.value) changed = true;
        return newValue === p.value ? p : IR.prop(p.key, newValue, p.computed);
      });
      return changed ? IR.object(newProps, e.loc) : expr;
    }

    case "AssignmentExpression": {
      const e = expr as IRAssignmentExpression;
      // Left can be Identifier, MemberExpression, or EnvAccess — map if needed
      const newLeft = mapExpression(e.left, mapper) as typeof e.left;
      const newRight = mapExpression(e.right, mapper);
      if (newLeft === e.left && newRight === e.right) return expr;
      return IR.assign(e.operator, newLeft, newRight, e.loc);
    }

    case "UpdateExpression": {
      const e = expr as IRUpdateExpression;
      const newArg = mapExpression(e.argument, mapper) as typeof e.argument;
      return newArg === e.argument ? expr : IR.update(e.operator, newArg, e.prefix, e.loc);
    }

    case "SequenceExpression": {
      const e = expr as IRSequenceExpression;
      const newExprs = mapExpressionList(e.expressions, mapper);
      return newExprs === e.expressions ? expr : IR.sequence(newExprs, e.loc);
    }

    case "PolyfillCall": {
      const e = expr as IRPolyfillCall;
      const newTarget = mapExpression(e.target, mapper);
      const newArgs = mapExpressionList(e.arguments, mapper);
      if (newTarget === e.target && newArgs === e.arguments) return expr;
      return IR.polyfillCall(e.polyfillType, e.method, newTarget, newArgs, e.loc);
    }

    case "RuntimeCall": {
      const e = expr as IRRuntimeCall;
      const newArgs = mapExpressionList(e.arguments, mapper);
      return newArgs === e.arguments ? expr : IR.runtimeCall(e.namespace, e.method, newArgs, e.loc);
    }

    case "BTGetProperty": {
      const e = expr as IRBTGetProperty;
      const newObj = mapExpression(e.object, mapper);
      const newProp = mapExpression(e.property, mapper);
      if (newObj === e.object && newProp === e.property) return expr;
      return IR.btGetProperty(newObj, newProp, e.loc);
    }

    case "BTSetProperty": {
      const e = expr as IRBTSetProperty;
      const newObj = mapExpression(e.object, mapper);
      const newProp = mapExpression(e.property, mapper);
      const newVal = mapExpression(e.value, mapper);
      if (newObj === e.object && newProp === e.property && newVal === e.value) return expr;
      return IR.btSetProperty(newObj, newProp, newVal, e.loc);
    }

    case "BTCallFunction": {
      const e = expr as IRBTCallFunction;
      const newCallee = mapExpression(e.callee, mapper);
      const newArgs = mapExpressionList(e.arguments, mapper);
      if (newCallee === e.callee && newArgs === e.arguments) return expr;
      return IR.btCallFunction(newCallee, newArgs, e.loc);
    }

    case "BTIsFunction": {
      const e = expr as IRBTIsFunction;
      const newArg = mapExpression(e.value, mapper);
      return newArg === e.value ? expr : IR.btIsFunction(newArg, e.loc);
    }

    case "BTIsTrue": {
      const e = expr as IRBTIsTrue;
      const newArg = mapExpression(e.value, mapper);
      return newArg === e.value ? expr : IR.btIsTrue(newArg, e.loc);
    }

    case "GroupingExpression": {
      const e = expr as IRGroupingExpression;
      const newExpr = mapExpression(e.expression, mapper);
      return newExpr === e.expression ? expr : IR.grouping(newExpr, e.loc);
    }

    // Leaf nodes — no children to map
    case "Identifier":
    case "Literal":
    case "ArgsAccess":
    case "EnvAccess":
      return expr;

    default:
      return assertNever(expr as never);
  }
}

/**
 * Маппит список expressions, сохраняя ссылочную идентичность при отсутствии изменений.
 */
function mapExpressionList(exprs: IRExpression[], mapper: ExpressionMapper): IRExpression[] {
  let changed = false;
  const result = exprs.map((e) => {
    const newE = mapExpression(e, mapper);
    if (newE !== e) changed = true;
    return newE;
  });
  return changed ? result : exprs;
}

// ============================================================================
// Convenience: collect from statements
// ============================================================================

/**
 * Собирает элементы из statements рекурсивно.
 *
 * Рекурсивный обход IR statements — вызывает collector для каждого statement.
 * Не входит в FunctionDeclaration (если enterFunctions=false, по умолчанию).
 *
 * @param stmts - Список statements для обхода
 * @param collector - Функция, собирающая данные из statement
 * @param options - Опции обхода
 */
export function forEachStatement(stmts: IRStatement[], collector: (stmt: IRStatement) => void, options?: MapStatementsOptions): void {
  const enterFunctions = options?.enterFunctions ?? false;

  for (const stmt of stmts) {
    collector(stmt);
    visitStatementChildren(stmt, collector, enterFunctions);
  }
}

/**
 * Рекурсивно вызывает collector для children statement.
 */
function visitStatementChildren(stmt: IRStatement, collector: (stmt: IRStatement) => void, enterFunctions: boolean): void {
  switch (stmt.kind) {
    case "FunctionDeclaration": {
      if (!enterFunctions) return;
      const s = stmt as IRFunctionDeclaration;
      for (const child of s.body) {
        collector(child);
        visitStatementChildren(child, collector, enterFunctions);
      }
      break;
    }

    case "BlockStatement": {
      const s = stmt as IRBlockStatement;
      for (const child of s.body) {
        collector(child);
        visitStatementChildren(child, collector, enterFunctions);
      }
      break;
    }

    case "IfStatement": {
      const s = stmt as IRIfStatement;
      visitStatementBodyChildren(s.consequent, collector, enterFunctions);
      if (s.alternate) visitStatementBodyChildren(s.alternate, collector, enterFunctions);
      break;
    }

    case "WhileStatement":
    case "DoWhileStatement": {
      const s = stmt as IRWhileStatement | IRDoWhileStatement;
      visitStatementBodyChildren(s.body, collector, enterFunctions);
      break;
    }

    case "ForStatement": {
      const s = stmt as IRForStatement;
      visitStatementBodyChildren(s.body, collector, enterFunctions);
      break;
    }

    case "ForInStatement": {
      const s = stmt as IRForInStatement;
      visitStatementBodyChildren(s.body, collector, enterFunctions);
      break;
    }

    case "SwitchStatement": {
      const s = stmt as IRSwitchStatement;
      for (const c of s.cases) {
        for (const child of c.consequent) {
          collector(child);
          visitStatementChildren(child, collector, enterFunctions);
        }
      }
      break;
    }

    case "TryStatement": {
      const s = stmt as IRTryStatement;
      for (const child of s.block.body) {
        collector(child);
        visitStatementChildren(child, collector, enterFunctions);
      }
      if (s.handler) {
        for (const child of s.handler.body.body) {
          collector(child);
          visitStatementChildren(child, collector, enterFunctions);
        }
      }
      if (s.finalizer) {
        for (const child of s.finalizer.body) {
          collector(child);
          visitStatementChildren(child, collector, enterFunctions);
        }
      }
      break;
    }
  }
}

/**
 * Вызывает collector для body (может быть block или одиночный statement).
 */
function visitStatementBodyChildren(stmt: IRStatement, collector: (stmt: IRStatement) => void, enterFunctions: boolean): void {
  collector(stmt);
  visitStatementChildren(stmt, collector, enterFunctions);
}
