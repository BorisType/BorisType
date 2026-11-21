/**
 * TS Visitor - преобразование TypeScript AST в IR
 *
 * Entry point модуля lowering. Координирует обход TypeScript AST и генерацию IR.
 *
 * Структура модуля (после рефакторинга):
 * - visitor.ts — entry point, VisitorContext, transformToIR
 * - statements.ts — visitors для statements
 * - expressions.ts — visitors для expressions
 * - helpers.ts — вспомогательные функции (операторы, scope, location)
 * - binding.ts — менеджер генерации уникальных имён
 *
 * @module lowering/visitor
 */

import * as ts from "typescript";
import { IR, type IRProgram, type IRStatement } from "../ir/index.ts";
import { type ScopeAnalysisResult, type Scope } from "../analyzer/index.ts";
import { BindingManager } from "./binding.ts";
import { DEFAULT_COMPILE_MODE, type CompileMode, type ModeConfig, createModeConfig } from "./mode-config.ts";
import { visitStatement } from "./statements.ts";
import { createObjectUnionFunction } from "./spread-helpers.ts";

// ============================================================================
// Types
// ============================================================================

/**
 * Контекст visitor'а
 *
 * Передаётся во все visitor функции и содержит:
 * - Информацию о текущем scope
 * - Pending statements для hoisting
 * - TypeChecker для определения типов
 */
export interface VisitorContext {
  /** Режим транспиляции */
  mode: CompileMode;
  /** Настройки lowering для выбранного режима */
  config: Readonly<ModeConfig>;
  /** TypeScript TypeChecker */
  typeChecker: ts.TypeChecker;
  /** Исходный файл */
  sourceFile: ts.SourceFile;
  /** Менеджер генерации уникальных имён */
  bindings: BindingManager;
  /** Stable ids for source break/continue targets. Shared by child contexts. */
  controlTargetIds: Map<ts.Node, number>;
  /** Mutable counter shared by child contexts created with object spread. */
  nextControlTargetId: { value: number };
  /** Результат анализа scopes */
  scopeAnalysis: ScopeAnalysisResult;
  /** Текущий scope */
  currentScope: Scope;
  /**
   * Pending statements — вставляются перед текущим statement.
   *
   * Управляется через {@link withPendingScope} на границах flush.
   * Expression visitors пушат сюда напрямую, statement visitors
   * используют withPendingScope для гарантированного сбора.
   */
  pendingStatements: IRStatement[];
  /** Текущий env для captured: __env, __block0_env и т.д. */
  currentEnvRef: string;
  /**
   * Общие флаги для helper функций.
   * Объект передаётся по ссылке во все дочерние VisitorContext,
   * чтобы флаги, установленные внутри вложенных функций,
   * были видны на верхнем уровне при генерации helpers.
   */
  helperFlags: HelperFlags;
  /** Диагностики bt-ir (ошибки и предупреждения lowering) */
  diagnostics: ts.Diagnostic[];
}

/**
 * Флаги, определяющие нужны ли helper-функции.
 * Передаётся по ссылке через все вложенные VisitorContext.
 */
export interface HelperFlags {
  /** Нужна ли функция ObjectUnion (для spread в объектах) */
  needsObjectUnion: boolean;
}

// ============================================================================
// Pending statements scope management
// ============================================================================

/**
 * Результат выполнения функции внутри pending scope.
 *
 * @template T - Тип результата обёрнутой функции
 */
export interface PendingScopeResult<T> {
  /** Результат выполнения fn */
  result: T;
  /** Statements, накопленные в pendingStatements за время выполнения fn */
  hoisted: IRStatement[];
}

/**
 * Выполняет fn в изолированном pending scope.
 *
 * Сохраняет текущий pendingStatements, подставляет пустой массив,
 * выполняет fn, собирает накопленные statements и восстанавливает
 * предыдущий массив.
 *
 * Гарантирует что все push-и внутри fn будут собраны в `hoisted`,
 * а не потеряны или смешаны с внешним контекстом.
 *
 * @param ctx - Visitor context
 * @param fn - Функция для выполнения в изолированном scope
 * @returns Результат fn и накопленные pending statements
 */
export function withPendingScope<T>(ctx: VisitorContext, fn: () => T): PendingScopeResult<T> {
  const saved = ctx.pendingStatements;
  ctx.pendingStatements = [];
  const result = fn();
  const hoisted = ctx.pendingStatements;
  ctx.pendingStatements = saved;
  return { result, hoisted };
}

/**
 * Собирает hoisted statements и результат visitStatement в плоский массив.
 *
 * @param hoisted - Statements из pending scope
 * @param irNodes - Результат visitStatement (может быть null, statement или массив)
 * @returns Плоский массив IR statements
 */
export function collectStatements(hoisted: IRStatement[], irNodes: IRStatement | IRStatement[] | null): IRStatement[] {
  const out: IRStatement[] = [];
  if (hoisted.length > 0) {
    out.push(...hoisted);
  }
  if (irNodes) {
    if (Array.isArray(irNodes)) {
      out.push(...irNodes);
    } else {
      out.push(irNodes);
    }
  }
  return out;
}

// ============================================================================
// Main entry point
// ============================================================================

/**
 * Преобразует TypeScript SourceFile в IR Program
 *
 * Основная точка входа для lowering. Создаёт контекст и координирует
 * обход всех statements исходного файла.
 *
 * @param sourceFile - TypeScript SourceFile для преобразования
 * @param typeChecker - TypeScript TypeChecker для определения типов
 * @param scopeAnalysis - Результат анализа scopes
 * @returns IR Program
 */
export interface TransformToIROptions {
  /** Режим транспиляции */
  mode?: CompileMode;
}

/**
 * Результат transformToIR
 */
export interface TransformResult {
  /** IR программа */
  ir: IRProgram;
  /** Диагностики bt-ir (lowering) */
  diagnostics: ts.Diagnostic[];
}

/**
 * @param options - Опции lowering (mode и т.д.)
 */
export function transformToIR(
  sourceFile: ts.SourceFile,
  typeChecker: ts.TypeChecker,
  scopeAnalysis: ScopeAnalysisResult,
  options: TransformToIROptions = {},
): TransformResult {
  const mode = options.mode ?? DEFAULT_COMPILE_MODE;
  const ctx: VisitorContext = {
    mode,
    config: createModeConfig(mode),
    typeChecker,
    sourceFile,
    bindings: scopeAnalysis.bindings,
    controlTargetIds: new Map(),
    nextControlTargetId: { value: 0 },
    scopeAnalysis,
    currentScope: scopeAnalysis.moduleScope,
    pendingStatements: [],
    currentEnvRef: "__env",
    helperFlags: { needsObjectUnion: false },
    diagnostics: [],
  };

  const body: IRStatement[] = [];

  // Обрабатываем все statements
  for (const statement of sourceFile.statements) {
    const { result: irNodes, hoisted } = withPendingScope(ctx, () => visitStatement(statement, ctx));
    body.push(...collectStatements(hoisted, irNodes));
  }

  // Helper-функции (ObjectUnion при spread в объектах) — в самом начале
  const helperFunctions: IRStatement[] = ctx.helperFlags.needsObjectUnion ? [createObjectUnionFunction()] : [];

  return {
    ir: IR.program([...helperFunctions, ...body], sourceFile.fileName, ctx.config.noHoist),
    diagnostics: ctx.diagnostics,
  };
}

// ============================================================================
export { visitStatement, visitStatementList, visitBlock } from "./statements.ts";
export { visitExpression, visitIdentifier } from "./expressions.ts";
