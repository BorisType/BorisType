/**
 * Function Helpers — выделенные паттерны для работы с функциями в lowering
 *
 * Консолидирует повторяющийся код:
 * - Per-call env: создание изолированного env при вызове функции
 * - Извлечение параметров функции из TS AST в IR
 * - Создание VisitorContext для вложенной функции
 * - Hoisting decision: куда поместить функцию (hoisted vs pending)
 *
 * @module lowering/function-helpers
 */

import * as ts from "typescript";
import { IR, type IRStatement, type IRFunctionParam, type IRExpression } from "../ir/index.ts";
import type { Scope } from "../analyzer/index.ts";
import type { VisitorContext } from "./visitor.ts";
import { createBtDiagnostic, BtDiagnosticCode } from "../pipeline/diagnostics.ts";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { resolveVariableInScope, collectCapturedVarsForArrow } from "./helpers.ts";

// ============================================================================
// Per-call env
// ============================================================================

/**
 * Результат создания per-call env
 */
export interface PerCallEnvResult {
  /** Имя per-call env переменной (например "__fn0_env"), undefined если per-call env не нужен */
  envName: string | undefined;
  /** Нужен ли per-call env */
  needed: boolean;
}

/**
 * Определяет необходимость per-call env и генерирует имя.
 *
 * Per-call env нужен когда функция содержит локальные captured переменные
 * (используемые вложенными замыканиями). Создаётся ВНУТРИ тела функции
 * при каждом вызове. Это решает:
 * 1. Shared-state баг (повторные вызовы не перезаписывают данные)
 * 2. Depth-баг (getEnvDepth корректно считает от funcScope)
 *
 * @param funcScope - Scope функции
 * @param ctx - Текущий VisitorContext
 * @returns Результат с именем env и флагом необходимости
 */
export function resolvePerCallEnv(funcScope: Scope, ctx: VisitorContext): PerCallEnvResult {
  const needed = funcScope.hasCaptured;
  const envName = needed ? ctx.bindings.create("fn") + "_env" : undefined;
  return { envName, needed };
}

/**
 * Создаёт IR statements для per-call env: объявление env-объекта
 * и копирование captured параметров.
 *
 * Генерирует:
 * ```javascript
 * var __fnN_env = { __parent: __env };
 * __fnN_env.paramName = paramName;
 * // ... для каждого captured параметра
 * ```
 *
 * @param envName - Имя per-call env переменной
 * @param tsParams - Параметры TS функции (для определения captured)
 * @param funcScope - Scope функции
 * @returns Массив IR statements для prepend в тело функции
 */
export function buildPerCallEnvStatements(
  envName: string,
  tsParams: ts.NodeArray<ts.ParameterDeclaration>,
  funcScope: Scope,
): IRStatement[] {
  const result: IRStatement[] = [];

  // var __fnN_env = new SafeObject(); __fnN_env.__parent = __env;
  result.push(IR.envDecl(envName, "__env"));

  // __fnN_env.paramName = paramName; для каждого captured параметра
  for (const param of tsParams) {
    if (ts.isIdentifier(param.name)) {
      const paramVarInfo = resolveVariableInScope(param.name.text, funcScope);
      if (paramVarInfo?.isCaptured) {
        result.push(IR.exprStmt(IR.assign("=", IR.dot(IR.id(envName), param.name.text), IR.id(param.name.text))));
      }
    }
  }

  return result;
}

// ============================================================================
// Parameter extraction
// ============================================================================

/**
 * Извлекает параметры функции из TS AST в IR.
 *
 * Заполняет fnCtx.functionParams карту с индексами параметров.
 *
 * @param tsParams - TS параметры функции
 * @param funcScope - Scope функции
 * @param fnCtx - VisitorContext тела функции (для functionParams и visitExpression)
 * @param needsPerCallEnv - Если true, captured-параметры не помечаются как captured в IR
 *   (они будут скопированы в per-call env отдельно)
 * @param visitExpr - Функция для визита выражений (default значения параметров)
 * @returns Массив IR параметров
 */
export function extractFunctionParams(
  tsParams: ts.NodeArray<ts.ParameterDeclaration>,
  funcScope: Scope,
  fnCtx: VisitorContext,
  needsPerCallEnv: boolean,
  visitExpr?: (node: ts.Expression, ctx: VisitorContext) => IRExpression,
): IRFunctionParam[] {
  const params: IRFunctionParam[] = [];

  tsParams.forEach((param, index) => {
    if (ts.isIdentifier(param.name)) {
      const paramName = param.name.text;
      const defaultValue = param.initializer && visitExpr ? visitExpr(param.initializer, fnCtx) : undefined;
      const isRest = !!param.dotDotDotToken;

      const varInfo = resolveVariableInScope(paramName, funcScope);
      const isCaptured = varInfo?.isCaptured ?? false;

      // При per-call env параметры извлекаются как обычные var,
      // а потом копируются в per-call env явным присваиванием
      params.push(IR.param(paramName, defaultValue, isRest, needsPerCallEnv ? false : isCaptured));
      fnCtx.functionParams.set(paramName, index);
    }
    // Destructured parameter — diagnostic error
    else {
      fnCtx.diagnostics.push(
        createBtDiagnostic(
          fnCtx.sourceFile,
          param,
          `Destructured parameters are not supported: ${param.name.getText(fnCtx.sourceFile)}`,
          ts.DiagnosticCategory.Error,
          BtDiagnosticCode.DestructuredParameter,
        ),
      );
    }
  });

  return params;
}

// ============================================================================
// Inner function context
// ============================================================================

/**
 * Опции для создания вложенного контекста функции
 */
export interface InnerFunctionContextOptions {
  /** Scope функции */
  funcScope: Scope;
  /** Текущий VisitorContext */
  ctx: VisitorContext;
  /** Per-call env result */
  perCallEnv: PerCallEnvResult;
  /** Captured переменные для определения closureEnvScope */
  capturedVars: import("./function-builder.ts").CapturedVarInfo[];
  /** Дополнительные поля для VisitorContext */
  extra?: Partial<VisitorContext>;
}

/**
 * Создаёт VisitorContext для тела вложенной функции (function decl, arrow, method, etc.).
 *
 * Общий паттерн: новый functionParams, pendingStatements, currentScope,
 * currentEnvRef из per-call env (или "__env"), closureEnvScope по логике captures.
 *
 * @returns Новый VisitorContext для вложенной функции
 */
export function createInnerFunctionContext(options: InnerFunctionContextOptions): VisitorContext {
  const { funcScope, ctx, perCallEnv, capturedVars, extra } = options;

  return {
    mode: ctx.mode,
    config: ctx.config,
    functionParams: new Map(),
    hoistedFunctions: ctx.hoistedFunctions,
    typeChecker: ctx.typeChecker,
    sourceFile: ctx.sourceFile,
    bindings: ctx.bindings,
    scopeAnalysis: ctx.scopeAnalysis,
    currentScope: funcScope,
    pendingStatements: [],
    currentEnvRef: perCallEnv.envName ?? "__env",
    currentEnvScope: funcScope,
    // closureEnvScope: когда per-call env — не ставим, т.к. visitIdentifier
    // должен использовать currentEnvRef (= per-call env) как базу.
    // Без per-call env при наличии captures — ставим parent scope.
    closureEnvScope: perCallEnv.needed ? undefined : capturedVars.length > 0 ? ctx.currentEnvScope : undefined,
    xmlDocumentSymbol: ctx.xmlDocumentSymbol,
    xmlElemSymbol: ctx.xmlElemSymbol,
    importBindings: ctx.importBindings,
    helperFlags: ctx.helperFlags,
    diagnostics: ctx.diagnostics,
    ...extra,
  };
}

// ============================================================================
// Hoisting decision
// ============================================================================

/**
 * Результат hoisting решения для функции
 */
export interface HoistingResult {
  /** "hoisted" = ctx.hoistedFunctions (top-level), "pending" = ctx.pendingStatements (nested script) */
  target: "hoisted" | "pending";
}

/**
 * Определяет куда поместить функцию: в hoistedFunctions (top-level) или pendingStatements (nested).
 *
 * Логика:
 * - Script mode, вложенная функция → pending (остаётся в своей functional scope)
 * - Top-level script или module mode → hoisted (выносится наверх)
 *
 * @param ctx - Текущий VisitorContext
 * @returns Результат решения
 */
export function resolveHoistingTarget(ctx: VisitorContext): HoistingResult {
  const isNestedInScript = !ctx.config.moduleExports && ctx.currentScope.type !== "module";
  if (isNestedInScript) {
    return { target: "pending" };
  }
  return { target: "hoisted" };
}

/**
 * Применяет результат hoisting: помещает funcDecl и setupStatements в правильные массивы.
 *
 * @param result - Результат buildFunction
 * @param ctx - VisitorContext
 */
export function applyHoisting(result: import("./function-builder.ts").FunctionBuildResult, ctx: VisitorContext): void {
  const { target } = resolveHoistingTarget(ctx);

  if (target === "pending") {
    // Script mode: вложенные функции остаются в своей functional scope
    ctx.pendingStatements.unshift(result.funcDecl, ...result.setupStatements);
  } else {
    // Top-level (script) или module: hoist наверх
    ctx.hoistedFunctions.push(result.funcDecl);
    ctx.pendingStatements.push(...result.setupStatements);
  }
}
