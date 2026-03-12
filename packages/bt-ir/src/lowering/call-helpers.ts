/**
 * Call Helpers — консолидированные хелперы для method call dispatch
 *
 * Объединяет 8 вариантов optional-chain комбинаций (property/element access × 4 optional варианта)
 * в единую функцию `dispatchMethodCall`. Также содержит хелперы для super-вызовов.
 *
 * @module lowering/call-helpers
 */

import { IR, type IRExpression, type IRIdentifier, type SourceLocation } from "../ir/index.ts";
import type { VisitorContext } from "./visitor.ts";
import { createOptionalCheck, chainOptionalAccess } from "./expressions.ts";

// ============================================================================
// Optional function call
// ============================================================================

/**
 * Создаёт optional function call: проверяет bt.isFunction, затем вызывает.
 *
 * Паттерн: `bt.isFunction(method) ? bt.callFunction(method, args) : undefined`
 *
 * Для эффективности кладём method во временную переменную,
 * чтобы не вычислять его дважды.
 *
 * @param methodExpr - IR выражение метода
 * @param args - Аргументы вызова
 * @param ctx - VisitorContext
 * @param loc - Местоположение в исходнике
 */
export function createOptionalFunctionCall(
  methodExpr: IRExpression,
  args: IRExpression[],
  ctx: VisitorContext,
  loc?: SourceLocation,
): IRExpression {
  const tempName = ctx.bindings.create("tmp");
  ctx.pendingStatements.push(IR.varDecl(tempName, null));
  const tempRef = IR.id(tempName);

  const assignExpr = IR.assign("=", IR.id(tempName) as IRIdentifier, methodExpr);
  const check = IR.btIsFunction(IR.grouping(assignExpr));

  return IR.conditional(check, IR.btCallFunction(tempRef, args, loc), IR.id("undefined"), loc);
}

// ============================================================================
// Unified method call dispatch
// ============================================================================

/**
 * Унифицированный диспатч method call с поддержкой всех optional-chain комбинаций.
 *
 * Обрабатывает 4 варианта:
 * - `obj.method()` / `obj["method"]()` — обычный вызов
 * - `obj?.method()` / `obj?.["method"]()` — optional на объекте
 * - `obj.method?.()` / `obj["method"]?.()` — optional на вызове
 * - `obj?.method?.()` / `obj?.["method"]?.()` — оба optional
 *
 * @param obj - IR выражение объекта
 * @param prop - IR выражение свойства (IR.string("name") или computed)
 * @param args - Аргументы вызова
 * @param propOptional - Есть ли `?.` на доступе к свойству
 * @param callOptional - Есть ли `?.` на вызове
 * @param ctx - VisitorContext
 * @param loc - Местоположение в исходнике
 */
export function dispatchMethodCall(
  obj: IRExpression,
  prop: IRExpression,
  args: IRExpression[],
  propOptional: boolean,
  callOptional: boolean,
  ctx: VisitorContext,
  loc?: SourceLocation,
): IRExpression {
  /**
   * Создаёт вызов метода по ссылке на объект.
   * Если callOptional — проверяет bt.isFunction перед вызовом.
   */
  const buildCall = (ref: IRExpression): IRExpression => {
    const method = IR.btGetProperty(ref, prop);
    return callOptional
      ? createOptionalFunctionCall(method, args, ctx, loc)
      : IR.btCallFunction(method, args, loc);
  };

  if (propOptional) {
    // obj?.method() / obj?.method?.()
    return createOptionalCheck(obj, buildCall, ctx, loc);
  }

  // obj.method() / obj.method?.()
  return chainOptionalAccess(obj, false, buildCall, ctx, loc);
}
