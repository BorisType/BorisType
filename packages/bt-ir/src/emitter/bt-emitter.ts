/**
 * BT Emitter - генерация BorisScript кода из IR
 *
 * Slim entry point — делегирует в emit-*.ts модули.
 *
 * @module emitter
 */

import type { IRProgram, IRStatement } from "../ir/index.ts";
import type { EmitContext } from "./emit-helpers.ts";
import { collectVariableNames } from "./emit-helpers.ts";
import { emitStatement } from "./emit-statements.ts";
import { emitStatementHoisted } from "./emit-hoisting.ts";

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
 * Генерирует код программы с hoisting переменных
 * Порядок:
 * - Обычный режим: 1) функции, 2) объявления переменных, 3) остальной код
 * - Bare-режим: statements в исходном порядке без hoisting на top-level.
 *   Hoisting переменных выполняется только внутри функций.
 */
function emitProgram(program: IRProgram, ctx: EmitContext): string {
  const lines: string[] = [];

  // Bare mode: top-level — 1:1, без hoisting.
  // Переменные хоистятся только внутри функций (в emitFunction).
  if (ctx.noHoist) {
    for (const stmt of program.body) {
      lines.push(emitStatement(stmt, ctx));
    }
    return lines.join("\n");
  }

  // Разделяем функции и остальные statements
  const functions: IRStatement[] = [];
  const otherStmts: IRStatement[] = [];

  for (const stmt of program.body) {
    if (stmt.kind === "FunctionDeclaration") {
      functions.push(stmt);
    } else {
      otherStmts.push(stmt);
    }
  }

  // 1. Выводим функции
  for (const fn of functions) {
    lines.push(emitStatement(fn, ctx));
  }

  // 2. Собираем и выводим объявления переменных
  const varNames = collectVariableNames(otherStmts);
  for (const name of varNames) {
    lines.push(`var ${name};`);
  }

  // 3. Выводим остальной код (с заменой var на присваивания)
  for (const stmt of otherStmts) {
    lines.push(emitStatementHoisted(stmt, ctx));
  }

  return lines.join("\n");
}
