/**
 * Literal & Identifier Visitors — обработка идентификаторов, шаблонных строк, объектов и массивов
 *
 * Содержит:
 * - visitIdentifier
 * - visitTemplateExpression
 * - visitObjectLiteral
 * - visitArrayLiteral
 *
 * @module lowering/expressions/literals
 */

import * as ts from "typescript";
import {
  IR,
  type IRStatement,
  type IRExpression,
  type IRFunctionDeclaration,
  type IRObjectProperty,
} from "../../ir/index.ts";
import type { VisitorContext } from "../visitor.ts";
import { createBtDiagnostic, BtDiagnosticCode } from "../../pipeline/diagnostics.ts";
import { visitStatementList } from "../statements.ts";
import { resolveEnvAccess, getModuleEnvDepth } from "../env-resolution.ts";
import { getLoc, resolveVariableInScope, collectCapturedVarsForArrow } from "../helpers.ts";
import { buildFunction, assignDescriptorObj, getEnvFunctionRef } from "../function-builder.ts";
import {
  resolvePerCallEnv,
  buildPerCallEnvStatements,
  extractFunctionParams,
  createInnerFunctionContext,
} from "../function-helpers.ts";
import { visitBareObjectMethod } from "../bare-visitors.ts";
import { visitExpression, maybeExtract } from "./dispatch.ts";
import { importModuleVarAccess } from "./module-access.ts";

// ============================================================================
// Identifier
// ============================================================================

/**
 * Обрабатывает identifier
 */
export function visitIdentifier(node: ts.Identifier, ctx: VisitorContext): IRExpression {
  const name = node.text;
  const loc = getLoc(node, ctx);

  // Without env/desc pattern: direct identifier, no importBindings/argsAccess/envAccess
  if (!ctx.config.useEnvDescPattern) {
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
// Object literals
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
        ctx.diagnostics.push(
          createBtDiagnostic(
            ctx.sourceFile,
            prop.name,
            `Computed property keys are not supported: ${prop.name.getText(ctx.sourceFile)}`,
            ts.DiagnosticCategory.Error,
            BtDiagnosticCode.ComputedPropertyKey,
          ),
        );
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
      // Without env/desc: plain function, no desc/env
      if (!ctx.config.useEnvDescPattern) {
        const funcName = visitBareObjectMethod(prop, ctx);
        properties.push(IR.prop(prop.name.text, IR.id(funcName)));
        continue;
      }

      const methodName = prop.name.text;
      const methodScopeResolved = ctx.scopeAnalysis.nodeToScope.get(prop) ?? ctx.currentScope;
      const capturedVars =
        methodScopeResolved !== ctx.currentScope
          ? collectCapturedVarsForArrow(methodScopeResolved, ctx)
          : [];
      const perCallEnv = resolvePerCallEnv(methodScopeResolved, ctx);

      const fnCtx = createInnerFunctionContext({
        funcScope: methodScopeResolved,
        ctx,
        perCallEnv,
        capturedVars,
      });
      const params = extractFunctionParams(
        prop.parameters,
        methodScopeResolved,
        fnCtx,
        perCallEnv.needed,
      );

      // Тело метода
      let body = visitStatementList(prop.body.statements, fnCtx);
      if (fnCtx.pendingStatements.length > 0) {
        body = [...fnCtx.pendingStatements, ...body];
      }

      // Prepend per-call env
      if (perCallEnv.needed && perCallEnv.envName) {
        body = [
          ...buildPerCallEnvStatements(perCallEnv.envName, prop.parameters, methodScopeResolved),
          ...body,
        ];
      }

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
        useRefFormat: ctx.config.useRefFormat,
        registrationEnvRef: ctx.currentEnvRef,
        codelibraryDepth: getModuleEnvDepth(ctx),
      });

      // Module mode: все функции на top-level; script: локальный hoisting
      if (ctx.config.moduleExports) {
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
    // Script: вставляем hoisted функции в начало pendingStatements
    // Module: функции уже в ctx.hoistedFunctions (top-level)
    if (!ctx.config.moduleExports) {
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

// ============================================================================
// Array literals
// ============================================================================

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
