/**
 * Pass Manager — запуск IR passes в последовательности
 *
 * @module passes
 */

export type { IRPass } from "./types.ts";
export { hoistPass } from "./hoist.ts";
export { tryFinallyDesugarPass } from "./try-finally-desugar.ts";
export {
  mapStatements,
  mapExpression,
  forEachStatement,
  type StatementMapper,
  type StatementMapResult,
  type ExpressionMapper,
  type MapStatementsOptions,
} from "./walker.ts";

import type { IRProgram } from "../ir/index.ts";
import type { IRPass } from "./types.ts";

/**
 * Последовательно применяет массив passes к IR программе.
 *
 * Каждый pass получает результат предыдущего.
 * Если массив пустой — возвращает программу без изменений.
 * При ошибке в pass — добавляет имя pass в сообщение для отладки.
 *
 * @param program - Входная IR программа
 * @param passes - Массив passes для применения
 * @returns Трансформированная IR программа
 */
export function runPasses(program: IRProgram, passes: IRPass[]): IRProgram {
  let result = program;
  for (const pass of passes) {
    try {
      result = pass.run(result);
    } catch (e) {
      throw new Error(`Pass "${pass.name}" failed: ${e instanceof Error ? e.message : e}`, {
        cause: e,
      });
    }
  }
  return result;
}
