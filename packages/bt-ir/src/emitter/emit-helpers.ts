/**
 * Emitter helpers — shared context, indent utilities
 *
 * @module emitter/emit-helpers
 */

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
