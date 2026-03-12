/**
 * Emitter helpers — shared context, indent, variable collection
 *
 * @module emitter/emit-helpers
 */

import type { IRStatement } from "../ir/index.ts";

/**
 * Опции генерации кода
 */
export interface EmitOptions {
  /** Размер отступа (по умолчанию 4 пробела) */
  indentSize?: number;
  /** Использовать табы вместо пробелов */
  useTabs?: boolean;
  /** Генерировать source map */
  sourceMap?: boolean;
}

/**
 * Результат генерации кода
 */
export interface EmitResult {
  /** Сгенерированный код */
  code: string;
  /** Source map (если запрошен) */
  map?: string;
}

/**
 * Контекст генерации
 */
export interface EmitContext {
  /** Текущий отступ */
  indent: number;
  /** Строка отступа */
  indentStr: string;
  /** Опции */
  options: Required<EmitOptions>;
  /**
   * Если true, не хоистить функции и переменные — эмитить как есть.
   * Используется в bare-режиме.
   */
  noHoist?: boolean;
  /** Source map builder */
  // TODO: add source map support
}

/**
 * Возвращает строку отступа
 */
export function getIndent(ctx: EmitContext): string {
  const char = ctx.options.useTabs ? "\t" : " ".repeat(ctx.options.indentSize);
  return char.repeat(ctx.indent);
}

/**
 * Возвращает новый контекст с увеличенным отступом
 */
export function increaseIndent(ctx: EmitContext): EmitContext {
  return { ...ctx, indent: ctx.indent + 1 };
}

/**
 * Собирает все уникальные имена переменных из statements (рекурсивно)
 * Не заходит внутрь функций (у них своя область видимости)
 */
export function collectVariableNames(statements: IRStatement[]): Set<string> {
  const vars = new Set<string>();

  function visit(stmt: IRStatement): void {
    switch (stmt.kind) {
      case "VariableDeclaration":
        // Пропускаем captured переменные - они живут в __env
        if (!stmt.isCaptured) {
          vars.add(stmt.name);
        }
        break;

      case "BlockStatement":
        stmt.body.forEach(visit);
        break;

      case "IfStatement":
        visit(stmt.consequent);
        if (stmt.alternate) visit(stmt.alternate);
        break;

      case "ForStatement":
        if (stmt.init && stmt.init.kind === "VariableDeclaration") {
          if (!stmt.init.isCaptured) {
            vars.add(stmt.init.name);
          }
        }
        visit(stmt.body);
        break;

      case "ForInStatement":
        if (stmt.left.kind === "VariableDeclaration") {
          if (!stmt.left.isCaptured) {
            vars.add(stmt.left.name);
          }
        }
        visit(stmt.body);
        break;

      case "WhileStatement":
      case "DoWhileStatement":
        visit(stmt.body);
        break;

      case "SwitchStatement":
        for (const c of stmt.cases) {
          c.consequent.forEach(visit);
        }
        break;

      case "TryStatement":
        visit(stmt.block);
        if (stmt.handler) {
          // Не добавляем catch-параметр в hoisted vars:
          // catch(err) — параметр локален для catch-блока,
          // var err; в начале функции затенит его и сделает undefined.
          visit(stmt.handler.body);
        }
        if (stmt.finalizer) visit(stmt.finalizer);
        break;

      // FunctionDeclaration - не заходим внутрь
      // Остальные statements не содержат переменных
    }
  }

  statements.forEach(visit);
  return vars;
}
