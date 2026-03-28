/**
 * Env Resolution — унифицированный доступ к переменным через __env цепочку
 *
 * Все обращения к captured-переменным, импортам, хелперам и __codelibrary
 * проходят через одну и ту же логику:
 * 1. Определить depth (количество __parent переходов)
 * 2. Если мы внутри замыкания (closureEnvScope) — IR.envAccess(depth, key)
 * 3. Иначе — построить IR: currentEnvRef.__parent.__parent...key
 *
 * Этот модуль содержит shared-функции для единообразного построения
 * env-chain IR выражений, исключая дублирование между:
 * - visitIdentifier (captured params / captured vars)
 * - importModuleVarAccess
 * - helperEnvAccess
 * - buildFunction (codelibraryDepth → lib)
 *
 * @module lowering/env-resolution
 */

import { IR, type IRExpression, type SourceLocation } from "../ir/index.ts";
import { getEnvDepth, type Scope } from "../analyzer/index.ts";
import type { VisitorContext } from "./visitor.ts";

// ============================================================================
// Low-level: IR chain building
// ============================================================================

/**
 * Строит IR-выражение env-цепочки: `envRef.__parent.__parent...`
 *
 * При depth=0 возвращает `IR.id(envRef)`.
 * При depth=N добавляет N уровней `.__parent`.
 *
 * @param envRef - Базовое имя окружения (например `"__env"`, `"__fn0_env"`, `"__block0_env"`)
 * @param depth - Количество переходов через `__parent`
 * @param _loc - Опциональная source location
 * @returns IR-выражение для базы цепочки (без финального свойства)
 *
 * @example
 * ```typescript
 * // depth=0 → IR.id("__fn0_env")
 * // depth=1 → IR.dot(IR.id("__fn0_env"), "__parent")
 * // depth=2 → IR.dot(IR.dot(IR.id("__fn0_env"), "__parent"), "__parent")
 * buildEnvChainBase("__fn0_env", 2)
 * ```
 */
export function buildEnvChainBase(envRef: string, depth: number, _loc?: SourceLocation): IRExpression {
  let expr: IRExpression = IR.id(envRef);
  for (let i = 0; i < depth; i++) {
    expr = IR.dot(expr, "__parent");
  }
  return expr;
}

/**
 * Строит полное IR-выражение доступа к свойству через env-цепочку:
 * `envRef.__parent.__parent...property`
 *
 * @param envRef - Базовое имя окружения
 * @param depth - Количество переходов через `__parent`
 * @param property - Имя свойства для доступа
 * @param loc - Опциональная source location
 * @returns IR-выражение доступа к свойству
 *
 * @example
 * ```typescript
 * // depth=0 → __fn0_env.x
 * // depth=1 → __fn0_env.__parent.x
 * // depth=2 → __fn0_env.__parent.__parent.x
 * buildEnvChainAccess("__fn0_env", 2, "x")
 * ```
 */
export function buildEnvChainAccess(envRef: string, depth: number, property: string, loc?: SourceLocation): IRExpression {
  const base = buildEnvChainBase(envRef, depth, loc);
  return IR.dot(base, property, loc);
}

// ============================================================================
// High-level: unified env variable access
// ============================================================================

/**
 * Унифицированный доступ к переменной/свойству через env-цепочку.
 *
 * Обрабатывает два контекста:
 * - **Внутри замыкания** (`ctx.closureEnvScope` задан): генерирует `IR.envAccess(depth, key)`,
 *   что при эмиссии станет `__env.__parent...key`
 * - **Вне замыкания** (inline code): строит цепочку от `ctx.currentEnvRef`
 *
 * @param targetScope - Scope, в котором объявлена переменная (куда идём)
 * @param property - Имя свойства для доступа
 * @param ctx - Текущий VisitorContext
 * @param loc - Опциональная source location
 * @returns IR-выражение для доступа к переменной
 */
export function resolveEnvAccess(targetScope: Scope, property: string, ctx: VisitorContext, loc?: SourceLocation): IRExpression {
  const envScope = ctx.closureEnvScope ?? ctx.currentEnvScope;
  const depth = envScope ? getEnvDepth(envScope, targetScope) : 0;

  if (ctx.closureEnvScope) {
    return IR.envAccess(depth, property, loc);
  }

  return buildEnvChainAccess(ctx.currentEnvRef, depth, property, loc);
}

/**
 * Доступ к переменной/хелперу на уровне модуля через env-цепочку.
 *
 * Специализированная версия `resolveEnvAccess` для случаев, когда
 * target scope = moduleScope (imports, helpers, __codelibrary).
 *
 * @param property - Имя свойства на module-level __env
 * @param ctx - Текущий VisitorContext
 * @param loc - Опциональная source location
 * @returns IR-выражение для доступа к module-level свойству
 */
export function resolveModuleLevelAccess(property: string, ctx: VisitorContext, loc?: SourceLocation): IRExpression {
  return resolveEnvAccess(ctx.scopeAnalysis.moduleScope, property, ctx, loc);
}

/**
 * Вычисляет depth от текущего env scope до module scope.
 *
 * Используется для `codelibraryDepth` в `buildFunction` —
 * определяет сколько `__parent` нужно пройти от envName до root __env
 * где лежит `__codelibrary`.
 *
 * @param ctx - Текущий VisitorContext
 * @returns Depth до module scope (0 если уже на module level)
 */
export function getModuleEnvDepth(ctx: VisitorContext): number {
  if (!ctx.config.moduleExports) return 0;
  const envScope = ctx.currentEnvScope ?? ctx.currentScope;
  return getEnvDepth(envScope, ctx.scopeAnalysis.moduleScope);
}
