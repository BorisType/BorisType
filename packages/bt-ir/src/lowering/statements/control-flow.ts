/**
 * Control-flow visitors — if, switch, try/catch/finally
 *
 * Содержит:
 * - visitIfStatement
 * - visitSwitchStatement
 * - visitTryStatement + desugarTryFinally
 * - transformReturns* (try-finally desugaring helpers)
 *
 * @module lowering/statements/control-flow
 */

import * as ts from "typescript";
import {
  IR,
  type IRStatement,
  type IRIdentifier,
  type IRBlockStatement,
  type IRReturnStatement,
} from "../../ir/index.ts";
import type { VisitorContext } from "../visitor.ts";
import { visitExpression } from "../expressions.ts";
import { getLoc } from "../helpers.ts";
import { visitBlock, visitStatementList, visitStatementAsBlock } from "./blocks.ts";

// ============================================================================
// Control flow statements
// ============================================================================

/**
 * Обрабатывает if statement
 */
export function visitIfStatement(node: ts.IfStatement, ctx: VisitorContext): IRStatement {
  const test = visitExpression(node.expression, ctx);
  const consequent = visitStatementAsBlock(node.thenStatement, ctx);
  const alternate = node.elseStatement
    ? ts.isIfStatement(node.elseStatement)
      ? visitIfStatement(node.elseStatement, ctx)
      : visitStatementAsBlock(node.elseStatement, ctx)
    : null;

  return IR.if(test, consequent, alternate, getLoc(node, ctx));
}

/**
 * Обрабатывает switch statement
 */
export function visitSwitchStatement(node: ts.SwitchStatement, ctx: VisitorContext): IRStatement {
  const discriminant = visitExpression(node.expression, ctx);
  const cases = node.caseBlock.clauses.map((clause) => {
    const test = ts.isCaseClause(clause) ? visitExpression(clause.expression, ctx) : null;
    const consequent = visitStatementList(clause.statements, ctx);
    return IR.case(test, consequent);
  });

  return IR.switch(discriminant, cases, getLoc(node, ctx));
}

/**
 * Обрабатывает try statement.
 *
 * Когда присутствует finally блок, выполняется десахаризация,
 * поскольку нативный finally в BorisScript работает некорректно.
 *
 * Паттерн: state machine с переменными __fType (тип завершения)
 * и __fVal (значение завершения).
 *
 * Типы завершения:
 * - 0 = normal (по умолчанию)
 * - 1 = return (return из try/catch, dispatch после finally)
 * - 2 = throw (исключение)
 * - (зарезервировано: 3 = break, 4 = continue)
 *
 * **try-finally (без catch):**
 * ```
 * var __fType = 0;
 * var __fVal;
 * try { T } catch (__fc) { __fType = 2; __fVal = __fc; }
 * F  // finally body
 * if (__fType === 2) { throw __fVal; }
 * ```
 *
 * **try-catch-finally:**
 * ```
 * var __fType = 0;
 * var __fVal;
 * try { T } catch (__fc) {
 *   __fType = 2; __fVal = __fc;
 *   try {
 *     var e = __fc; __fType = 0; __fVal = undefined;
 *     C  // user catch body
 *   } catch (__fc2) { __fType = 2; __fVal = __fc2; }
 * }
 * F  // finally body
 * if (__fType === 2) { throw __fVal; }
 * ```
 */
export function visitTryStatement(
  node: ts.TryStatement,
  ctx: VisitorContext,
): IRStatement | IRStatement[] {
  // Без finally — стандартная трансформация, нативный try-catch работает корректно
  if (!node.finallyBlock) {
    const block = visitBlock(node.tryBlock, ctx);

    let handler: import("../../ir/index.js").IRCatchClause | null = null;
    if (node.catchClause) {
      const param = node.catchClause.variableDeclaration
        ? ts.isIdentifier(node.catchClause.variableDeclaration.name)
          ? node.catchClause.variableDeclaration.name.text
          : null
        : null;
      const body = visitBlock(node.catchClause.block, ctx);
      handler = IR.catch(param, body);
    }

    return IR.try(block, handler, null, getLoc(node, ctx));
  }

  // === Десахаризация try-catch-finally ===
  return desugarTryFinally(node, ctx);
}

// ============================================================================
// try-finally desugaring
// ============================================================================

/**
 * Десахаризация try-catch-finally через state machine.
 *
 * Генерирует последовательность IR statements, имитирующую finally-семантику
 * с помощью только try-catch конструкций.
 *
 * Return statements внутри try/catch тел заменяются на throw-sentinel:
 * `return expr` → `__fType = 1; __fVal = expr; throw __fVal;`
 *
 * В outer catch проверяется __fType для различения return-sentinel от реальных ошибок.
 * После finally-блока добавляется dispatch: `if (__fType === 1) return __fVal;`
 */
function desugarTryFinally(node: ts.TryStatement, ctx: VisitorContext): IRStatement[] {
  const loc = getLoc(node, ctx);
  const fType = ctx.bindings.create("fType");
  const fVal = ctx.bindings.create("fVal");
  const fc = ctx.bindings.create("fc");

  const result: IRStatement[] = [];

  // var __fType = 0;
  result.push(IR.varDecl(fType, IR.number(0)));
  // var __fVal;
  result.push(IR.varDecl(fVal, null));

  // Тело try блока (с трансформацией return → throw sentinel)
  const tryBlock = transformReturnsInBlock(visitBlock(node.tryBlock, ctx), fType, fVal);

  // Statements для outer catch: __fType = 2; __fVal = __fc;
  const setThrowState: IRStatement[] = [
    IR.exprStmt(IR.assign("=", IR.id(fType) as IRIdentifier, IR.number(2))),
    IR.exprStmt(IR.assign("=", IR.id(fVal) as IRIdentifier, IR.id(fc))),
  ];

  let outerCatchBody: IRStatement[];

  if (node.catchClause) {
    // === try-catch-finally: пользователь имеет catch блок ===
    const userParam = node.catchClause.variableDeclaration
      ? ts.isIdentifier(node.catchClause.variableDeclaration.name)
        ? node.catchClause.variableDeclaration.name.text
        : null
      : null;

    // Трансформируем return в user catch body тоже
    const userCatchBlock = transformReturnsInBlock(
      visitBlock(node.catchClause.block, ctx),
      fType,
      fVal,
    );

    // Тело внутреннего try: var e = __fc; __fType = 0; __fVal = undefined; C
    const innerTryBody: IRStatement[] = [];
    if (userParam) {
      innerTryBody.push(IR.varDecl(userParam, IR.id(fc)));
    }
    // Сбрасываем state — catch обрабатывает ошибку
    innerTryBody.push(IR.exprStmt(IR.assign("=", IR.id(fType) as IRIdentifier, IR.number(0))));
    innerTryBody.push(IR.exprStmt(IR.assign("=", IR.id(fVal) as IRIdentifier, IR.id("undefined"))));
    innerTryBody.push(...userCatchBlock.body);

    // Внутренний catch: перехват ошибок/sentinel из пользовательского catch
    const fc2 = ctx.bindings.create("fc");
    const innerCatchBody: IRStatement[] = [
      // Если __fType !== 1 (не return sentinel) — это реальная ошибка из catch body
      IR.if(
        IR.binary("!==", IR.id(fType), IR.number(1)),
        IR.block([
          IR.exprStmt(IR.assign("=", IR.id(fType) as IRIdentifier, IR.number(2))),
          IR.exprStmt(IR.assign("=", IR.id(fVal) as IRIdentifier, IR.id(fc2))),
        ]),
      ),
    ];

    // Outer catch body:
    // Если __fType === 1 (return sentinel из try) — пропускаем user catch
    // Иначе — сохраняем ошибку и запускаем user catch через inner try-catch
    outerCatchBody = [
      IR.if(
        IR.binary("!==", IR.id(fType), IR.number(1)),
        IR.block([
          ...setThrowState,
          IR.try(IR.block(innerTryBody), IR.catch(fc2, IR.block(innerCatchBody)), null),
        ]),
      ),
    ];
  } else {
    // === try-finally (без catch): ===
    // Если __fType !== 1 (не return sentinel) — запоминаем ошибку
    outerCatchBody = [IR.if(IR.binary("!==", IR.id(fType), IR.number(1)), IR.block(setThrowState))];
  }

  // Основной try-catch (без finally)
  result.push(IR.try(tryBlock, IR.catch(fc, IR.block(outerCatchBody)), null, loc));

  // Finally body — инлайним (всегда выполняется)
  // Return в finally — обычный return, перезаписывает всё (корректная JS-семантика)
  const finallyBlock = visitBlock(node.finallyBlock!, ctx);
  result.push(...finallyBlock.body);

  // Dispatch: if (__fType === 1) { return __fVal; }
  result.push(
    IR.if(IR.binary("===", IR.id(fType), IR.number(1)), IR.block([IR.return(IR.id(fVal))])),
  );
  // Dispatch: if (__fType === 2) { throw __fVal; }
  result.push(
    IR.if(IR.binary("===", IR.id(fType), IR.number(2)), IR.block([IR.throw(IR.id(fVal))])),
  );

  return result;
}

// ============================================================================
// Return → throw sentinel transformation for try-finally desugaring
// ============================================================================

/**
 * Заменяет `return expr` → `__fType = 1; __fVal = expr; throw __fVal;`
 * рекурсивно внутри блока. Не заходит в объявления функций.
 */
function transformReturnsInBlock(
  block: IRBlockStatement,
  fType: string,
  fVal: string,
): IRBlockStatement {
  const newBody = transformReturnsInList(block.body, fType, fVal);
  return newBody === block.body ? block : IR.block(newBody, block.loc);
}

/**
 * Обрабатывает список statements: заменяет return на sentinel-последовательность
 * (1 statement → 2-3 statements), рекурсивно обходит составные statements.
 */
function transformReturnsInList(stmts: IRStatement[], fType: string, fVal: string): IRStatement[] {
  let changed = false;
  const result: IRStatement[] = [];

  for (const stmt of stmts) {
    if (stmt.kind === "ReturnStatement") {
      changed = true;
      const ret = stmt as IRReturnStatement;
      result.push(IR.exprStmt(IR.assign("=", IR.id(fType) as IRIdentifier, IR.number(1))));
      if (ret.argument) {
        result.push(IR.exprStmt(IR.assign("=", IR.id(fVal) as IRIdentifier, ret.argument)));
      }
      result.push(IR.throw(IR.id(fVal)));
    } else {
      const transformed = transformReturnsInStmt(stmt, fType, fVal);
      if (transformed !== stmt) changed = true;
      result.push(transformed);
    }
  }

  return changed ? result : stmts;
}

/**
 * Рекурсивно обходит составной statement (if/while/for/switch/try/block),
 * заменяя вложенные return на sentinel. Не заходит в FunctionDeclaration.
 */
function transformReturnsInStmt(stmt: IRStatement, fType: string, fVal: string): IRStatement {
  switch (stmt.kind) {
    case "FunctionDeclaration":
      return stmt;

    case "BlockStatement": {
      return transformReturnsInBlock(stmt as IRBlockStatement, fType, fVal);
    }

    case "IfStatement": {
      const s = stmt as import("../../ir/index.ts").IRIfStatement;
      const cons = transformReturnsInBody(s.consequent, fType, fVal);
      const alt = s.alternate ? transformReturnsInBody(s.alternate, fType, fVal) : s.alternate;
      if (cons === s.consequent && alt === s.alternate) return stmt;
      return IR.if(s.test, cons, alt, s.loc);
    }

    case "WhileStatement": {
      const s = stmt as import("../../ir/index.ts").IRWhileStatement;
      const body = transformReturnsInBody(s.body, fType, fVal);
      return body === s.body ? stmt : IR.while(s.test, body, s.loc);
    }

    case "DoWhileStatement": {
      const s = stmt as import("../../ir/index.ts").IRDoWhileStatement;
      const body = transformReturnsInBody(s.body, fType, fVal);
      return body === s.body ? stmt : IR.doWhile(body, s.test, s.loc);
    }

    case "ForStatement": {
      const s = stmt as import("../../ir/index.ts").IRForStatement;
      const body = transformReturnsInBody(s.body, fType, fVal);
      return body === s.body ? stmt : IR.for(s.init, s.test, s.update, body, s.loc);
    }

    case "ForInStatement": {
      const s = stmt as import("../../ir/index.ts").IRForInStatement;
      const body = transformReturnsInBody(s.body, fType, fVal);
      return body === s.body ? stmt : IR.forIn(s.left, s.right, body, s.loc);
    }

    case "SwitchStatement": {
      const s = stmt as import("../../ir/index.ts").IRSwitchStatement;
      let changed = false;
      const newCases = s.cases.map((c) => {
        const newConsequent = transformReturnsInList(c.consequent, fType, fVal);
        if (newConsequent !== c.consequent) changed = true;
        return newConsequent === c.consequent ? c : IR.case(c.test, newConsequent);
      });
      return changed ? IR.switch(s.discriminant, newCases, s.loc) : stmt;
    }

    case "TryStatement": {
      const s = stmt as import("../../ir/index.ts").IRTryStatement;
      const newBlock = transformReturnsInBlock(s.block, fType, fVal);
      const newHandler = s.handler
        ? (() => {
            const newBody = transformReturnsInBlock(s.handler!.body, fType, fVal);
            return newBody === s.handler!.body ? s.handler : IR.catch(s.handler!.param, newBody);
          })()
        : null;
      const newFinalizer = s.finalizer
        ? transformReturnsInBlock(s.finalizer, fType, fVal)
        : s.finalizer;
      if (newBlock === s.block && newHandler === s.handler && newFinalizer === s.finalizer)
        return stmt;
      return IR.try(newBlock, newHandler, newFinalizer, s.loc);
    }

    default:
      return stmt;
  }
}

/**
 * Трансформирует одиночный statement-or-block (тело if/while/for).
 * Если это ReturnStatement — оборачивает sentinel-последовательность в блок.
 */
function transformReturnsInBody(stmt: IRStatement, fType: string, fVal: string): IRStatement {
  if (stmt.kind === "ReturnStatement") {
    const ret = stmt as IRReturnStatement;
    const sentinel: IRStatement[] = [
      IR.exprStmt(IR.assign("=", IR.id(fType) as IRIdentifier, IR.number(1))),
    ];
    if (ret.argument) {
      sentinel.push(IR.exprStmt(IR.assign("=", IR.id(fVal) as IRIdentifier, ret.argument)));
    }
    sentinel.push(IR.throw(IR.id(fVal)));
    return IR.block(sentinel);
  }
  if (stmt.kind === "BlockStatement") {
    return transformReturnsInBlock(stmt as IRBlockStatement, fType, fVal);
  }
  return transformReturnsInStmt(stmt, fType, fVal);
}
