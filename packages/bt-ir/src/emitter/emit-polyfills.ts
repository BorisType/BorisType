/**
 * Polyfill emission — spec table and polyfill call emitter
 *
 * @module emitter/emit-polyfills
 */

import type { IRPolyfillCall } from "../ir/index.ts";
import type { EmitContext } from "./emit-helpers.ts";
import { emitExpression } from "./emit-expressions.ts";

/**
 * Исключения из стандартного bt.polyfill.type.method(target, args).
 * direct: прямой вызов target.method(args) — push, split
 * builtin: встроенная BS функция — ArrayUnion
 * rename: polyfill метод с другим именем — with → _with
 */
type PolyfillEmitRule =
  | { kind: "direct"; emit: (target: string, args: string[]) => string }
  | { kind: "builtin"; fn: string }
  | { kind: "rename"; polyfillMethod: string };

/**
 * BT polyfill методы требуют точное количество аргументов.
 * argCount — всего аргументов (target + params). undefined = переменная арность.
 * restAsArray — последний параметр собирает rest в массив (splice, unshift, toSpliced).
 */
type PolyfillArgSpec = {
  rule?: PolyfillEmitRule;
  argCount?: number;
  restAsArray?: boolean;
};

export const POLYFILL_SPEC: Record<string, Record<string, PolyfillArgSpec>> = {
  Array: {
    at: { argCount: 2 },
    copyWithin: { argCount: 4 },
    entries: { argCount: 1 },
    fill: { argCount: 4 },
    flat: { argCount: 2 },
    includes: { argCount: 3 },
    indexOf: { argCount: 3 },
    join: { argCount: 2 },
    keys: { argCount: 1 },
    lastIndexOf: { argCount: 3 },
    pop: { argCount: 1 },
    push: { rule: { kind: "direct", emit: (t, a) => `${t}.push(${a.join(", ")})` } },
    reverse: { argCount: 1 },
    shift: { argCount: 1 },
    slice: { argCount: 3 },
    splice: { argCount: 4, restAsArray: true },
    toReversed: { argCount: 1 },
    toSpliced: { argCount: 4, restAsArray: true },
    unshift: { argCount: 2, restAsArray: true },
    values: { argCount: 1 },
    with: { rule: { kind: "rename", polyfillMethod: "_with" }, argCount: 3 },
    concat: { rule: { kind: "builtin", fn: "ArrayUnion" } },
  },
  String: {
    at: { argCount: 2 },
    substr: { argCount: 3 },
    trim: { argCount: 1 },
    trimEnd: { argCount: 1 },
    trimStart: { argCount: 1 },
    // split: { rule: { kind: "direct", emit: (t, a) => `${t}.split(${a.join(", ")})` } },
  },
};

/**
 * Генерирует код polyfill call.
 * BT полифиллы требуют точное количество аргументов — дополняем undefined при необходимости.
 */
export function emitPolyfillCall(call: IRPolyfillCall, ctx: EmitContext): string {
  const target = emitExpression(call.target, ctx);
  let args = call.arguments.map((a) => emitExpression(a, ctx));
  const spec = POLYFILL_SPEC[call.polyfillType]?.[call.method];

  // Pad args to exact count (BT polyfill semantics)
  if (spec?.argCount !== undefined) {
    const needed = spec.argCount - 1; // target + method params
    while (args.length < needed) {
      args = [...args, "undefined"];
    }
  }

  const argsStr = args.length > 0 ? `, ${args.join(", ")}` : "";

  const rule = spec?.rule;

  if (rule) {
    switch (rule.kind) {
      case "direct":
        return rule.emit(target, args);
      case "builtin":
        return `${rule.fn}(${target}${argsStr})`;
      case "rename":
        return `bt.polyfill.${call.polyfillType}.${rule.polyfillMethod}(${target}${argsStr})`;
    }
  }

  return `bt.polyfill.${call.polyfillType}.${call.method}(${target}${argsStr})`;
}
