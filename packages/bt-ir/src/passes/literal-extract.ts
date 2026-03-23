/**
 * Literal Extract Pass — извлечение литералов-ресиверов property/method access
 *
 * BS не поддерживает вызов методов и свойств непосредственно у литералов:
 * `"hello".length` и `[1,2,3].join(",")` — syntax error.
 *
 * Этот pass находит MemberExpression где object является Literal или
 * ArrayExpression и извлекает его во временную переменную.
 *
 * ```
 * // Before:
 * "hello".length
 * [1,2,3].join(",")
 *
 * // After:
 * var __lit0 = "hello"; __lit0.length
 * var __lit1 = [1,2,3]; __lit1.join(",")
 * ```
 *
 * @module passes/literal-extract
 */

import {
  IR,
  type IRProgram,
  type IRExpression,
  type IRStatement,
  type IRMemberExpression,
  type IRFunctionDeclaration,
  type IRBlockStatement,
  type IRIfStatement,
  type IRForStatement,
  type IRForInStatement,
  type IRWhileStatement,
  type IRDoWhileStatement,
  type IRSwitchStatement,
  type IRTryStatement,
  type IRExpressionStatement,
  type IRReturnStatement,
  type IRThrowStatement,
  type IRVariableDeclaration,
  type IREnvAssign,
  assertNever,
} from "../ir/index.ts";
import type { IRPass, PassContext } from "./types.ts";
import { mapExpression } from "./walker.ts";

// ============================================================================
// Name generator
// ============================================================================

/**
 * Простой генератор уникальных имён для extracted литералов.
 * Каждый вызов run() создаёт новый экземпляр (счётчик сбрасывается).
 */
class LitNameGen {
  private counter = 0;

  /** Генерирует следующее уникальное имя: __lit0, __lit1, ... */
  next(): string {
    return `__lit${this.counter++}`;
  }
}

// ============================================================================
// Literal receiver check
// ============================================================================

/**
 * Проверяет, является ли выражение литеральным ресивером,
 * который нужно извлечь во временную переменную.
 */
function isLiteralReceiver(expr: IRExpression): boolean {
  return expr.kind === "Literal" || expr.kind === "ArrayExpression";
}

// ============================================================================
// Expression extraction
// ============================================================================

/**
 * Контекст извлечения — собирает var declarations, которые нужно
 * вставить перед текущим statement.
 */
interface ExtractContext {
  readonly nameGen: LitNameGen;
  /** Accumulated var declarations to prepend before current statement */
  readonly pending: IRStatement[];
}

/**
 * Рекурсивно обходит expression, извлекая литеральные ресиверы
 * MemberExpression во временные переменные.
 */
function extractExpr(expr: IRExpression, ctx: ExtractContext): IRExpression {
  return mapExpression(expr, (e) => {
    if (e.kind !== "MemberExpression") return null;

    const mem = e as IRMemberExpression;

    // Рекурсивно обработать object first (может быть вложенный literal receiver)
    const newObj = extractExpr(mem.object, ctx);
    const newProp = extractExpr(mem.property, ctx);

    if (isLiteralReceiver(newObj)) {
      // Extract literal to temp var
      const tmpName = ctx.nameGen.next();
      ctx.pending.push(IR.varDecl(tmpName, newObj, newObj.loc));
      const tmpRef = IR.id(tmpName, newObj.loc);
      return IR.member(tmpRef, newProp, mem.computed, mem.loc);
    }

    // No extraction needed, but children may have changed
    if (newObj === mem.object && newProp === mem.property) return null;
    return IR.member(newObj, newProp, mem.computed, mem.loc);
  });
}

// ============================================================================
// Statement processing
// ============================================================================

/**
 * Обрабатывает expression внутри statement контекста.
 * Возвращает [prepended_vars, new_expression] или null если ничего не изменилось.
 */
function extractFromExpr(expr: IRExpression, ctx: ExtractContext): IRExpression {
  const pendingBefore = ctx.pending.length;
  const result = extractExpr(expr, ctx);
  // If nothing was extracted and expr unchanged, caller detects via reference equality
  return result;
}

/**
 * Обрабатывает один statement: извлекает литералы из expressions,
 * возвращает массив [prepended_vars..., transformed_stmt] или null если без изменений.
 */
function processStmt(stmt: IRStatement, nameGen: LitNameGen): IRStatement | IRStatement[] | null {
  const ctx: ExtractContext = { nameGen, pending: [] };

  switch (stmt.kind) {
    case "ExpressionStatement": {
      const s = stmt as IRExpressionStatement;
      const e = extractFromExpr(s.expression, ctx);
      if (ctx.pending.length === 0 && e === s.expression) return null;
      const newStmt = e === s.expression ? stmt : IR.exprStmt(e, s.loc);
      return ctx.pending.length > 0 ? [...ctx.pending, newStmt] : newStmt;
    }

    case "VariableDeclaration": {
      const s = stmt as IRVariableDeclaration;
      if (!s.init) return null;
      const e = extractFromExpr(s.init, ctx);
      if (ctx.pending.length === 0 && e === s.init) return null;
      const newStmt =
        e === s.init ? stmt : IR.varDecl(s.name, e, s.loc, s.isCaptured, s.envRef, s.hoistOnly);
      return ctx.pending.length > 0 ? [...ctx.pending, newStmt] : newStmt;
    }

    case "ReturnStatement": {
      const s = stmt as IRReturnStatement;
      if (!s.argument) return null;
      const e = extractFromExpr(s.argument, ctx);
      if (ctx.pending.length === 0 && e === s.argument) return null;
      const newStmt = e === s.argument ? stmt : IR.return(e, s.loc);
      return ctx.pending.length > 0 ? [...ctx.pending, newStmt] : newStmt;
    }

    case "ThrowStatement": {
      const s = stmt as IRThrowStatement;
      const e = extractFromExpr(s.argument, ctx);
      if (ctx.pending.length === 0 && e === s.argument) return null;
      const newStmt = e === s.argument ? stmt : IR.throw(e, s.loc);
      return ctx.pending.length > 0 ? [...ctx.pending, newStmt] : newStmt;
    }

    case "IfStatement": {
      const s = stmt as IRIfStatement;
      const newTest = extractFromExpr(s.test, ctx);
      const newCons = processStmtBody(s.consequent, nameGen);
      const newAlt = s.alternate ? processStmtBody(s.alternate, nameGen) : s.alternate;
      if (
        ctx.pending.length === 0 &&
        newTest === s.test &&
        newCons === s.consequent &&
        newAlt === s.alternate
      ) {
        return null;
      }
      const newStmt = IR.if(newTest, newCons, newAlt, s.loc);
      return ctx.pending.length > 0 ? [...ctx.pending, newStmt] : newStmt;
    }

    case "WhileStatement": {
      const s = stmt as IRWhileStatement;
      // Don't extract from test — it re-evaluates each iteration
      const newBody = processStmtBody(s.body, nameGen);
      if (newBody === s.body) return null;
      return IR.while(s.test, newBody, s.loc);
    }

    case "DoWhileStatement": {
      const s = stmt as IRDoWhileStatement;
      // Don't extract from test — it re-evaluates each iteration
      const newBody = processStmtBody(s.body, nameGen);
      if (newBody === s.body) return null;
      return IR.doWhile(newBody, s.test, s.loc);
    }

    case "ForStatement": {
      const s = stmt as IRForStatement;
      // Extract from init only (test/update re-evaluate each iteration)
      let newInit = s.init;
      if (s.init) {
        if (s.init.kind === "VariableDeclaration") {
          const vd = s.init as IRVariableDeclaration;
          if (vd.init) {
            const e = extractFromExpr(vd.init, ctx);
            if (e !== vd.init) {
              newInit = IR.varDecl(vd.name, e, vd.loc, vd.isCaptured, vd.envRef, vd.hoistOnly);
            }
          }
        } else {
          const e = extractFromExpr(s.init as IRExpression, ctx);
          if (e !== s.init) newInit = e;
        }
      }
      const newBody = processStmtBody(s.body, nameGen);
      if (ctx.pending.length === 0 && newInit === s.init && newBody === s.body) return null;
      const newStmt = IR.for(newInit, s.test, s.update, newBody, s.loc);
      return ctx.pending.length > 0 ? [...ctx.pending, newStmt] : newStmt;
    }

    case "ForInStatement": {
      const s = stmt as IRForInStatement;
      const newRight = extractFromExpr(s.right, ctx);
      const newBody = processStmtBody(s.body, nameGen);
      if (ctx.pending.length === 0 && newRight === s.right && newBody === s.body) return null;
      const newStmt = IR.forIn(s.left, newRight, newBody, s.loc);
      return ctx.pending.length > 0 ? [...ctx.pending, newStmt] : newStmt;
    }

    case "SwitchStatement": {
      const s = stmt as IRSwitchStatement;
      const newDisc = extractFromExpr(s.discriminant, ctx);
      let casesChanged = false;
      const newCases = s.cases.map((c) => {
        const newCons = processBody(c.consequent, nameGen);
        if (newCons !== c.consequent) {
          casesChanged = true;
          return IR.case(c.test, newCons);
        }
        return c;
      });
      if (ctx.pending.length === 0 && newDisc === s.discriminant && !casesChanged) return null;
      const newStmt = IR.switch(newDisc, casesChanged ? newCases : s.cases, s.loc);
      return ctx.pending.length > 0 ? [...ctx.pending, newStmt] : newStmt;
    }

    case "TryStatement": {
      const s = stmt as IRTryStatement;
      const newBlock = processBlock(s.block, nameGen);
      const newHandler = s.handler
        ? (() => {
            const newBody = processBlock(s.handler!.body, nameGen);
            return newBody === s.handler!.body ? s.handler! : IR.catch(s.handler!.param, newBody);
          })()
        : null;
      const newFinalizer = s.finalizer ? processBlock(s.finalizer, nameGen) : s.finalizer;
      if (newBlock === s.block && newHandler === s.handler && newFinalizer === s.finalizer) {
        return null;
      }
      return IR.try(newBlock, newHandler, newFinalizer, s.loc);
    }

    case "FunctionDeclaration": {
      const s = stmt as IRFunctionDeclaration;
      const newBody = processBody(s.body, nameGen);
      if (newBody === s.body) return null;
      return IR.functionDecl(s.name, s.originalParams, newBody, s.loc, s.plainSignature);
    }

    case "BlockStatement": {
      const s = stmt as IRBlockStatement;
      const newBody = processBody(s.body, nameGen);
      return newBody === s.body ? null : IR.block(newBody, s.loc);
    }

    case "EnvDeclaration":
      return null;

    case "EnvAssign": {
      const s = stmt as IREnvAssign;
      const e = extractFromExpr(s.value, ctx);
      if (ctx.pending.length === 0 && e === s.value) return null;
      const newStmt = e === s.value ? stmt : IR.envAssign(s.envName, s.key, e, s.loc);
      return ctx.pending.length > 0 ? [...ctx.pending, newStmt] : newStmt;
    }

    case "BreakStatement":
    case "ContinueStatement":
    case "EmptyStatement":
      return null;

    case "CaseClause":
      // Handled in SwitchStatement
      return null;

    default:
      return assertNever(stmt as never);
  }
}

// ============================================================================
// Body/block helpers
// ============================================================================

/**
 * Обрабатывает список statements, применяя literal extraction к каждому.
 */
function processBody(stmts: IRStatement[], nameGen: LitNameGen): IRStatement[] {
  let changed = false;
  const result: IRStatement[] = [];

  for (const stmt of stmts) {
    const processed = processStmt(stmt, nameGen);
    if (processed === null) {
      result.push(stmt);
    } else {
      changed = true;
      if (Array.isArray(processed)) {
        result.push(...processed);
      } else {
        result.push(processed);
      }
    }
  }

  return changed ? result : stmts;
}

/** Обрабатывает statement, который может быть блоком или одиночным statement */
function processStmtBody(stmt: IRStatement, nameGen: LitNameGen): IRStatement {
  if (stmt.kind === "BlockStatement") {
    return processBlock(stmt as IRBlockStatement, nameGen);
  }
  const processed = processStmt(stmt, nameGen);
  if (processed === null) return stmt;
  if (Array.isArray(processed)) {
    return processed.length === 1 ? processed[0] : IR.block(processed);
  }
  return processed;
}

/** Обрабатывает BlockStatement, сохраняя обёртку */
function processBlock(block: IRBlockStatement, nameGen: LitNameGen): IRBlockStatement {
  const newBody = processBody(block.body, nameGen);
  return newBody === block.body ? block : IR.block(newBody, block.loc);
}

// ============================================================================
// Pass definition
// ============================================================================

/**
 * Literal Extract pass — извлекает литеральные ресиверы property/method access.
 *
 * Должен выполняться после comma-safety и перед cleanup-grouping.
 * Сгенерированные temp vars будут hoisted pass'ом hoist.
 */
export const literalExtractPass: IRPass = {
  name: "literal-extract",
  dependsOn: ["comma-safety"],
  run(program: IRProgram, _ctx: PassContext): IRProgram {
    const nameGen = new LitNameGen();
    const newBody = processBody(program.body, nameGen);
    return newBody === program.body ? program : { ...program, body: newBody };
  },
};
