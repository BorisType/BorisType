/** Lexical resolution of break/continue targets before control-flow rewrite. */

import type {
  IRBlockStatement,
  IRBreakStatement,
  IRContinueStatement,
  IRDoWhileStatement,
  IRForInStatement,
  IRForStatement,
  IRFunctionDeclaration,
  IRIfStatement,
  IRLabeledStatement,
  IRProgram,
  IRReturnStatement,
  IRStatement,
  IRSwitchStatement,
  IRTryStatement,
  IRWhileStatement,
} from "../ir/index.ts";

/** Source boundary category, independent of generated escape frames. */
export type ControlTargetKind = "iteration" | "switch" | "statement";

/** A lexical target and the source finalizers active when entering it. */
export interface ResolvedControlTarget {
  id: number;
  kind: ControlTargetKind;
  statement: IRStatement;
  activeFinalizers: readonly IRTryStatement[];
}

/** A jump's exact target and the finalizers it must cross on its way out. */
export interface ResolvedControlJump {
  target: ResolvedControlTarget;
  crossedFinalizers: readonly IRTryStatement[];
}

/** Invalid source control flow, retaining its original IR location. */
export interface ControlTargetResolutionError {
  message: string;
  statement: IRStatement;
}

/** Resolution contract consumed by structured abrupt-completion rewriting. */
export interface ControlTargetResolution {
  jumps: Map<IRBreakStatement | IRContinueStatement, ResolvedControlJump>;
  /** Returns that must execute at least one enclosing source finalizer. */
  protectedReturns: Set<IRReturnStatement>;
  errors: ControlTargetResolutionError[];
}

interface LabelEntry {
  name: string;
  target: ResolvedControlTarget;
}

interface ResolverState {
  breakTargets: ResolvedControlTarget[];
  continueTargets: ResolvedControlTarget[];
  labels: LabelEntry[];
  activeFinalizers: IRTryStatement[];
  targetsById: Map<number, ResolvedControlTarget>;
  nextSyntheticTargetId: number;
}

/** Resolves every jump independently inside each executable scope. */
export function resolveControlTargets(program: IRProgram): ControlTargetResolution {
  const result: ControlTargetResolution = {
    jumps: new Map(),
    protectedReturns: new Set(),
    errors: [],
  };

  resolveExecutable(program.body, result);
  return result;
}

function resolveExecutable(statements: IRStatement[], result: ControlTargetResolution): void {
  const state: ResolverState = {
    breakTargets: [],
    continueTargets: [],
    labels: [],
    activeFinalizers: [],
    targetsById: new Map(),
    nextSyntheticTargetId: -1,
  };

  visitStatements(statements, state, result);
}

function visitStatements(statements: IRStatement[], state: ResolverState, result: ControlTargetResolution): void {
  for (const statement of statements) {
    visitStatement(statement, state, result);
  }
}

function visitStatement(statement: IRStatement, state: ResolverState, result: ControlTargetResolution): void {
  switch (statement.kind) {
    case "FunctionDeclaration":
      resolveExecutable((statement as IRFunctionDeclaration).body, result);
      return;

    case "LabeledStatement":
      visitLabeledStatement(statement as IRLabeledStatement, state, result);
      return;

    case "BlockStatement":
      visitStatements((statement as IRBlockStatement).body, state, result);
      return;

    case "IfStatement": {
      const current = statement as IRIfStatement;
      visitStatement(current.consequent, state, result);
      if (current.alternate) visitStatement(current.alternate, state, result);
      return;
    }

    case "ForStatement":
    case "ForInStatement":
    case "WhileStatement":
    case "DoWhileStatement":
      visitIterationStatement(statement, state, result);
      return;

    case "SwitchStatement":
      visitSwitchStatement(statement as IRSwitchStatement, state, result);
      return;

    case "TryStatement":
      visitTryStatement(statement as IRTryStatement, state, result);
      return;

    case "BreakStatement":
      resolveBreak(statement as IRBreakStatement, state, result);
      return;

    case "ContinueStatement":
      resolveContinue(statement as IRContinueStatement, state, result);
      return;

    case "VariableDeclaration":
    case "ExpressionStatement":
    case "ThrowStatement":
    case "EmptyStatement":
    case "EnvDeclaration":
    case "EnvAssign":
    case "CaseClause":
      return;
    case "ReturnStatement":
      if (state.activeFinalizers.length > 0) result.protectedReturns.add(statement);
      return;
  }
}

function visitLabeledStatement(statement: IRLabeledStatement, state: ResolverState, result: ControlTargetResolution): void {
  if (state.labels.some((entry) => entry.name === statement.label)) {
    result.errors.push({ message: `Duplicate active label: ${statement.label}`, statement });
  }

  const target = getTarget(statement.controlTargetId, statement.targetKind, statement, state);
  state.labels.push({ name: statement.label, target });
  visitStatement(statement.body, state, result);
  state.labels.pop();
}

function visitIterationStatement(
  statement: IRForStatement | IRForInStatement | IRWhileStatement | IRDoWhileStatement,
  state: ResolverState,
  result: ControlTargetResolution,
): void {
  const target = getTarget(statement.controlTargetId, "iteration", statement, state);
  state.breakTargets.push(target);
  state.continueTargets.push(target);
  visitStatement(statement.body, state, result);
  state.continueTargets.pop();
  state.breakTargets.pop();
}

function visitSwitchStatement(statement: IRSwitchStatement, state: ResolverState, result: ControlTargetResolution): void {
  const target = getTarget(statement.controlTargetId, "switch", statement, state);
  state.breakTargets.push(target);
  for (const clause of statement.cases) {
    visitStatements(clause.consequent, state, result);
  }
  state.breakTargets.pop();
}

function visitTryStatement(statement: IRTryStatement, state: ResolverState, result: ControlTargetResolution): void {
  if (statement.finalizer) state.activeFinalizers.push(statement);
  visitStatement(statement.block, state, result);
  if (statement.handler) visitStatement(statement.handler.body, state, result);
  if (statement.finalizer) state.activeFinalizers.pop();

  // A completion originating in a finalizer must not run that same finalizer
  // again, but it still crosses every outer active finalizer.
  if (statement.finalizer) visitStatement(statement.finalizer, state, result);
}

function resolveBreak(statement: IRBreakStatement, state: ResolverState, result: ControlTargetResolution): void {
  const target = statement.label ? findLabel(statement.label, state)?.target : state.breakTargets.at(-1);

  if (!target) {
    result.errors.push({
      message: statement.label ? `Undefined break label: ${statement.label}` : "break has no enclosing target",
      statement,
    });
    return;
  }

  recordJump(statement, target, state, result);
}

function resolveContinue(statement: IRContinueStatement, state: ResolverState, result: ControlTargetResolution): void {
  const label = statement.label ? findLabel(statement.label, state) : undefined;
  const target = statement.label ? label?.target : state.continueTargets.at(-1);

  if (!target) {
    result.errors.push({
      message: statement.label ? `Undefined continue label: ${statement.label}` : "continue has no enclosing iteration target",
      statement,
    });
    return;
  }

  if (target.kind !== "iteration") {
    result.errors.push({ message: `continue label is not an iteration target: ${statement.label}`, statement });
    return;
  }

  recordJump(statement, target, state, result);
}

function recordJump(
  statement: IRBreakStatement | IRContinueStatement,
  target: ResolvedControlTarget,
  state: ResolverState,
  result: ControlTargetResolution,
): void {
  const targetDepth = target.activeFinalizers.length;
  const targetPrefixMatches = target.activeFinalizers.every((finalizer, index) => state.activeFinalizers[index] === finalizer);

  if (!targetPrefixMatches) {
    result.errors.push({ message: "control-flow target is not in the current lexical region", statement });
    return;
  }

  result.jumps.set(statement, {
    target,
    crossedFinalizers: state.activeFinalizers.slice(targetDepth),
  });
}

function findLabel(name: string, state: ResolverState): LabelEntry | undefined {
  return state.labels.findLast((entry) => entry.name === name);
}

function getTarget(
  requestedId: number | undefined,
  kind: ControlTargetKind,
  statement: IRStatement,
  state: ResolverState,
): ResolvedControlTarget {
  const id = requestedId ?? state.nextSyntheticTargetId--;
  const existing = state.targetsById.get(id);
  if (existing) return existing;

  const target: ResolvedControlTarget = {
    id,
    kind,
    statement,
    activeFinalizers: [...state.activeFinalizers],
  };
  state.targetsById.set(id, target);
  return target;
}
