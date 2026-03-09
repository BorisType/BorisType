/**
 * Expression Visitors - обработка expressions TypeScript AST
 *
 * Содержит:
 * - visitExpression (dispatch)
 * - visitIdentifier
 * - visitTemplateExpression
 * - visitBinaryExpression
 * - visitPrefixUnaryExpression, visitPostfixUnaryExpression
 * - visitCallExpression
 * - visitObjectLiteral, visitArrayLiteral
 * - visitArrowFunction, visitFunctionExpression
 * - visitNewExpression
 *
 * @module lowering/expressions
 */

import * as ts from "typescript";
import {
  IR,
  type IRStatement,
  type IRExpression,
  type IRFunctionDeclaration,
  type IRFunctionParam,
  type IRObjectProperty,
} from "../ir/index.ts";
import type { VisitorContext } from "./visitor.ts";
import { visitStatementList } from "./statements.ts";
import { resolveEnvAccess, resolveModuleLevelAccess, getModuleEnvDepth } from "./env-resolution.ts";
import {
  getLoc,
  getPolyfillType,
  isInternalAccess,
  isXmlRelatedType,
  isBuiltinFunction,
  isAssignmentOperator,
  getAssignmentOperator,
  getUnaryOperator,
  resolveVariableInScope,
  collectCapturedVarsForArrow,
} from "./helpers.ts";
import { needsParentheses, getPrecedence } from "./precedence.ts";
import { buildFunction, assignDescriptorObj, getEnvFunctionRef } from "./function-builder.ts";
import {
  visitBareArrowFunction,
  visitBareFunctionExpression,
  visitBareObjectMethod,
} from "./bare-visitors.ts";
import {
  POLYFILL_REST_AS_ARRAY_METHODS,
  POLYFILL_REST_POSITIONAL_COUNT,
} from "../polyfill-spec.ts";

// ============================================================================
// Main expression dispatcher
// ============================================================================

/**
 * Проверяет, является ли IR выражение результатом optional chaining.
 * Определяется по структуре: ConditionalExpression с consequent === IR.id("undefined").
 */
function isOptionalChainResult(
  expr: IRExpression,
): expr is import("../ir/index.ts").IRConditionalExpression {
  return (
    expr.kind === "ConditionalExpression" &&
    expr.consequent.kind === "Identifier" &&
    expr.consequent.name === "undefined"
  );
}

/**
 * Проверяет, небезопасно ли инлайнить выражение внутри бинарных/логических операций.
 *
 * BorisScript парсит операторы строго слева направо (без приоритетов),
 * поэтому `ConditionalExpression` (ternary `? :`) и `LogicalExpression`
 * с вложенными conditional внутри бинарного оператора приводят к некорректному парсингу.
 *
 * Примеры проблемных паттернов:
 * - `"prefix" + (ternary) + "suffix"` → BS парсит `+` внутрь ternary
 * - `ternary === 42` → `=== 42` уходит в alternate ветку
 * - `ternary || fallback` → `||` в null-check конфликтует с внешним `||`
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
 * Если выражение является `ConditionalExpression` (результат optional chaining или ternary),
 * создаёт pending statement `var __oc; __oc = <expr>;` и возвращает `IR.id("__oc")`.
 * Для простых выражений возвращает их как есть.
 *
 * @param expr - IR выражение, потенциально сложное
 * @param ctx - VisitorContext для доступа к pendingStatements и bindings
 * @returns Безопасное для инлайна IR выражение (идентификатор или исходное выражение)
 */
function maybeExtract(expr: IRExpression, ctx: VisitorContext): IRExpression {
  if (!isUnsafeInlineExpression(expr)) {
    return expr;
  }

  const tmpName = ctx.bindings.create("oc");
  ctx.pendingStatements.push(IR.varDecl(tmpName, null));
  ctx.pendingStatements.push(
    IR.exprStmt(IR.assign("=", IR.id(tmpName) as import("../ir/index.ts").IRIdentifier, expr)),
  );
  return IR.id(tmpName);
}

/**
 * Извлекает имя temp переменной из результата optional chaining.
 *
 * Структура: `(__tmp = expr) == null || __tmp == undefined ? undefined : alternate`
 * Ищем AssignmentExpression внутри GroupingExpression → left.name
 *
 * @param expr - ConditionalExpression от optional chaining
 * @returns Имя temp переменной или undefined если структура не распознана
 */
function extractOptionalChainTempName(
  expr: import("../ir/index.ts").IRConditionalExpression,
): string | undefined {
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

/**
 * Создаёт IR для optional chaining проверки.
 *
 * Паттерн: `(__tmp = expr) == null || __tmp == undefined ? undefined : alternate`
 *
 * Создаёт временную переменную через `ctx.bindings.create("tmp")` и добавляет
 * её объявление в `ctx.pendingStatements`.
 *
 * @param expr - Выражение для проверки на null/undefined
 * @param buildAlternate - Выражение-результат если expr не null/undefined
 *   (в alternate доступна temp переменная как замена expr)
 * @param ctx - VisitorContext
 * @param loc - Местоположение в исходнике
 * @param reuseTempName - Имя temp переменной для переиспользования (оптимизация)
 * @returns ConditionalExpression с паттерном optional chaining
 */
function createOptionalCheck(
  expr: IRExpression,
  buildAlternate: (tempRef: IRExpression) => IRExpression,
  ctx: VisitorContext,
  loc?: import("../ir/index.ts").SourceLocation,
  reuseTempName?: string,
): IRExpression {
  const tempName = reuseTempName ?? ctx.bindings.create("tmp");
  // Объявляем временную переменную (только если новая)
  if (!reuseTempName) {
    ctx.pendingStatements.push(IR.varDecl(tempName, null));
  }
  const tempRef = IR.id(tempName);

  // (__tmp = expr) == null || __tmp == undefined
  const assignExpr = IR.assign("=", IR.id(tempName) as import("../ir/index.ts").IRIdentifier, expr);
  const nullCheck = IR.binary("==", IR.grouping(assignExpr), IR.null());
  const undefinedCheck = IR.binary("==", tempRef, IR.id("undefined"));
  const test = IR.logical("||", nullCheck, undefinedCheck);

  const alternate = buildAlternate(tempRef);
  return IR.conditional(test, IR.id("undefined"), alternate, loc);
}

/**
 * Встраивает операцию в alternate ветку существующего optional chain conditional,
 * или создаёт новый optional check если это новый `?.`.
 *
 * Для цепочки `a?.b.c`:
 *   base = `(__tmp0 = a) == null || __tmp0 == undefined ? undefined : bt.getProperty(__tmp0, "b")`
 *   Встраиваем: заменяем alternate на `bt.getProperty(<old_alternate>, "c")`
 *
 * Для цепочки `a?.b?.c`:
 *   base = conditional от `a?.b`
 *   Создаём новый conditional, переиспользуя temp переменную из base
 */
function chainOptionalAccess(
  base: IRExpression,
  hasQuestionDot: boolean,
  buildAccess: (baseRef: IRExpression) => IRExpression,
  ctx: VisitorContext,
  loc?: import("../ir/index.ts").SourceLocation,
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

/**
 * Обрабатывает expression
 * @param objectName - имя объекта если это инициализатор переменной
 */
export function visitExpression(
  node: ts.Expression,
  ctx: VisitorContext,
  objectName?: string,
): IRExpression {
  // Identifier
  if (ts.isIdentifier(node)) {
    return visitIdentifier(node, ctx);
  }

  // Literals
  if (ts.isStringLiteral(node)) {
    return IR.string(node.text, getLoc(node, ctx));
  }

  if (ts.isNumericLiteral(node)) {
    // Удаляем numeric separators (1_000_000 → 1000000)
    const value = Number(node.text.replace(/_/g, ""));
    return IR.number(value, getLoc(node, ctx));
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
    let condition = maybeExtract(visitExpression(node.condition, ctx), ctx);
    let whenTrue = maybeExtract(visitExpression(node.whenTrue, ctx), ctx);
    let whenFalse = maybeExtract(visitExpression(node.whenFalse, ctx), ctx);
    if (ts.isBinaryExpression(node.condition)) {
      const condPrec = getPrecedence(node.condition.operatorToken.kind);
      if (condPrec <= 2) {
        condition = IR.grouping(condition, getLoc(node.condition, ctx));
      }
    }
    if (ts.isBinaryExpression(node.whenTrue)) {
      const truePrec = getPrecedence(node.whenTrue.operatorToken.kind);
      if (truePrec <= 2) {
        whenTrue = IR.grouping(whenTrue, getLoc(node.whenTrue, ctx));
      }
    }
    if (ts.isBinaryExpression(node.whenFalse)) {
      const falsePrec = getPrecedence(node.whenFalse.operatorToken.kind);
      if (falsePrec <= 2) {
        whenFalse = IR.grouping(whenFalse, getLoc(node.whenFalse, ctx));
      }
    }
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
        if (ctx.mode === "bare") {
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

    // bare mode: ?. не поддерживается → __invalid__
    if (ctx.mode === "bare") {
      if (hasQuestionDot) return IR.id("__invalid__", loc);
      return IR.dot(obj, propName, loc);
    }

    // XML с ?. → переключаемся на bt.getProperty для этого выражения
    const isXml = isXmlRelatedType(
      ctx.typeChecker,
      node.expression,
      ctx.xmlDocumentSymbol,
      ctx.xmlElemSymbol,
    );
    if (isXml && !hasQuestionDot) {
      return IR.dot(obj, propName, loc);
    }

    // Optional chaining / chain continuation
    return chainOptionalAccess(
      obj,
      hasQuestionDot,
      (baseRef) => IR.btGetProperty(baseRef, IR.string(propName), loc),
      ctx,
      loc,
    );
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

    // bare mode: ?. не поддерживается → __invalid__
    if (ctx.mode === "bare") {
      if (hasQuestionDot) return IR.id("__invalid__", loc);
      return IR.member(obj, prop, true, loc);
    }

    // XML с ?. → переключаемся на bt.getProperty для этого выражения
    const isXml = isXmlRelatedType(
      ctx.typeChecker,
      node.expression,
      ctx.xmlDocumentSymbol,
      ctx.xmlElemSymbol,
    );
    if (isXml && !hasQuestionDot) {
      return IR.member(obj, prop, true, loc);
    }

    // Optional chaining / chain continuation
    return chainOptionalAccess(
      obj,
      hasQuestionDot,
      (baseRef) => IR.btGetProperty(baseRef, prop, loc),
      ctx,
      loc,
    );
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
  // Но если внутри только типовая обёртка (as T, x!), скобки лишние.
  // TODO: разобраться глубже с взаимодействием ParenthesizedExpression и типовых обёрток,
  //       сейчас убираем только один уровень — может быть вложенность (expr as A as B).
  if (ts.isParenthesizedExpression(node)) {
    const inner = unwrapTypeExpressions(node.expression);
    // Если после снятия типовых обёрток осталось простое выражение — скобки не нужны
    if (
      ts.isIdentifier(inner) ||
      ts.isPropertyAccessExpression(inner) ||
      ts.isElementAccessExpression(inner)
    ) {
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
    return ctx.mode === "bare"
      ? IR.id("this", getLoc(node, ctx))
      : IR.id("__this", getLoc(node, ctx));
  }

  // Type assertion (as T) — strip type, return inner expression
  if (ts.isAsExpression(node)) {
    return visitExpression(node.expression, ctx);
  }

  // Non-null assertion (x!) — strip, return inner expression
  if (ts.isNonNullExpression(node)) {
    return visitExpression(node.expression, ctx);
  }

  console.warn(`Unhandled expression: ${ts.SyntaxKind[node.kind]}`);
  return IR.id("__unknown__", getLoc(node, ctx));
}

// ============================================================================
// Identifier
// ============================================================================

/**
 * Обрабатывает identifier
 */
export function visitIdentifier(node: ts.Identifier, ctx: VisitorContext): IRExpression {
  const name = node.text;
  const loc = getLoc(node, ctx);

  // Bare mode: прямой identifier без importBindings, argsAccess, envAccess
  if (ctx.mode === "bare") {
    return IR.id(name, loc);
  }

  // Импорты — live binding через moduleVar.exportedName
  // Если импорт captured, доступ к moduleVar через __env цепочку
  const importBinding = ctx.importBindings.get(name);
  if (importBinding) {
    const moduleRef = importModuleVarAccess(importBinding.moduleVar, importBinding.isCaptured, ctx);
    if (importBinding.exportedName === "") {
      // import * as ns — ссылка на весь модуль
      return moduleRef;
    }
    return IR.dot(moduleRef, importBinding.exportedName, loc);
  }

  // Проверяем параметр функции
  const paramIndex = ctx.functionParams.get(name);
  if (paramIndex !== undefined) {
    // Если параметр captured (используется в замыкании), доступ через __env
    const varInfo = resolveVariableInScope(name, ctx.currentScope);
    if (varInfo && varInfo.isCaptured) {
      const actualName = varInfo.renamedTo ?? name;
      return resolveEnvAccess(varInfo.declarationScope, actualName, ctx, getLoc(node, ctx));
    }
    return IR.argsAccess(paramIndex, name, loc);
  }

  // Проверяем captured переменную
  const varInfo = resolveVariableInScope(name, ctx.currentScope);
  if (varInfo) {
    // Используем переименованное имя если есть (block scope shadowing)
    const actualName = varInfo.renamedTo ?? name;

    if (varInfo.isCaptured) {
      return resolveEnvAccess(varInfo.declarationScope, actualName, ctx, getLoc(node, ctx));
    }

    // Не captured, но возможно переименована
    return IR.id(actualName, getLoc(node, ctx));
  }

  // Не найдена — обычный identifier (глобальная переменная)
  return IR.id(name, getLoc(node, ctx));
}

// ============================================================================
// Callable identifier resolution
// ============================================================================

/**
 * Резолвит идентификатор callable (функция или конструктор класса) через __env.
 *
 * Общая логика для:
 * - `visitCallExpression` → вызов функции `foo(args)`
 * - `visitNewExpression` → `new ClassName(args)`
 * - `super()` → вызов конструктора базового класса
 *
 * Для function-kind переменных доступ идёт через __env:
 * - captured → `resolveEnvAccess` (через env-цепочку с depth)
 * - не captured → `__env.name`
 *
 * @param name - Имя идентификатора
 * @param ctx - Текущий VisitorContext
 * @param loc - Source location
 * @returns IR выражение для доступа к callable
 */
export function resolveCallableRef(
  name: string,
  ctx: VisitorContext,
  loc?: import("../ir/index.ts").SourceLocation,
): IRExpression {
  const varInfo = resolveVariableInScope(name, ctx.currentScope);
  const actualName = varInfo?.renamedTo ?? name;

  if (varInfo?.isCaptured) {
    const capturedName = varInfo.kind === "function" ? name : actualName;
    return resolveEnvAccess(varInfo.declarationScope, capturedName, ctx, loc);
  }

  if (varInfo?.kind === "function") {
    return IR.dot(IR.id(ctx.currentEnvRef), name, loc);
  }

  return IR.id(actualName, loc);
}

// ============================================================================
// Template literals
// ============================================================================

/**
 * Обрабатывает template expression
 */
export function visitTemplateExpression(
  node: ts.TemplateExpression,
  ctx: VisitorContext,
): IRExpression {
  const parts: IRExpression[] = [];

  // Head
  if (node.head.text) {
    parts.push(IR.string(node.head.text, getLoc(node.head, ctx)));
  }

  // Spans — maybeExtract для безопасного инлайна сложных выражений (optional chaining, ternary)
  for (const span of node.templateSpans) {
    parts.push(maybeExtract(visitExpression(span.expression, ctx), ctx));

    if (span.literal.text) {
      parts.push(IR.string(span.literal.text, getLoc(span.literal, ctx)));
    }
  }

  // Собираем в цепочку конкатенаций
  if (parts.length === 0) {
    return IR.string("", getLoc(node, ctx));
  }

  let result = parts[0];
  for (let i = 1; i < parts.length; i++) {
    result = IR.binary("+", result, parts[i], getLoc(node, ctx));
  }

  return result;
}

// ============================================================================
// Binary / Unary expressions
// ============================================================================

/**
 * Обрабатывает binary expression
 */
export function visitBinaryExpression(
  node: ts.BinaryExpression,
  ctx: VisitorContext,
): IRExpression {
  const operatorToken = node.operatorToken.kind;

  // Assignment operators
  if (isAssignmentOperator(operatorToken)) {
    const operator = getAssignmentOperator(operatorToken);
    let right = visitExpression(node.right, ctx);
    if (ts.isBinaryExpression(node.right) && needsParentheses(node, node.right, false)) {
      right = IR.grouping(right, getLoc(node.right, ctx));
    }

    // Property access assignment: obj.prop = value
    if (ts.isPropertyAccessExpression(node.left)) {
      const obj = visitExpression(node.left.expression, ctx);
      const propName = node.left.name.text;

      if (isInternalAccess(node.left.expression) || ctx.mode === "bare") {
        const left = IR.dot(obj, propName, getLoc(node.left, ctx));
        if (operator === "=") {
          return IR.assign(operator, left, right, getLoc(node, ctx));
        }
        const currentValue = IR.dot(obj, propName, getLoc(node.left, ctx));
        const binaryOp = operator.slice(0, -1) as any;
        const newValue = IR.binary(binaryOp, currentValue, right);
        return IR.assign("=", left, newValue, getLoc(node, ctx));
      }
      // XML-типы: прямое присваивание без bt.setProperty (оптимизация)
      if (
        isXmlRelatedType(
          ctx.typeChecker,
          node.left.expression,
          ctx.xmlDocumentSymbol,
          ctx.xmlElemSymbol,
        )
      ) {
        const left = IR.dot(obj, propName, getLoc(node.left, ctx));
        if (operator === "=") {
          return IR.assign(operator, left, right, getLoc(node, ctx));
        }
        const currentValue = IR.dot(obj, propName, getLoc(node.left, ctx));
        const binaryOp = operator.slice(0, -1) as any;
        const newValue = IR.binary(binaryOp, currentValue, right);
        return IR.assign("=", left, newValue, getLoc(node, ctx));
      }
      if (operator === "=") {
        return IR.btSetProperty(obj, IR.string(propName), right, getLoc(node, ctx));
      }
      const currentValue = IR.btGetProperty(obj, IR.string(propName));
      const binaryOp = operator.slice(0, -1) as any;
      const newValue = IR.binary(binaryOp, currentValue, right);
      return IR.btSetProperty(obj, IR.string(propName), newValue, getLoc(node, ctx));
    }

    // Element access assignment: obj[key] = value
    if (ts.isElementAccessExpression(node.left)) {
      const obj = visitExpression(node.left.expression, ctx);
      const key = visitExpression(node.left.argumentExpression, ctx);

      if (isInternalAccess(node.left.expression) || ctx.mode === "bare") {
        const left = IR.member(obj, key, true, getLoc(node.left, ctx));
        if (operator === "=") {
          return IR.assign(operator, left, right, getLoc(node, ctx));
        }
        const currentValue = IR.member(obj, key, true, getLoc(node.left, ctx));
        const binaryOp = operator.slice(0, -1) as any;
        const newValue = IR.binary(binaryOp, currentValue, right);
        return IR.assign("=", left, newValue, getLoc(node, ctx));
      }
      // XML-типы: прямое присваивание без bt.setProperty (оптимизация)
      if (
        isXmlRelatedType(
          ctx.typeChecker,
          node.left.expression,
          ctx.xmlDocumentSymbol,
          ctx.xmlElemSymbol,
        )
      ) {
        const left = IR.member(obj, key, true, getLoc(node.left, ctx));
        if (operator === "=") {
          return IR.assign(operator, left, right, getLoc(node, ctx));
        }
        const currentValue = IR.member(obj, key, true, getLoc(node.left, ctx));
        const binaryOp = operator.slice(0, -1) as any;
        const newValue = IR.binary(binaryOp, currentValue, right);
        return IR.assign("=", left, newValue, getLoc(node, ctx));
      }
      if (operator === "=") {
        return IR.btSetProperty(obj, key, right, getLoc(node, ctx));
      }
      const currentValue = IR.btGetProperty(obj, key);
      const binaryOp = operator.slice(0, -1) as any;
      const newValue = IR.binary(binaryOp, currentValue, right);
      return IR.btSetProperty(obj, key, newValue, getLoc(node, ctx));
    }

    // Обычное присваивание (идентификатор)
    let left = visitExpression(node.left, ctx);
    // ArgsAccess превращается в Identifier после извлечения параметров
    if (left.kind === "ArgsAccess") {
      left = IR.id(left.originalName, left.loc);
    }
    if (
      left.kind === "Identifier" ||
      left.kind === "MemberExpression" ||
      left.kind === "EnvAccess"
    ) {
      return IR.assign(operator, left as any, right, getLoc(node, ctx));
    }

    console.warn("Invalid assignment target");
    return IR.id("__invalid__");
  }

  // Logical operators — maybeExtract для безопасного инлайна conditional
  if (operatorToken === ts.SyntaxKind.AmpersandAmpersandToken) {
    let left = maybeExtract(visitExpression(node.left, ctx), ctx);
    let right = maybeExtract(visitExpression(node.right, ctx), ctx);
    if (ts.isBinaryExpression(node.left) && needsParentheses(node, node.left, true)) {
      left = IR.grouping(left, getLoc(node.left, ctx));
    }
    if (ts.isBinaryExpression(node.right) && needsParentheses(node, node.right, false)) {
      right = IR.grouping(right, getLoc(node.right, ctx));
    }
    return IR.logical("&&", left, right, getLoc(node, ctx));
  }

  if (operatorToken === ts.SyntaxKind.BarBarToken) {
    // In bare mode, emit native || (no bt.isTrue available)
    if (ctx.mode === "bare") {
      let left = maybeExtract(visitExpression(node.left, ctx), ctx);
      let right = maybeExtract(visitExpression(node.right, ctx), ctx);
      if (ts.isBinaryExpression(node.left) && needsParentheses(node, node.left, true)) {
        left = IR.grouping(left, getLoc(node.left, ctx));
      }
      if (ts.isBinaryExpression(node.right) && needsParentheses(node, node.right, false)) {
        right = IR.grouping(right, getLoc(node.right, ctx));
      }
      return IR.logical("||", left, right, getLoc(node, ctx));
    }

    // Lowering: a || b → ((__lo = a), bt.isTrue(__lo) ? __lo : b)
    // BS native || works only with booleans; ternary preserves short-circuit semantics
    const leftExpr = maybeExtract(visitExpression(node.left, ctx), ctx);
    const tmpName = ctx.bindings.create("lo");
    ctx.pendingStatements.push(IR.varDecl(tmpName, null));
    ctx.pendingStatements.push(
      IR.exprStmt(IR.assign("=", IR.id(tmpName) as import("../ir/index.ts").IRIdentifier, leftExpr)),
    );
    let right = maybeExtract(visitExpression(node.right, ctx), ctx);
    if (ts.isBinaryExpression(node.right) && needsParentheses(node, node.right, false)) {
      right = IR.grouping(right, getLoc(node.right, ctx));
    }
    return IR.conditional(
      IR.btIsTrue(IR.id(tmpName), getLoc(node.left, ctx)),
      IR.id(tmpName),
      right,
      getLoc(node, ctx),
    );
  }

  // Binary operators — maybeExtract для безопасного инлайна conditional
  const operator = ts.tokenToString(operatorToken);
  if (!operator) {
    console.warn(`Unknown operator: ${ts.SyntaxKind[operatorToken]}`);
    return IR.id("__unknown__");
  }

  let left = maybeExtract(visitExpression(node.left, ctx), ctx);
  let right = maybeExtract(visitExpression(node.right, ctx), ctx);
  if (ts.isBinaryExpression(node.left) && needsParentheses(node, node.left, true)) {
    left = IR.grouping(left, getLoc(node.left, ctx));
  }
  if (ts.isBinaryExpression(node.right) && needsParentheses(node, node.right, false)) {
    right = IR.grouping(right, getLoc(node.right, ctx));
  }
  return IR.binary(operator as any, left, right, getLoc(node, ctx));
}

/**
 * Обрабатывает prefix unary expression
 */
export function visitPrefixUnaryExpression(
  node: ts.PrefixUnaryExpression,
  ctx: VisitorContext,
): IRExpression {
  const operator = node.operator;

  // ++/-- prefix
  if (operator === ts.SyntaxKind.PlusPlusToken || operator === ts.SyntaxKind.MinusMinusToken) {
    const arg = visitExpression(node.operand, ctx);
    // ArgsAccess turns into a simple identifier after parameter extraction
    if (arg.kind === "ArgsAccess") {
      return IR.update(
        operator === ts.SyntaxKind.PlusPlusToken ? "++" : "--",
        IR.id(arg.originalName, arg.loc),
        true,
        getLoc(node, ctx),
      );
    }
    if (arg.kind === "Identifier" || arg.kind === "MemberExpression") {
      return IR.update(
        operator === ts.SyntaxKind.PlusPlusToken ? "++" : "--",
        arg as any,
        true,
        getLoc(node, ctx),
      );
    }
  }

  // Unary operators
  const opStr = getUnaryOperator(operator);
  return IR.unary(opStr, visitExpression(node.operand, ctx), true, getLoc(node, ctx));
}

/**
 * Обрабатывает postfix unary expression
 */
export function visitPostfixUnaryExpression(
  node: ts.PostfixUnaryExpression,
  ctx: VisitorContext,
): IRExpression {
  const arg = visitExpression(node.operand, ctx);

  // ArgsAccess turns into a simple identifier after parameter extraction
  if (arg.kind === "ArgsAccess") {
    return IR.update(
      node.operator === ts.SyntaxKind.PlusPlusToken ? "++" : "--",
      IR.id(arg.originalName, arg.loc),
      false,
      getLoc(node, ctx),
    );
  }

  if (arg.kind === "Identifier" || arg.kind === "MemberExpression") {
    return IR.update(
      node.operator === ts.SyntaxKind.PlusPlusToken ? "++" : "--",
      arg as any,
      false,
      getLoc(node, ctx),
    );
  }

  console.warn("Invalid update expression operand");
  return IR.id("__invalid__");
}

// ============================================================================
// Call expressions
// ============================================================================

/**
 * Обрабатывает call expression
 */
export function visitCallExpression(node: ts.CallExpression, ctx: VisitorContext): IRExpression {
  const args = node.arguments.map((arg) => maybeExtract(visitExpression(arg, ctx), ctx));
  const loc = getLoc(node, ctx);

  // ============ super(args) — вызов конструктора родителя ============
  if (node.expression.kind === ts.SyntaxKind.SuperKeyword && ctx.superContext) {
    // bt.callWithThis(ParentCtorDesc, __this, [args])
    // Резолвим базовый класс через __env (как вызов функции)
    const baseExpr = ctx.superContext.baseClassExpr;
    const baseCtorDesc = ts.isIdentifier(baseExpr)
      ? resolveCallableRef(baseExpr.text, ctx, getLoc(baseExpr, ctx))
      : visitExpression(baseExpr, ctx);
    return IR.call(
      IR.dot(IR.id("bt"), "callWithThis"),
      [baseCtorDesc, IR.id("__this"), IR.array(args)],
      loc,
    );
  }

  // obj.method() / obj?.method() / obj.method?.() / obj?.method?.()
  if (ts.isPropertyAccessExpression(node.expression)) {
    const methodName = node.expression.name.text;
    const targetExpr = node.expression.expression;

    // ============ super.method(args) — вызов метода родителя ============
    if (targetExpr.kind === ts.SyntaxKind.SuperKeyword && ctx.superContext) {
      // bt.callWithThis(bt.getProperty(ParentCtorDesc.proto, "method"), __this, [args])
      const baseExpr = ctx.superContext.baseClassExpr;
      const baseCtorDesc = ts.isIdentifier(baseExpr)
        ? resolveCallableRef(baseExpr.text, ctx, getLoc(baseExpr, ctx))
        : visitExpression(baseExpr, ctx);
      const parentProto = IR.dot(baseCtorDesc, "proto");
      const method = IR.btGetProperty(parentProto, IR.string(methodName));
      return IR.call(
        IR.dot(IR.id("bt"), "callWithThis"),
        [method, IR.id("__this"), IR.array(args)],
        loc,
      );
    }

    const obj = visitExpression(targetExpr, ctx);
    const propHasQuestionDot = !!node.expression.questionDotToken; // obj?.method
    const callHasQuestionDot = !!node.questionDotToken; // method?.()

    // bare mode: без polyfill, прямой вызов obj.method(...)
    if (ctx.mode === "bare") {
      if (propHasQuestionDot || callHasQuestionDot) return IR.id("__invalid__", loc);
      return IR.call(IR.dot(obj, methodName, getLoc(node.expression, ctx)), args, loc);
    }

    // XML-типы без optional: прямой вызов obj.method(...)
    const isXml = isXmlRelatedType(
      ctx.typeChecker,
      targetExpr,
      ctx.xmlDocumentSymbol,
      ctx.xmlElemSymbol,
    );
    if (isXml && !propHasQuestionDot && !callHasQuestionDot) {
      return IR.call(IR.dot(obj, methodName, getLoc(node.expression, ctx)), args, loc);
    }

    // Polyfill (Array.map, String.split etc.) — без optional
    if (!propHasQuestionDot && !callHasQuestionDot) {
      const type = ctx.typeChecker.getTypeAtLocation(targetExpr);
      const polyfillType = getPolyfillType(type, ctx.typeChecker);

      if (polyfillType) {
        let polyfillArgs = args;
        const restMethods = POLYFILL_REST_AS_ARRAY_METHODS[polyfillType];
        if (restMethods?.includes(methodName)) {
          const positionalCount = POLYFILL_REST_POSITIONAL_COUNT[polyfillType]?.[methodName] ?? 0;
          const positional = args.slice(0, positionalCount);
          const rest = args.slice(positionalCount);
          // Pad positional to exact count (BT semantics) — splice(2) → [2, undefined, []]
          const paddedPositional: IRExpression[] = [...positional];
          while (paddedPositional.length < positionalCount) {
            paddedPositional.push(IR.id("undefined", loc));
          }
          polyfillArgs = [...paddedPositional, IR.array(rest, loc)];
        }
        return IR.polyfillCall(polyfillType, methodName, obj, polyfillArgs, loc);
      }

      // -----------------------------------------------------------------------
      // TEMPORARY: GlobalCache → bt.cache
      //
      // Прямое преобразование вызовов на объектах типа GlobalCache в bt.cache.*
      // Это временное решение — в будущем нужна обобщённая система маппинга
      // платформенных типов на встроенные вызовы (type-to-builtin dispatch).
      //
      // @temporary Заменить на обобщённый механизм платформенных типов
      // @todo Спроектировать generic platform type dispatch (см. ref/proposals/)
      // -----------------------------------------------------------------------
      const typeString = ctx.typeChecker.typeToString(type);
      if (typeString === "GlobalCache" && ["get", "set", "has"].includes(methodName)) {
        return IR.call(IR.dot(IR.dot(IR.id("bt"), "cache"), methodName), args, loc);
      }
    }

    if (isInternalAccess(targetExpr)) {
      // __env.func() и т.д. — оставляем как есть, без optional
      return IR.call(IR.dot(obj, methodName, getLoc(node.expression, ctx)), args, loc);
    }

    // Обычный метод без optional: bt.callFunction(bt.getProperty(obj, "method"), args)
    if (!propHasQuestionDot && !callHasQuestionDot) {
      // Поддержка chaining: если obj — результат optional chain, встраиваем в alternate
      return chainOptionalAccess(
        obj,
        false,
        (baseRef) => {
          const method = IR.btGetProperty(baseRef, IR.string(methodName));
          return IR.btCallFunction(method, args, loc);
        },
        ctx,
        loc,
      );
    }

    // obj?.method() — optional на объекте
    if (propHasQuestionDot && !callHasQuestionDot) {
      return createOptionalCheck(
        obj,
        (tempRef) => {
          const method = IR.btGetProperty(tempRef, IR.string(methodName));
          return IR.btCallFunction(method, args, loc);
        },
        ctx,
        loc,
      );
    }

    // obj.method?.() — optional call (проверяем через bt.isFunction)
    if (!propHasQuestionDot && callHasQuestionDot) {
      // Сначала получаем метод, потом проверяем его через bt.isFunction
      return chainOptionalAccess(
        obj,
        false,
        (baseRef) => {
          const method = IR.btGetProperty(baseRef, IR.string(methodName));
          return createOptionalFunctionCall(method, args, ctx, loc);
        },
        ctx,
        loc,
      );
    }

    // obj?.method?.() — оба optional
    if (propHasQuestionDot && callHasQuestionDot) {
      return createOptionalCheck(
        obj,
        (tempRef) => {
          const method = IR.btGetProperty(tempRef, IR.string(methodName));
          return createOptionalFunctionCall(method, args, ctx, loc);
        },
        ctx,
        loc,
      );
    }
  }

  // obj["method"]() / obj?.["method"]() / obj["method"]?.()
  if (ts.isElementAccessExpression(node.expression)) {
    const targetExpr = node.expression.expression;
    const obj = visitExpression(targetExpr, ctx);
    const prop = visitExpression(node.expression.argumentExpression, ctx);
    const propHasQuestionDot = !!node.expression.questionDotToken;
    const callHasQuestionDot = !!node.questionDotToken;

    if (ctx.mode === "bare") {
      if (propHasQuestionDot || callHasQuestionDot) return IR.id("__invalid__", loc);
      return IR.call(IR.member(obj, prop, true), args, loc);
    }

    if (isInternalAccess(targetExpr)) {
      return IR.call(IR.member(obj, prop, true), args, loc);
    }

    // Обычный вызов без optional
    if (!propHasQuestionDot && !callHasQuestionDot) {
      return chainOptionalAccess(
        obj,
        false,
        (baseRef) => {
          const method = IR.btGetProperty(baseRef, prop);
          return IR.btCallFunction(method, args, loc);
        },
        ctx,
        loc,
      );
    }

    // obj?.["method"]()
    if (propHasQuestionDot && !callHasQuestionDot) {
      return createOptionalCheck(
        obj,
        (tempRef) => {
          const method = IR.btGetProperty(tempRef, prop);
          return IR.btCallFunction(method, args, loc);
        },
        ctx,
        loc,
      );
    }

    // obj["method"]?.()
    if (!propHasQuestionDot && callHasQuestionDot) {
      return chainOptionalAccess(
        obj,
        false,
        (baseRef) => {
          const method = IR.btGetProperty(baseRef, prop);
          return createOptionalFunctionCall(method, args, ctx, loc);
        },
        ctx,
        loc,
      );
    }

    // obj?.["method"]?.()
    if (propHasQuestionDot && callHasQuestionDot) {
      return createOptionalCheck(
        obj,
        (tempRef) => {
          const method = IR.btGetProperty(tempRef, prop);
          return createOptionalFunctionCall(method, args, ctx, loc);
        },
        ctx,
        loc,
      );
    }
  }

  if (ts.isIdentifier(node.expression)) {
    const funcName = node.expression.text;

    // Импорты — live binding через moduleVar.exportedName
    // Если импорт captured, доступ к moduleVar через __env цепочку
    const importBinding = ctx.importBindings.get(funcName);
    if (importBinding) {
      const moduleRef = importModuleVarAccess(
        importBinding.moduleVar,
        importBinding.isCaptured,
        ctx,
      );
      const callee =
        importBinding.exportedName === ""
          ? moduleRef
          : IR.dot(moduleRef, importBinding.exportedName, getLoc(node.expression, ctx));
      return IR.btCallFunction(callee, args, loc);
    }

    // AbsoluteUrl заменяется на __AbsoluteUrl в script/module
    if (funcName === "AbsoluteUrl" && (ctx.mode === "script" || ctx.mode === "module")) {
      ctx.helperFlags.usesAbsoluteUrl = true;
      ctx.helperFlags.usesImportMeta = true; // __AbsoluteUrl использует __ImportMeta_dirUrl
      const url = args[0] ?? IR.id("undefined", loc);
      const baseUrl = args[1] ?? IR.id("undefined", loc);
      return IR.btCallFunction(helperEnvAccess("__AbsoluteUrl", ctx), [url, baseUrl], loc);
    }

    if (ctx.mode === "bare" || isBuiltinFunction(funcName, ctx)) {
      return IR.call(IR.id(funcName), args, loc);
    }

    // Резолвим через __env для function-kind, через env-цепочку для captured
    const callee = resolveCallableRef(funcName, ctx, getLoc(node.expression, ctx));
    return IR.btCallFunction(callee, args, loc);
  }

  return IR.call(visitExpression(node.expression, ctx), args, loc);
}

/**
 * Создаёт optional function call: проверяет bt.isFunction, затем вызывает.
 *
 * Паттерн: `bt.isFunction(method) ? bt.callFunction(method, args) : undefined`
 *
 * Для эффективности кладём method во временную переменную,
 * чтобы не вычислять его дважды.
 */
function createOptionalFunctionCall(
  methodExpr: IRExpression,
  args: IRExpression[],
  ctx: VisitorContext,
  loc?: import("../ir/index.ts").SourceLocation,
): IRExpression {
  const tempName = ctx.bindings.create("tmp");
  ctx.pendingStatements.push(IR.varDecl(tempName, null));
  const tempRef = IR.id(tempName);

  const assignExpr = IR.assign(
    "=",
    IR.id(tempName) as import("../ir/index.ts").IRIdentifier,
    methodExpr,
  );
  const check = IR.btIsFunction(IR.grouping(assignExpr));

  return IR.conditional(check, IR.btCallFunction(tempRef, args, loc), IR.id("undefined"), loc);
}

// ============================================================================
// Object and Array literals
// ============================================================================

/**
 * Обрабатывает object literal
 *
 * Spread-свойства преобразуются в вызовы ObjectUnion.
 * Если объект содержит методы:
 * 1. Создаём временную переменную __objN
 * 2. Генерируем функции, env, desc для каждого метода
 * 3. Присваиваем obj в дескрипторе после создания объекта
 * 4. Возвращаем __objN
 */
export function visitObjectLiteral(
  node: ts.ObjectLiteralExpression,
  ctx: VisitorContext,
  objectName?: string,
): IRExpression {
  // Проверяем наличие spread
  const hasSpread = node.properties.some((prop) => ts.isSpreadAssignment(prop));

  if (hasSpread) {
    ctx.helperFlags.needsObjectUnion = true;

    const parts: IRExpression[] = [];
    let currentProperties: IRObjectProperty[] = [];

    for (const prop of node.properties) {
      if (ts.isSpreadAssignment(prop)) {
        if (currentProperties.length > 0) {
          parts.push(IR.object(currentProperties, getLoc(node, ctx)));
          currentProperties = [];
        }
        parts.push(visitExpression(prop.expression, ctx));
      } else if (ts.isPropertyAssignment(prop)) {
        let key: string;
        if (ts.isIdentifier(prop.name)) {
          key = prop.name.text;
        } else if (ts.isStringLiteral(prop.name)) {
          key = prop.name.text;
        } else if (ts.isNumericLiteral(prop.name)) {
          key = prop.name.text;
        } else {
          continue;
        }
        currentProperties.push(
          IR.prop(key, maybeExtract(visitExpression(prop.initializer, ctx), ctx)),
        );
      } else if (ts.isShorthandPropertyAssignment(prop)) {
        currentProperties.push(IR.prop(prop.name.text, visitIdentifier(prop.name, ctx)));
      }
      // MethodDeclaration в объектах со spread пока не поддерживается
    }

    if (currentProperties.length > 0) {
      parts.push(IR.object(currentProperties, getLoc(node, ctx)));
    }

    if (parts.length === 0) {
      return IR.object([], getLoc(node, ctx));
    }
    if (parts.length === 1) {
      return IR.call(
        IR.id("ObjectUnion"),
        [IR.object([], getLoc(node, ctx)), parts[0]],
        getLoc(node, ctx),
      );
    }

    // Строим цепочку ObjectUnion(left, right) left-associative
    let expr: IRExpression = parts[0];
    for (let i = 1; i < parts.length; i++) {
      expr = IR.call(IR.id("ObjectUnion"), [expr, parts[i]], getLoc(node, ctx));
    }
    return expr;
  }

  const properties: IRObjectProperty[] = [];

  // Собираем информацию о методах для последующей установки obj
  const methodDescNames: string[] = [];
  // Функции, которые нужно вынести наверх (в начало pendingStatements)
  const hoistedFunctions: IRFunctionDeclaration[] = [];

  for (const prop of node.properties) {
    // Property assignment: { key: value }
    if (ts.isPropertyAssignment(prop)) {
      let key: string;
      if (ts.isIdentifier(prop.name)) {
        key = prop.name.text;
      } else if (ts.isStringLiteral(prop.name)) {
        key = prop.name.text;
      } else if (ts.isNumericLiteral(prop.name)) {
        key = prop.name.text;
      } else {
        continue;
      }

      const value = maybeExtract(visitExpression(prop.initializer, ctx), ctx);
      properties.push(IR.prop(key, value));
    }
    // Shorthand property: { x }
    else if (ts.isShorthandPropertyAssignment(prop)) {
      const key = prop.name.text;
      properties.push(IR.prop(key, visitIdentifier(prop.name, ctx)));
    }
    // Method declaration: { method() {} }
    // Обрабатываем как замыкание с env/desc (аналогично arrow function)
    else if (ts.isMethodDeclaration(prop) && ts.isIdentifier(prop.name) && prop.body) {
      // Bare mode: plain function, нет desc/env
      if (ctx.mode === "bare") {
        const funcName = visitBareObjectMethod(prop, ctx);
        properties.push(IR.prop(prop.name.text, IR.id(funcName)));
        continue;
      }

      const methodName = prop.name.text;

      // Ищем scope для метода
      const methodScope = ctx.scopeAnalysis.nodeToScope.get(prop);

      // Per-call env: если метод содержит локальные captured переменные
      const methodScopeResolved = methodScope ?? ctx.currentScope;
      const needsPerCallEnv = methodScopeResolved.hasCaptured;
      const perCallEnvName = needsPerCallEnv ? ctx.bindings.create("fn") + "_env" : undefined;

      // Собираем параметры
      const params: IRFunctionParam[] = [];
      const fnCtx: VisitorContext = {
        mode: ctx.mode,
        functionParams: new Map(),
        hoistedFunctions: ctx.hoistedFunctions,
        typeChecker: ctx.typeChecker,
        sourceFile: ctx.sourceFile,
        bindings: ctx.bindings,
        scopeAnalysis: ctx.scopeAnalysis,
        currentScope: methodScopeResolved,
        pendingStatements: [],
        currentEnvRef: perCallEnvName ?? "__env",
        currentEnvScope: methodScopeResolved,
        // При per-call env — не ставим closureEnvScope
        closureEnvScope: needsPerCallEnv ? undefined : ctx.currentEnvScope,
        xmlDocumentSymbol: ctx.xmlDocumentSymbol,
        xmlElemSymbol: ctx.xmlElemSymbol,
        importBindings: ctx.importBindings,
        helperFlags: ctx.helperFlags,
      };

      prop.parameters.forEach((param, index) => {
        if (ts.isIdentifier(param.name)) {
          const paramName = param.name.text;
          const varInfo = resolveVariableInScope(paramName, methodScopeResolved);
          const isCaptured = varInfo?.isCaptured ?? false;
          params.push(
            IR.param(paramName, undefined, undefined, needsPerCallEnv ? false : isCaptured),
          );
          fnCtx.functionParams.set(paramName, index);
        }
      });

      // Тело метода
      let body = visitStatementList(prop.body.statements, fnCtx);

      // Добавляем pending statements из тела (вложенные arrow/методы)
      if (fnCtx.pendingStatements.length > 0) {
        body = [...fnCtx.pendingStatements, ...body];
      }

      // Prepend per-call env
      if (needsPerCallEnv && perCallEnvName) {
        const perCallEnvCreation = IR.varDecl(
          perCallEnvName,
          IR.object([IR.prop("__parent", IR.id("__env"))]),
        );

        const capturedParamAssignments: IRStatement[] = [];
        prop.parameters.forEach((param) => {
          if (ts.isIdentifier(param.name)) {
            const paramVarInfo = resolveVariableInScope(param.name.text, methodScopeResolved);
            if (paramVarInfo?.isCaptured) {
              capturedParamAssignments.push(
                IR.exprStmt(
                  IR.assign(
                    "=",
                    IR.dot(IR.id(perCallEnvName), param.name.text),
                    IR.id(param.name.text),
                  ),
                ),
              );
            }
          }
        });

        body = [perCallEnvCreation, ...capturedParamAssignments, ...body];
      }

      // Собираем captured переменные
      const capturedVars = methodScope ? collectCapturedVarsForArrow(methodScope, ctx) : [];

      // Используем buildFunction для генерации env/desc паттерна
      const fnName = objectName ? `${methodName}__mof_${objectName}` : undefined;

      const result = buildFunction({
        name: fnName,
        namePrefix: `${methodName}__method`,
        params,
        body,
        capturedVars,
        bindings: ctx.bindings,
        effectiveEnvRef: ctx.currentEnvRef,
        useRefFormat: ctx.mode === "module",
        registrationEnvRef: ctx.currentEnvRef,
        codelibraryDepth: getModuleEnvDepth(ctx),
      });

      // Module mode: все функции на top-level; script/bare: локальный hoisting
      if (ctx.mode === "module") {
        ctx.hoistedFunctions.push(result.funcDecl);
      } else {
        hoistedFunctions.push(result.funcDecl);
      }

      // Добавляем setup statements
      ctx.pendingStatements.push(...result.setupStatements);

      // Запоминаем descName для последующего присвоения obj
      methodDescNames.push(result.descName);

      // В объекте — ссылка на env.fnName
      properties.push(
        IR.prop(methodName, getEnvFunctionRef(result.name, undefined, ctx.currentEnvRef)),
      );
    }
  }

  // Если есть методы — выносим функции в начало pendingStatements и создаём временную переменную
  if (methodDescNames.length > 0) {
    // Script/bare: вставляем hoisted функции в начало pendingStatements
    // Module: функции уже в ctx.hoistedFunctions (top-level)
    if (ctx.mode !== "module") {
      ctx.pendingStatements.unshift(...hoistedFunctions);
    }

    // Создаём временную переменную для объекта
    const objVarName = ctx.bindings.create("obj");

    // var __objN = { ... }
    ctx.pendingStatements.push(IR.varDecl(objVarName, IR.object(properties, getLoc(node, ctx))));

    // Для каждого метода: descName.obj = __objN
    for (const descName of methodDescNames) {
      ctx.pendingStatements.push(assignDescriptorObj(descName, objVarName));
    }

    // Возвращаем ссылку на временную переменную
    return IR.id(objVarName, getLoc(node, ctx));
  }

  return IR.object(properties, getLoc(node, ctx));
}

/**
 * Обрабатывает array literal.
 * Spread-элементы преобразуются в вызов ArrayUnion([...], spreadExpr, [...]).
 */
export function visitArrayLiteral(
  node: ts.ArrayLiteralExpression,
  ctx: VisitorContext,
): IRExpression {
  const hasSpread = node.elements.some((el) => ts.isSpreadElement(el));

  if (!hasSpread) {
    const elements = node.elements.map((el) => {
      if (ts.isOmittedExpression(el)) {
        return null;
      }
      return maybeExtract(visitExpression(el, ctx), ctx);
    });
    return IR.array(elements, getLoc(node, ctx));
  }

  // Собираем аргументы для ArrayUnion: [literal], spreadExpr, [literal], ...
  const args: IRExpression[] = [];
  let currentLiteral: IRExpression[] = [];

  for (const element of node.elements) {
    if (ts.isSpreadElement(element)) {
      if (currentLiteral.length > 0) {
        args.push(IR.array(currentLiteral, getLoc(node, ctx)));
        currentLiteral = [];
      }
      args.push(visitExpression(element.expression, ctx));
    } else if (ts.isOmittedExpression(element)) {
      currentLiteral.push(IR.id("undefined"));
    } else {
      currentLiteral.push(maybeExtract(visitExpression(element, ctx), ctx));
    }
  }

  if (currentLiteral.length > 0) {
    args.push(IR.array(currentLiteral, getLoc(node, ctx)));
  }

  return IR.call(IR.id("ArrayUnion"), args, getLoc(node, ctx));
}

// ============================================================================
// Function expressions
// ============================================================================

/**
 * Обрабатывает arrow function
 *
 * Использует buildFunction для генерации env/desc паттерна
 * Возвращает: __env.__arrowN
 */
export function visitArrowFunction(node: ts.ArrowFunction, ctx: VisitorContext): IRExpression {
  // Bare mode: plain function без env/desc
  if (ctx.mode === "bare") return visitBareArrowFunction(node, ctx);

  const params: IRFunctionParam[] = [];

  // Находим scope для этой функции
  const funcScope = ctx.scopeAnalysis.nodeToScope.get(node) || ctx.currentScope;

  // Per-call env: если arrow содержит локальные captured переменные
  const needsPerCallEnv = funcScope.hasCaptured;
  const perCallEnvName = needsPerCallEnv ? ctx.bindings.create("fn") + "_env" : undefined;

  const fnCtx: VisitorContext = {
    mode: ctx.mode,
    functionParams: new Map(),
    hoistedFunctions: ctx.hoistedFunctions,
    typeChecker: ctx.typeChecker,
    sourceFile: ctx.sourceFile,
    bindings: ctx.bindings,
    scopeAnalysis: ctx.scopeAnalysis,
    currentScope: funcScope,
    pendingStatements: [],
    currentEnvRef: perCallEnvName ?? "__env",
    currentEnvScope: funcScope,
    // При per-call env — не ставим closureEnvScope, т.к. base = per-call env
    closureEnvScope: needsPerCallEnv ? undefined : ctx.currentEnvScope,
    xmlDocumentSymbol: ctx.xmlDocumentSymbol,
    xmlElemSymbol: ctx.xmlElemSymbol,
    importBindings: ctx.importBindings,
    helperFlags: ctx.helperFlags,
  };

  // Параметры
  node.parameters.forEach((param, index) => {
    if (ts.isIdentifier(param.name)) {
      const paramName = param.name.text;
      const varInfo = resolveVariableInScope(paramName, funcScope);
      const isCaptured = varInfo?.isCaptured ?? false;
      // При per-call env параметры — обычные var, потом копируются в per-call env
      params.push(IR.param(paramName, undefined, undefined, needsPerCallEnv ? false : isCaptured));
      fnCtx.functionParams.set(paramName, index);
    }
  });

  // Тело
  let body: IRStatement[];
  if (ts.isBlock(node.body)) {
    body = visitStatementList(node.body.statements, fnCtx);
  } else {
    // Expression body: x => x + 1 → function() { return x + 1; }
    body = [IR.return(visitExpression(node.body, fnCtx))];
  }

  // Добавляем pending statements из тела функции (вложенные arrow)
  if (fnCtx.pendingStatements.length > 0) {
    body.unshift(...fnCtx.pendingStatements);
  }

  // Prepend per-call env
  if (needsPerCallEnv && perCallEnvName) {
    const perCallEnvCreation = IR.varDecl(
      perCallEnvName,
      IR.object([IR.prop("__parent", IR.id("__env"))]),
    );

    const capturedParamAssignments: IRStatement[] = [];
    node.parameters.forEach((param) => {
      if (ts.isIdentifier(param.name)) {
        const paramVarInfo = resolveVariableInScope(param.name.text, funcScope);
        if (paramVarInfo?.isCaptured) {
          capturedParamAssignments.push(
            IR.exprStmt(
              IR.assign(
                "=",
                IR.dot(IR.id(perCallEnvName), param.name.text),
                IR.id(param.name.text),
              ),
            ),
          );
        }
      }
    });

    body.unshift(perCallEnvCreation, ...capturedParamAssignments);
  }

  // Собираем captured переменные
  const capturedVars = collectCapturedVarsForArrow(funcScope, ctx);

  // Используем buildFunction для генерации env/desc паттерна
  const result = buildFunction({
    namePrefix: "arrow",
    params,
    body,
    capturedVars,
    bindings: ctx.bindings,
    loc: getLoc(node, ctx),
    effectiveEnvRef: ctx.currentEnvRef,
    useRefFormat: ctx.mode === "module",
    registrationEnvRef: ctx.currentEnvRef,
    codelibraryDepth: getModuleEnvDepth(ctx),
  });

  // Script mode: вложенные функции остаются в своей functional scope
  const isNestedInScript = ctx.mode === "script" && ctx.currentScope.type !== "module";
  if (isNestedInScript) {
    ctx.pendingStatements.unshift(result.funcDecl, ...result.setupStatements);
    return getEnvFunctionRef(result.name, getLoc(node, ctx), ctx.currentEnvRef);
  }

  // Top-level (script) или module: hoist наверх
  ctx.hoistedFunctions.push(result.funcDecl);
  ctx.pendingStatements.push(...result.setupStatements);

  // Возвращаем ссылку на дескриптор в __env
  return getEnvFunctionRef(result.name, getLoc(node, ctx), ctx.currentEnvRef);
}

/**
 * Обрабатывает function expression
 */
export function visitFunctionExpression(
  node: ts.FunctionExpression,
  ctx: VisitorContext,
): IRExpression {
  // Bare mode: plain function без env/desc
  if (ctx.mode === "bare") return visitBareFunctionExpression(node, ctx);

  const originalName = node.name?.text ?? ctx.bindings.create("func");
  const isNestedInModule = ctx.mode === "module" && ctx.currentScope.type !== "module";
  const name = isNestedInModule ? ctx.bindings.hoistedName(originalName) : originalName;
  const params: IRFunctionParam[] = [];

  // Находим scope для этой функции
  const funcScope = ctx.scopeAnalysis.nodeToScope.get(node) || ctx.currentScope;

  // Per-call env: если function expression содержит локальные captured переменные
  const needsPerCallEnv = funcScope.hasCaptured;
  const perCallEnvName = needsPerCallEnv ? ctx.bindings.create("fn") + "_env" : undefined;

  const fnCtx: VisitorContext = {
    mode: ctx.mode,
    functionParams: new Map(),
    hoistedFunctions: ctx.hoistedFunctions,
    typeChecker: ctx.typeChecker,
    sourceFile: ctx.sourceFile,
    bindings: ctx.bindings,
    scopeAnalysis: ctx.scopeAnalysis,
    currentScope: funcScope,
    pendingStatements: [],
    currentEnvRef: perCallEnvName ?? "__env",
    currentEnvScope: funcScope,
    // Per-call env — не ставим closureEnvScope
    closureEnvScope: needsPerCallEnv ? undefined : undefined,
    xmlDocumentSymbol: ctx.xmlDocumentSymbol,
    xmlElemSymbol: ctx.xmlElemSymbol,
    importBindings: ctx.importBindings,
    helperFlags: ctx.helperFlags,
  };

  // Параметры
  node.parameters.forEach((param, index) => {
    if (ts.isIdentifier(param.name)) {
      const paramName = param.name.text;
      const varInfo = resolveVariableInScope(paramName, funcScope);
      const isCaptured = varInfo?.isCaptured ?? false;
      params.push(IR.param(paramName, undefined, undefined, needsPerCallEnv ? false : isCaptured));
      fnCtx.functionParams.set(paramName, index);
    }
  });

  // Тело
  let body = node.body ? visitStatementList(node.body.statements, fnCtx) : [];
  if (fnCtx.pendingStatements.length > 0) {
    body = [...fnCtx.pendingStatements, ...body];
  }

  // Prepend per-call env
  if (needsPerCallEnv && perCallEnvName) {
    const perCallEnvCreation = IR.varDecl(
      perCallEnvName,
      IR.object([IR.prop("__parent", IR.id("__env"))]),
    );

    const capturedParamAssignments: IRStatement[] = [];
    node.parameters.forEach((param) => {
      if (ts.isIdentifier(param.name)) {
        const paramVarInfo = resolveVariableInScope(param.name.text, funcScope);
        if (paramVarInfo?.isCaptured) {
          capturedParamAssignments.push(
            IR.exprStmt(
              IR.assign(
                "=",
                IR.dot(IR.id(perCallEnvName), param.name.text),
                IR.id(param.name.text),
              ),
            ),
          );
        }
      }
    });

    body = [perCallEnvCreation, ...capturedParamAssignments, ...body];
  }

  // Собираем captured переменные (аналогично arrow function)
  const capturedVars = collectCapturedVarsForArrow(funcScope, ctx);

  // Используем buildFunction для генерации env/desc паттерна
  const result = buildFunction({
    name,
    params,
    body,
    capturedVars,
    bindings: ctx.bindings,
    loc: getLoc(node, ctx),
    effectiveEnvRef: ctx.currentEnvRef,
    useRefFormat: ctx.mode === "module",
    registrationEnvRef: ctx.currentEnvRef,
    codelibraryDepth: getModuleEnvDepth(ctx),
  });

  // Script mode: вложенные функции остаются в своей functional scope
  const isNestedInScript = ctx.mode === "script" && ctx.currentScope.type !== "module";
  if (isNestedInScript) {
    ctx.pendingStatements.unshift(result.funcDecl, ...result.setupStatements);
    return getEnvFunctionRef(result.name, getLoc(node, ctx), ctx.currentEnvRef);
  }

  // Top-level (script) или module: hoist наверх
  ctx.hoistedFunctions.push(result.funcDecl);
  ctx.pendingStatements.push(...result.setupStatements);

  return getEnvFunctionRef(result.name, getLoc(node, ctx), ctx.currentEnvRef);
}

/**
 * Обрабатывает new expression.
 *
 * В script/module mode для классов (дескрипторов с proto):
 * `new Animal("Rex")` →
 * `bt.createInstance(__env.Animal, ["Rex"])`
 *
 * В bare mode — простой вызов (fallback).
 */
export function visitNewExpression(node: ts.NewExpression, ctx: VisitorContext): IRExpression {
  const args = node.arguments?.map((arg) => visitExpression(arg, ctx)) ?? [];
  const loc = getLoc(node, ctx);

  // bare mode: plain call (no class support)
  if (ctx.mode === "bare") {
    const callee = visitExpression(node.expression, ctx);
    return IR.call(callee, args, loc);
  }

  // script/module mode: bt.createInstance(ctorDesc, [args])
  // Резолвим конструктор через __env (как вызов функции)
  let callee: IRExpression;
  if (ts.isIdentifier(node.expression)) {
    callee = resolveCallableRef(node.expression.text, ctx, getLoc(node.expression, ctx));
  } else {
    callee = visitExpression(node.expression, ctx);
  }

  return IR.call(IR.dot(IR.id("bt"), "createInstance"), [callee, IR.array(args)], loc);
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Строит ссылку на переменную импортированного модуля (__module_X) через __env цепочку.
 *
 * Если какой-либо именованный импорт из модуля используется во вложенной функции
 * (isCaptured), переменная `__module_X` записывается в __env на уровне модуля.
 * Доступ к ней из вложенных функций осуществляется через __env.__parent цепочку,
 * аналогично обычным captured-переменным.
 *
 * @param moduleVar - Имя переменной модуля (например "__module___utils")
 * @param isCapturedImport - Является ли этот импорт captured (используется во вложенной функции)
 * @param ctx - Текущий VisitorContext
 * @returns IR выражение: прямой IR.id(moduleVar) или __env[.__parent...].moduleVar
 */
export function importModuleVarAccess(
  moduleVar: string,
  isCapturedImport: boolean,
  ctx: VisitorContext,
): IRExpression {
  if (!isCapturedImport) {
    return IR.id(moduleVar);
  }

  // Captured import: доступ через __env цепочку до module scope
  return resolveModuleLevelAccess(moduleVar, ctx);
}

/**
 * Строит ссылку на helper-функцию через цепочку __env.__parent.
 *
 * Хелперы (__ImportMeta_*, __AbsoluteUrl) зарегистрированы в top-level __env
 * (moduleScope). Если текущий код — внутри вложенной функции, нужно
 * пройти цепочку __parent до module-level __env.
 *
 * @param helperName - Имя хелпера (например "__ImportMeta_dirUrl")
 * @param ctx - Текущий VisitorContext
 * @returns IR выражение вида __env.__ImportMeta_dirUrl или __env.__parent.__ImportMeta_dirUrl
 */
export function helperEnvAccess(helperName: string, ctx: VisitorContext): IRExpression {
  return resolveModuleLevelAccess(helperName, ctx);
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
