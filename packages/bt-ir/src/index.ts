/**
 * BT-IR: IR-based TypeScript to BorisScript Compiler
 *
 * Основная точка входа. Предоставляет API для компиляции
 * TypeScript в BorisScript через промежуточное представление (IR).
 *
 * @example
 * ```typescript
 * import { compile, compileFile } from "bt-ir";
 *
 * // Компиляция строки
 * const result = compile(sourceCode, { filename: "test.ts" });
 * console.log(result.code);
 *
 * // Компиляция файла
 * const fileResult = compileFile("./src/index.ts");
 * console.log(fileResult.code);
 * ```
 *
 * @module bt-ir
 */

export {
  compile,
  compileFile,
  compileSourceFile,
  type CompileOptions,
  type CompileResult,
  type CompileOutput,
  type CompileMode,
} from "./pipeline/index.ts";
export { type IRProgram, type IRStatement, type IRExpression } from "./ir/index.ts";
export { emit } from "./emitter/index.ts";
