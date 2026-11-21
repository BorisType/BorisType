import type ts from "typescript";
import type { IRExpression, IRStatement } from "../ir/index.ts";
import {
  visitBareArrowFunction,
  visitBareFunctionDeclaration,
  visitBareFunctionExpression,
  visitBareNamespaceDeclaration,
  visitBareVariableStatement,
} from "./bare-visitors.ts";
import type { VisitorContext } from "./visitor.ts";

/** Compile modes available to the programmatic API and CLI. */
export const COMPILE_MODES = ["bare"] as const;
export type CompileMode = (typeof COMPILE_MODES)[number];

export const DEFAULT_COMPILE_MODE: CompileMode = "bare";

interface ModeVisitors {
  functionDeclaration(node: ts.FunctionDeclaration, ctx: VisitorContext): IRStatement | IRStatement[] | null;
  variableStatement(node: ts.VariableStatement, ctx: VisitorContext): IRStatement | IRStatement[] | null;
  namespaceDeclaration(node: ts.ModuleDeclaration, ctx: VisitorContext): IRStatement | IRStatement[] | null;
  arrowFunction(node: ts.ArrowFunction, ctx: VisitorContext): IRExpression;
  functionExpression(node: ts.FunctionExpression, ctx: VisitorContext): IRExpression;
}

export interface ModeConfig {
  visitors: Readonly<ModeVisitors>;
  /** Preserve top-level statement order instead of hoisting declarations. */
  noHoist: boolean;
}

const modeConfigs: Readonly<Record<CompileMode, ModeConfig>> = {
  bare: {
    noHoist: true,
    visitors: {
      functionDeclaration: visitBareFunctionDeclaration,
      variableStatement: visitBareVariableStatement,
      namespaceDeclaration: visitBareNamespaceDeclaration,
      arrowFunction: visitBareArrowFunction,
      functionExpression: visitBareFunctionExpression,
    },
  },
};

export function isCompileMode(mode: string): mode is CompileMode {
  return Object.hasOwn(modeConfigs, mode);
}

export function createModeConfig(mode: CompileMode): Readonly<ModeConfig> {
  if (!isCompileMode(mode)) {
    throw new Error(`Unsupported compile mode "${mode}". Available modes: ${COMPILE_MODES.join(", ")}.`);
  }
  return modeConfigs[mode];
}
