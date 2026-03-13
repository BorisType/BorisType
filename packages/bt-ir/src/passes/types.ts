/**
 * IR Pass type definitions
 *
 * Определяет интерфейс для IR→IR transformation passes,
 * которые выполняются между lowering и emitter.
 *
 * @module passes/types
 */

import type { IRProgram } from "../ir/index.ts";

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
   * Выполняет трансформацию IR программы.
   *
   * @param program - Входная IR программа
   * @returns Трансформированная IR программа
   */
  run(program: IRProgram): IRProgram;
}
