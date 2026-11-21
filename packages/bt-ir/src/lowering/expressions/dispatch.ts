/**
 * Expression Dispatcher — главный visitExpression и shared utilities
 *
 * Содержит:
 * - visitExpression (main dispatch)
 * - maybeExtract (safe inline extraction)
 * - unwrapTypeExpressions
 *
 * @module lowering/expressions/dispatch
 */

import * as ts from "typescript";
import { IR, type IRExpression } from "../../ir/index.ts";
import type { VisitorContext } from "../visitor.ts";
import { getLoc, isInternalAccess } from "../helpers.ts";
import { createBtDiagnostic, BtDiagnosticCode } from "../../pipeline/diagnostics.ts";

// Lazy imports для разрыва циклических зависимостей:
// visitExpression вызывает функции из sub-modules, и sub-modules импортируют visitExpression.
// TypeScript это поддерживает при условии, что к моменту вызова модуль уже загружен.
// Здесь используем прямые import — ES modules гарантируют разрешение к моменту runtime.
import { visitBinaryExpression, visitPrefixUnaryExpression, visitPostfixUnaryExpression } from "./operators.ts";
import { visitCallExpression, visitNewExpression } from "./calls.ts";
import { visitIdentifier, visitTemplateExpression, visitObjectLiteral, visitArrayLiteral } from "./literals.ts";

// ============================================================================
// Shared utilities
// ============================================================================

/**
 * Нормализует числовой литерал в десятичную строку без потери точности.
 * Конвертирует hex/octal/binary и убирает separators.
 *
 * @param text - текст числового литерала из TS AST (уже без separators)
 */
function normalizeNumericLiteral(text: string): string {
  // Дробные и экспоненциальные — Number() не теряет точности для них
  if (text.includes(".") || text.includes("e") || text.includes("E")) {
    return String(Number(text));
  }
  // Целые: hex (0x), octal (0o), binary (0b) — конвертируем в десятичную через BigInt
  if (/^0[xXoObB]/.test(text)) {
    return String(BigInt(text));
  }
  // Обычные десятичные целые — оставляем как есть (точность уже в строке)
  return text;
}

/**
 * Проверяет, небезопасно ли инлайнить выражение внутри бинарных/логических операций.
 *
 * BorisScript парсит операторы строго слева направо (без приоритетов),
 * поэтому `ConditionalExpression` (ternary `? :`) и `LogicalExpression`
 * с вложенными conditional внутри бинарного оператора приводят к некорректному парсингу.
 *
 * @param expr - IR выражение для проверки
 * @returns true если выражение нужно извлекать во временную переменную
 */
function isUnsafeInlineExpression(expr: IRExpression): boolean {
  return expr.kind === "ConditionalExpression";
}

/**
 * Извлекает сложное выражение во временную переменную если оно небезопасно для инлайна.
 *
 * @param expr - IR выражение, потенциально сложное
 * @param ctx - VisitorContext для доступа к pendingStatements и bindings
 * @returns Безопасное для инлайна IR выражение (идентификатор или исходное выражение)
 */
export function maybeExtract(expr: IRExpression, ctx: VisitorContext): IRExpression {
  if (!isUnsafeInlineExpression(expr)) {
    return expr;
  }

  const tmpName = ctx.bindings.create("oc");
  ctx.pendingStatements.push(IR.varDecl(tmpName, null));
  ctx.pendingStatements.push(IR.exprStmt(IR.assign("=", IR.id(tmpName) as import("../../ir/index.ts").IRIdentifier, expr)));
  return IR.id(tmpName);
}

/**
 * Снимает TypeScript-only обёртки (as T, x!, satisfies T) с выражения.
 * Возвращает «чистое» runtime-выражение.
 */
function unwrapTypeExpressions(node: ts.Expression): ts.Expression {
  let current = node;
  while (
    ts.isAsExpression(current) ||
    ts.isNonNullExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isTypeAssertionExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

// ============================================================================
// Main expression dispatcher
// ============================================================================

/**
 * Обрабатывает expression
 */
export function visitExpression(node: ts.Expression, ctx: VisitorContext): IRExpression {
  // Identifier
  if (ts.isIdentifier(node)) {
    return visitIdentifier(node, ctx);
  }

  // Literals
  if (ts.isStringLiteral(node)) {
    return IR.string(node.text, getLoc(node, ctx));
  }

  if (ts.isNumericLiteral(node)) {
    // node.text уже lossy для больших чисел — берём оригинальный текст из source
    const text = node.getText(ctx.sourceFile).replace(/_/g, "");
    const raw = normalizeNumericLiteral(text);
    return IR.literal(Number(raw), raw, getLoc(node, ctx));
  }

  if (node.kind === ts.SyntaxKind.TrueKeyword) {
    return IR.bool(true, getLoc(node, ctx));
  }

  if (node.kind === ts.SyntaxKind.FalseKeyword) {
    return IR.bool(false, getLoc(node, ctx));
  }

  if (node.kind === ts.SyntaxKind.NullKeyword) {
    return IR.null(getLoc(node, ctx));
  }

  // Template literal
  if (ts.isTemplateExpression(node)) {
    return visitTemplateExpression(node, ctx);
  }

  if (ts.isNoSubstitutionTemplateLiteral(node)) {
    return IR.string(node.text, getLoc(node, ctx));
  }

  // Binary expression
  if (ts.isBinaryExpression(node)) {
    return visitBinaryExpression(node, ctx);
  }

  // Unary expression (prefix)
  if (ts.isPrefixUnaryExpression(node)) {
    return visitPrefixUnaryExpression(node, ctx);
  }

  // Unary expression (postfix)
  if (ts.isPostfixUnaryExpression(node)) {
    return visitPostfixUnaryExpression(node, ctx);
  }

  // Conditional expression — maybeExtract для condition и веток
  if (ts.isConditionalExpression(node)) {
    const condition = maybeExtract(visitExpression(node.condition, ctx), ctx);
    const whenTrue = maybeExtract(visitExpression(node.whenTrue, ctx), ctx);
    const whenFalse = maybeExtract(visitExpression(node.whenFalse, ctx), ctx);
    return IR.conditional(condition, whenTrue, whenFalse, getLoc(node, ctx));
  }

  // Call expression
  if (ts.isCallExpression(node)) {
    return visitCallExpression(node, ctx);
  }

  // Property access (a.b) / Optional property access (a?.b)
  if (ts.isPropertyAccessExpression(node)) {
    const propName = node.name.text;

    if (ts.isMetaProperty(node.expression) && node.expression.name.text === "meta") {
      return IR.id("__invalid__", getLoc(node, ctx));
    }

    const obj = visitExpression(node.expression, ctx);
    const hasQuestionDot = !!node.questionDotToken;
    const loc = getLoc(node, ctx);

    // Если объект — __env или начинается с __, оставляем как есть
    if (isInternalAccess(node.expression)) {
      return IR.dot(obj, propName, loc);
    }

    if (hasQuestionDot) return IR.id("__invalid__", loc);
    return IR.dot(obj, propName, loc);
  }

  // Element access (a[b]) / Optional element access (a?.[b])
  if (ts.isElementAccessExpression(node)) {
    const obj = visitExpression(node.expression, ctx);
    const prop = visitExpression(node.argumentExpression, ctx);
    const hasQuestionDot = !!node.questionDotToken;
    const loc = getLoc(node, ctx);

    if (isInternalAccess(node.expression)) {
      return IR.member(obj, prop, true, loc);
    }

    if (hasQuestionDot) return IR.id("__invalid__", loc);
    return IR.member(obj, prop, true, loc);
  }

  // Object literal
  if (ts.isObjectLiteralExpression(node)) {
    return visitObjectLiteral(node, ctx);
  }

  // Array literal
  if (ts.isArrayLiteralExpression(node)) {
    return visitArrayLiteral(node, ctx);
  }

  // Arrow function
  if (ts.isArrowFunction(node)) {
    return ctx.config.visitors.arrowFunction(node, ctx);
  }

  // Function expression
  if (ts.isFunctionExpression(node)) {
    return ctx.config.visitors.functionExpression(node, ctx);
  }

  // Parenthesized expression — сохраняем скобки (MDN precedence 18)
  if (ts.isParenthesizedExpression(node)) {
    const inner = unwrapTypeExpressions(node.expression);
    // Если после снятия типовых обёрток осталось простое выражение — скобки не нужны
    if (ts.isIdentifier(inner) || ts.isPropertyAccessExpression(inner) || ts.isElementAccessExpression(inner)) {
      return visitExpression(inner, ctx);
    }
    return IR.grouping(visitExpression(inner, ctx), getLoc(node, ctx));
  }

  // Non-null assertion (expr!) — compile-time only, pass through inner expression
  if (ts.isNonNullExpression(node)) {
    return visitExpression(node.expression, ctx);
  }

  // New expression
  if (ts.isNewExpression(node)) {
    return visitNewExpression(node, ctx);
  }

  // TypeOf expression
  if (ts.isTypeOfExpression(node)) {
    return IR.unary("typeof", visitExpression(node.expression, ctx), true, getLoc(node, ctx));
  }

  // Void expression
  if (ts.isVoidExpression(node)) {
    return IR.unary("void", visitExpression(node.expression, ctx), true, getLoc(node, ctx));
  }

  // Delete expression
  if (ts.isDeleteExpression(node)) {
    return IR.unary("delete", visitExpression(node.expression, ctx), true, getLoc(node, ctx));
  }

  // This keyword
  if (node.kind === ts.SyntaxKind.ThisKeyword) {
    return IR.id("this", getLoc(node, ctx));
  }

  // Type assertion (as T) — strip type, return inner expression
  if (ts.isAsExpression(node)) {
    return visitExpression(node.expression, ctx);
  }

  ctx.diagnostics.push(
    createBtDiagnostic(
      ctx.sourceFile,
      node,
      `Unhandled expression: ${ts.SyntaxKind[node.kind]}`,
      ts.DiagnosticCategory.Error,
      BtDiagnosticCode.UnhandledExpression,
    ),
  );
  return IR.id("__unknown__", getLoc(node, ctx));
}
