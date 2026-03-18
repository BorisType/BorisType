/**
 * IR module - Intermediate Representation definitions
 *
 * @module ir
 */

export * from "./nodes.ts";
export { IR } from "./builders.ts";

/**
 * Exhaustiveness check для switch statements по discriminated union.
 *
 * В default ветке switch TypeScript сужает тип до `never`,
 * если все варианты обработаны. Если добавить новый IR node kind
 * и забыть обработать его, компилятор выдаст ошибку:
 * "Argument of type 'X' is not assignable to parameter of type 'never'".
 *
 * @param value - Значение, которое должно быть `never` (все ветки обработаны)
 */
export function assertNever(value: never): never {
  throw new Error(`Unhandled IR node kind: ${(value as any)?.kind ?? value}`);
}
