/**
 * Expression Dispatcher — главный visitExpression и shared utilities
 *
 * Содержит:
 * - visitExpression (main dispatch)
 * - maybeExtract (safe inline extraction)
 * - isOptionalChainResult, extractOptionalChainTempName
 * - createOptionalCheck, chainOptionalAccess
 * - unwrapTypeExpressions
 *
 * @module lowering/expressions/dispatch
 */

import * as ts from "typescript";
import { IR, type IRExpression } from "../../ir/index.ts";
import type { VisitorContext } from "../visitor.ts";
import { getLoc, isInternalAccess, isXmlRelatedType } from "../helpers.ts";
import { createBtDiagnostic, BtDiagnosticCode } from "../../pipeline/diagnostics.ts";

// Lazy imports для разрыва циклических зависимостей:
// visitExpression вызывает функции из sub-modules, и sub-modules импортируют visitExpression.
// TypeScript это поддерживает при условии, что к моменту вызова модуль уже загружен.
// Здесь используем прямые import — ES modules гарантируют разрешение к моменту runtime.
import { visitBinaryExpression, visitPrefixUnaryExpression, visitPostfixUnaryExpression } from "./operators.ts";
import { visitCallExpression, visitNewExpression } from "./calls.ts";
import { visitIdentifier, visitTemplateExpression, visitObjectLiteral, visitArrayLiteral } from "./literals.ts";
import { visitArrowFunction, visitFunctionExpression } from "./functions.ts";
import { helperEnvAccess } from "./module-access.ts";

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
 * Проверяет, является ли IR выражение результатом optional chaining.
 * Определяется по структуре: ConditionalExpression с consequent === IR.id("undefined").
 */
function isOptionalChainResult(expr: IRExpression): expr is import("../../ir/index.ts").IRConditionalExpression {
  return expr.kind === "ConditionalExpression" && expr.consequent.kind === "Identifier" && expr.consequent.name === "undefined";
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
 * Извлекает имя temp переменной из результата optional chaining.
 *
 * Структура: `(__tmp = expr) == null || __tmp == undefined ? undefined : alternate`
 * Ищем AssignmentExpression внутри GroupingExpression → left.name
 */
function extractOptionalChainTempName(expr: import("../../ir/index.ts").IRConditionalExpression): string | undefined {
  // test = LogicalExpression("||", left, right)
  if (expr.test.kind !== "LogicalExpression" || expr.test.operator !== "||") return undefined;

  // left = BinaryExpression("==", GroupingExpression(AssignmentExpression), null)
  const leftTest = expr.test.left;
  if (leftTest.kind !== "BinaryExpression" || leftTest.operator !== "==") return undefined;

  const grouped = leftTest.left;
  if (grouped.kind !== "GroupingExpression") return undefined;

  const assign = grouped.expression;
  if (assign.kind !== "AssignmentExpression" || assign.operator !== "=") return undefined;

  if (assign.left.kind !== "Identifier") return undefined;
  return assign.left.name;
}

// ============================================================================
// Optional chaining helpers
// ============================================================================

/**
 * Создаёт IR для optional chaining проверки.
 *
 * Паттерн: `(__tmp = expr) == null || __tmp == undefined ? undefined : alternate`
 *
 * @param expr - Выражение для проверки на null/undefined
 * @param buildAlternate - Выражение-результат если expr не null/undefined
 * @param ctx - VisitorContext
 * @param loc - Местоположение в исходнике
 * @param reuseTempName - Имя temp переменной для переиспользования (оптимизация)
 */
export function createOptionalCheck(
  expr: IRExpression,
  buildAlternate: (tempRef: IRExpression) => IRExpression,
  ctx: VisitorContext,
  loc?: import("../../ir/index.ts").SourceLocation,
  reuseTempName?: string,
): IRExpression {
  const tempName = reuseTempName ?? ctx.bindings.create("tmp");
  // Объявляем временную переменную (только если новая)
  if (!reuseTempName) {
    ctx.pendingStatements.push(IR.varDecl(tempName, null));
  }
  const tempRef = IR.id(tempName);

  // (__tmp = expr) == null || __tmp == undefined
  const assignExpr = IR.assign("=", IR.id(tempName) as import("../../ir/index.ts").IRIdentifier, expr);
  const nullCheck = IR.binary("==", IR.grouping(assignExpr), IR.null());
  const undefinedCheck = IR.binary("==", tempRef, IR.id("undefined"));
  const test = IR.logical("||", nullCheck, undefinedCheck);

  const alternate = buildAlternate(tempRef);
  return IR.conditional(test, IR.id("undefined"), alternate, loc);
}

/**
 * Встраивает операцию в alternate ветку существующего optional chain conditional,
 * или создаёт новый optional check если это новый `?.`.
 */
export function chainOptionalAccess(
  base: IRExpression,
  hasQuestionDot: boolean,
  buildAccess: (baseRef: IRExpression) => IRExpression,
  ctx: VisitorContext,
  loc?: import("../../ir/index.ts").SourceLocation,
): IRExpression {
  if (hasQuestionDot) {
    // Новый ?. — создаём optional check
    // Если base уже optional chain result, переиспользуем temp переменную
    const reuseName = isOptionalChainResult(base) ? extractOptionalChainTempName(base) : undefined;
    return createOptionalCheck(base, (tempRef) => buildAccess(tempRef), ctx, loc, reuseName);
  }

  // Обычный доступ, но base может быть результатом optional chaining
  if (isOptionalChainResult(base)) {
    // Встраиваем в alternate ветку
    return IR.conditional(base.test, base.consequent, buildAccess(base.alternate), loc ?? base.loc);
  }

  // Обычный доступ без optional chaining
  return buildAccess(base);
}

// ============================================================================
// Type expression unwrapping
// ============================================================================

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
 * @param objectName - имя объекта если это инициализатор переменной
 */
export function visitExpression(node: ts.Expression, ctx: VisitorContext, objectName?: string): IRExpression {
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

    // import.meta.dirPath, import.meta.dirUrl, import.meta.filePath, import.meta.fileUrl
    if (ts.isMetaProperty(node.expression) && node.expression.name.text === "meta") {
      const metaProps = ["dirPath", "dirUrl", "filePath", "fileUrl"];
      if (metaProps.includes(propName)) {
        if (!ctx.config.useEnvDescPattern) {
          return IR.id("__invalid__", getLoc(node, ctx));
        }
        ctx.helperFlags.usesImportMeta = true;
        const helperName = `__ImportMeta_${propName}`;
        return IR.btCallFunction(helperEnvAccess(helperName, ctx), [], getLoc(node, ctx));
      }
      return IR.id("__invalid__", getLoc(node, ctx));
    }

    const obj = visitExpression(node.expression, ctx);
    const hasQuestionDot = !!node.questionDotToken;
    const loc = getLoc(node, ctx);

    // Если объект — __env или начинается с __, оставляем как есть
    if (isInternalAccess(node.expression)) {
      return IR.dot(obj, propName, loc);
    }

    // Without property wrapping: ?. not supported
    if (!ctx.config.wrapPropertyAccess) {
      if (hasQuestionDot) return IR.id("__invalid__", loc);
      return IR.dot(obj, propName, loc);
    }

    // XML с ?. → переключаемся на bt.getProperty для этого выражения
    const isXml = isXmlRelatedType(ctx.typeChecker, node.expression, ctx.xmlDocumentSymbol, ctx.xmlElemSymbol);
    if (isXml && !hasQuestionDot) {
      return IR.dot(obj, propName, loc);
    }

    // Optional chaining / chain continuation
    return chainOptionalAccess(obj, hasQuestionDot, (baseRef) => IR.btGetProperty(baseRef, IR.string(propName), loc), ctx, loc);
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

    // Without property wrapping: ?. not supported
    if (!ctx.config.wrapPropertyAccess) {
      if (hasQuestionDot) return IR.id("__invalid__", loc);
      return IR.member(obj, prop, true, loc);
    }

    // XML с ?. → переключаемся на bt.getProperty для этого выражения
    const isXml = isXmlRelatedType(ctx.typeChecker, node.expression, ctx.xmlDocumentSymbol, ctx.xmlElemSymbol);
    if (isXml && !hasQuestionDot) {
      return IR.member(obj, prop, true, loc);
    }

    // Optional chaining / chain continuation
    return chainOptionalAccess(obj, hasQuestionDot, (baseRef) => IR.btGetProperty(baseRef, prop, loc), ctx, loc);
  }

  // Object literal
  if (ts.isObjectLiteralExpression(node)) {
    return visitObjectLiteral(node, ctx, objectName);
  }

  // Array literal
  if (ts.isArrayLiteralExpression(node)) {
    return visitArrayLiteral(node, ctx);
  }

  // Arrow function
  if (ts.isArrowFunction(node)) {
    return visitArrowFunction(node, ctx);
  }

  // Function expression
  if (ts.isFunctionExpression(node)) {
    return visitFunctionExpression(node, ctx);
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
    return !ctx.config.useEnvDescPattern ? IR.id("this", getLoc(node, ctx)) : IR.id("__this", getLoc(node, ctx));
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
