/**
 * Call Expression Visitors — обработка вызовов функций и конструкторов
 *
 * Содержит:
 * - visitCallExpression (function/method calls, super, optional chains)
 * - visitNewExpression (constructor calls)
 * - resolveCallableRef (env-based callable resolution)
 *
 * @module lowering/expressions/calls
 */

import * as ts from "typescript";
import { IR, type IRExpression } from "../../ir/index.ts";
import type { VisitorContext } from "../visitor.ts";
import { resolveEnvAccess } from "../env-resolution.ts";
import {
  getLoc,
  getPolyfillType,
  isInternalAccess,
  isXmlRelatedType,
  isBuiltinFunction,
  resolveVariableInScope,
} from "../helpers.ts";
import { dispatchMethodCall } from "../call-helpers.ts";
import {
  POLYFILL_REST_AS_ARRAY_METHODS,
  POLYFILL_REST_POSITIONAL_COUNT,
} from "../../polyfill-spec.ts";
import { visitExpression, maybeExtract } from "./dispatch.ts";
import { importModuleVarAccess, helperEnvAccess } from "./module-access.ts";

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
  loc?: import("../../ir/index.ts").SourceLocation,
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

    // Without platform wrapping: direct call obj.method(...)
    if (!ctx.config.wrapCallExpression) {
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

    // Unified dispatch: все optional-chain комбинации obj.method() / obj?.method() / obj.method?.() / obj?.method?.()
    return dispatchMethodCall(
      obj,
      IR.string(methodName),
      args,
      propHasQuestionDot,
      callHasQuestionDot,
      ctx,
      loc,
    );
  }

  // obj["method"]() / obj?.["method"]() / obj["method"]?.()
  if (ts.isElementAccessExpression(node.expression)) {
    const targetExpr = node.expression.expression;
    const obj = visitExpression(targetExpr, ctx);
    const prop = visitExpression(node.expression.argumentExpression, ctx);
    const propHasQuestionDot = !!node.expression.questionDotToken;
    const callHasQuestionDot = !!node.questionDotToken;

    if (!ctx.config.wrapCallExpression) {
      if (propHasQuestionDot || callHasQuestionDot) return IR.id("__invalid__", loc);
      return IR.call(IR.member(obj, prop, true), args, loc);
    }

    if (isInternalAccess(targetExpr)) {
      return IR.call(IR.member(obj, prop, true), args, loc);
    }

    // Unified dispatch: все optional-chain комбинации obj["method"]() / obj?.["method"]() / obj["method"]?.() / obj?.["method"]?.()
    return dispatchMethodCall(obj, prop, args, propHasQuestionDot, callHasQuestionDot, ctx, loc);
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
    if (funcName === "AbsoluteUrl" && ctx.config.useEnvDescPattern) {
      ctx.helperFlags.usesAbsoluteUrl = true;
      ctx.helperFlags.usesImportMeta = true; // __AbsoluteUrl использует __ImportMeta_dirUrl
      const url = args[0] ?? IR.id("undefined", loc);
      const baseUrl = args[1] ?? IR.id("undefined", loc);
      return IR.btCallFunction(helperEnvAccess("__AbsoluteUrl", ctx), [url, baseUrl], loc);
    }

    if (!ctx.config.wrapCallExpression || isBuiltinFunction(funcName, ctx)) {
      return IR.call(IR.id(funcName), args, loc);
    }

    // Резолвим через __env для function-kind, через env-цепочку для captured
    const callee = resolveCallableRef(funcName, ctx, getLoc(node.expression, ctx));
    return IR.btCallFunction(callee, args, loc);
  }

  return IR.call(visitExpression(node.expression, ctx), args, loc);
}

// ============================================================================
// New expressions
// ============================================================================

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

  // Without platform wrapping: plain call (no class support)
  if (!ctx.config.wrapCallExpression) {
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
