/**
 * Спецификация polyfill методов для BT.
 * Используется в emitter (генерация кода) и lowering (сбор аргументов).
 *
 * BT polyfill методы требуют точное количество аргументов.
 * restAsArray — последний параметр собирает rest в массив (splice, unshift, toSpliced).
 *
 * @module polyfill-spec
 */

export const POLYFILL_REST_AS_ARRAY_METHODS: Record<string, string[]> = {
  Array: ["splice", "unshift", "toSpliced"],
};

/**
 * Для restAsArray методов: количество позиционных аргументов до rest.
 * splice(start, deleteCount, ...items) → 2 позиционных
 * unshift(...items) → 0 позиционных, все в items
 * toSpliced(start, deleteCount, ...items) → 2 позиционных
 */
export const POLYFILL_REST_POSITIONAL_COUNT: Record<string, Record<string, number>> = {
  Array: {
    splice: 2,
    unshift: 0,
    toSpliced: 2,
  },
};
