/**
 * Определение режима транспиляции для файла
 *
 * @module build/compile-mode
 */

import { DEFAULT_COMPILE_MODE } from "@boristype/bt-ir";
import type ts from "typescript";
import type { BtcCompileOptions } from "./types.js";

const BT_MODE_DIRECTIVE = /^[ \t]*\/\/\/[ \t]*@bt-mode[ \t]+(\S+)/m;

export function resolveCompileMode(sourceFile: ts.SourceFile, options: BtcCompileOptions): string {
  const firstLines = sourceFile.getFullText().split("\n").slice(0, 30).join("\n");
  return firstLines.match(BT_MODE_DIRECTIVE)?.[1] ?? options.compileMode ?? DEFAULT_COMPILE_MODE;
}
