/**
 * BT Emitter - генерация BorisScript кода из IR
 *
 * Slim entry point — делегирует в emit-*.ts модули.
 *
 * @module emitter
 */

import type { IRProgram } from "../ir/index.ts";
import type { EmitContext } from "./emit-helpers.ts";
import { emitStatement } from "./emit-statements.ts";

export type { EmitOptions, EmitResult } from "./emit-helpers.ts";
import type { EmitOptions } from "./emit-helpers.ts";
import type { EmitResult } from "./emit-helpers.ts";

/**
 * Генерирует BorisScript код из IR программы
 */
export function emit(program: IRProgram, options: EmitOptions = {}): EmitResult {
  const ctx: EmitContext = {
    indent: 0,
    indentStr: "",
    options: {
      indentSize: options.indentSize ?? 4,
      useTabs: options.useTabs ?? false,
      sourceMap: options.sourceMap ?? false,
    },
    noHoist: program.noHoist,
  };

  const code = emitProgram(program, ctx);

  return { code };
}

/**
 * Генерирует код программы.
 * После hoist pass все hoisting уже выполнен в IR:
 * - В обычном режиме: функции, var-declarations (hoistOnly), присваивания
 * - В bare-режиме: statements в исходном порядке
 */
function emitProgram(program: IRProgram, ctx: EmitContext): string {
  const lines: string[] = [];

  for (const stmt of program.body) {
    lines.push(emitStatement(stmt, ctx));
  }

  return lines.join("\n");
}
