/**
 * Call Expression Visitors — обработка вызовов функций и конструкторов
 *
 * Содержит:
 * - visitCallExpression (function/method calls)
 * - visitNewExpression (constructor calls)
 *
 * @module lowering/expressions/calls
 */

import * as ts from "typescript";
import { IR, type IRExpression } from "../../ir/index.ts";
import type { VisitorContext } from "../visitor.ts";
import { getLoc, resolveVariableInScope } from "../helpers.ts";
import { visitExpression, maybeExtract } from "./dispatch.ts";

// ============================================================================
// Call expressions
// ============================================================================

/**
 * Обрабатывает call expression
 */
export function visitCallExpression(node: ts.CallExpression, ctx: VisitorContext): IRExpression {
  const args = node.arguments.map((arg) => maybeExtract(visitExpression(arg, ctx), ctx));
  const loc = getLoc(node, ctx);

  // obj.method() / obj?.method() / obj.method?.() / obj?.method?.()
  if (ts.isPropertyAccessExpression(node.expression)) {
    const methodName = node.expression.name.text;
    const targetExpr = node.expression.expression;

    const obj = visitExpression(targetExpr, ctx);
    const propHasQuestionDot = !!node.expression.questionDotToken; // obj?.method
    const callHasQuestionDot = !!node.questionDotToken; // method?.()

    if (propHasQuestionDot || callHasQuestionDot) return IR.id("__invalid__", loc);
    return IR.call(IR.dot(obj, methodName, getLoc(node.expression, ctx)), args, loc);
  }

  // obj["method"]() / obj?.["method"]() / obj["method"]?.()
  if (ts.isElementAccessExpression(node.expression)) {
    const targetExpr = node.expression.expression;
    const obj = visitExpression(targetExpr, ctx);
    const prop = visitExpression(node.expression.argumentExpression, ctx);
    const propHasQuestionDot = !!node.expression.questionDotToken;
    const callHasQuestionDot = !!node.questionDotToken;

    if (propHasQuestionDot || callHasQuestionDot) return IR.id("__invalid__", loc);
    return IR.call(IR.member(obj, prop, true), args, loc);
  }

  if (ts.isIdentifier(node.expression)) {
    const funcName = node.expression.text;

    const actualName = resolveVariableInScope(funcName, ctx.currentScope)?.renamedTo ?? funcName;
    return IR.call(IR.id(actualName), args, loc);
  }

  return IR.call(visitExpression(node.expression, ctx), args, loc);
}

// ============================================================================
// New expressions
// ============================================================================

/**
 * В режиме с прямыми вызовами new expression преобразуется в вызов функции.
 */
export function visitNewExpression(node: ts.NewExpression, ctx: VisitorContext): IRExpression {
  const args = node.arguments?.map((arg) => visitExpression(arg, ctx)) ?? [];
  const loc = getLoc(node, ctx);
  const callee = visitExpression(node.expression, ctx);
  return IR.call(callee, args, loc);
}
