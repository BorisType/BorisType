/**
 * Pass Manager — запуск IR passes в последовательности
 *
 * @module passes
 */

export type { IRPass, PassContext } from "./types.ts";
export { hoistPass } from "./hoist.ts";
/** @deprecated Use abruptCompletionDesugarPass; this export is an alias. */
export { tryFinallyDesugarPass } from "./try-finally-desugar.ts";
export { parenthesizePass } from "./parenthesize.ts";
export { cleanupGroupingPass } from "./cleanup-grouping.ts";
export { commaSafetyPass } from "./comma-safety.ts";
export { literalExtractPass } from "./literal-extract.ts";
export { abruptCompletionDesugarPass } from "./abrupt-completion-desugar.ts";
export { forUpdateDesugarPass, containsCommaOperator } from "./for-update-desugar.ts";
export {
  resolveControlTargets,
  type ControlTargetKind,
  type ResolvedControlTarget,
  type ResolvedControlJump,
  type ControlTargetResolution,
  type ControlTargetResolutionError,
} from "./control-target-resolver.ts";
export {
  mapStatements,
  mapExpression,
  forEachStatement,
  type StatementMapper,
  type StatementMapResult,
  type ExpressionMapper,
  type MapStatementsOptions,
} from "./walker.ts";

import * as ts from "typescript";
import type { IRProgram } from "../ir/index.ts";
import type { IRPass, PassContext } from "./types.ts";

/**
 * Последовательно применяет массив passes к IR программе.
 *
 * Каждый pass получает результат предыдущего и общий PassContext.
 * Если массив пустой — возвращает программу без изменений.
 * Валидирует порядок выполнения по `dependsOn`.
 * При ошибке в pass — добавляет имя pass в сообщение для отладки.
 * Останавливается после pass, добавившего Error diagnostics, сохраняя их позиции.
 *
 * @param program - Входная IR программа
 * @param passes - Массив passes для применения
 * @param ctx - Контекст с диагностиками
 * @returns Трансформированная IR программа
 */
export function runPasses(program: IRProgram, passes: IRPass[], ctx: PassContext): IRProgram {
  const executed = new Set<string>();
  let result = program;

  for (const pass of passes) {
    if (pass.dependsOn) {
      for (const dep of pass.dependsOn) {
        if (!executed.has(dep)) {
          throw new Error(`Pass "${pass.name}" depends on "${dep}" which hasn't been executed yet`);
        }
      }
    }

    const diagnosticCount = ctx.diagnostics.length;
    try {
      result = pass.run(result, ctx);
    } catch (e) {
      throw new Error(`Pass "${pass.name}" failed: ${e instanceof Error ? e.message : e}`, {
        cause: e,
      });
    }

    executed.add(pass.name);
    if (ctx.diagnostics.slice(diagnosticCount).some((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error)) {
      return result;
    }
  }

  return result;
}
