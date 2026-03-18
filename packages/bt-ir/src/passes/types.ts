/**
 * IR Pass type definitions
 *
 * Определяет интерфейс для IR→IR transformation passes,
 * которые выполняются между lowering и emitter.
 *
 * @module passes/types
 */

import type * as ts from "typescript";
import type { IRProgram } from "../ir/index.ts";

/**
 * Контекст, разделяемый между passes.
 *
 * Позволяет passes пушить диагностики (вместо throw)
 * и получать контекстную информацию о компилируемом файле.
 */
export interface PassContext {
  /** Массив диагностик — passes пушат сюда ошибки и предупреждения */
  diagnostics: ts.Diagnostic[];
  /** SourceFile, если доступен (для привязки диагностик к позиции) */
  sourceFile?: ts.SourceFile;
}

/**
 * IR transformation pass.
 *
 * Каждый pass принимает IRProgram и возвращает трансформированную IRProgram.
 * Passes иммутабельны: не мутируют входные ноды, а создают новые при изменении.
 */
export interface IRPass {
  /** Уникальное имя pass (для логирования и отладки) */
  name: string;

  /**
   * Passes, которые ДОЛЖНЫ выполниться до этого.
   * `runPasses()` проверяет порядок и бросает ошибку при нарушении.
   */
  dependsOn?: string[];

  /**
   * Выполняет трансформацию IR программы.
   *
   * @param program - Входная IR программа
   * @param ctx - Контекст с диагностиками и метаданными
   * @returns Трансформированная IR программа
   */
  run(program: IRProgram, ctx: PassContext): IRProgram;
}
