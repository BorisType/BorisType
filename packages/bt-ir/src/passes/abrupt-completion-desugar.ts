/**
 * Structured abrupt-completion lowering.
 *
 * Labels and finalizers share a completion record. Native exceptions remain
 * exceptions; non-exceptional jumps never cross a user catch via throw.
 */

import {
  IR,
  type IRBlockStatement,
  type IRBreakStatement,
  type IRContinueStatement,
  type IRDoWhileStatement,
  type IRForInStatement,
  type IRForStatement,
  type IRFunctionDeclaration,
  type IRIfStatement,
  type IRLabeledStatement,
  type IRProgram,
  type IRStatement,
  type IRSwitchStatement,
  type IRTryStatement,
  type IRWhileStatement,
} from "../ir/index.ts";
import type { IRPass, PassContext } from "./types.ts";
import { resolveControlTargets, type ControlTargetResolution } from "./control-target-resolver.ts";
import type { BindingManager } from "../lowering/binding.ts";
import { mapStatements } from "./walker.ts";
import { BtDiagnosticCode, createBtDiagnosticAtLocation } from "../pipeline/diagnostics.ts";

const NORMAL = 0;
const RETURN = 1;
const THROW = 2;
const BREAK = 3;
const CONTINUE = 4;

interface CompletionNames {
  type: string;
  target?: string;
  value?: string;
}

interface TransformContext {
  names: CompletionNames;
  resolution: ControlTargetResolution;
  referencedLabelTargets: Set<number>;
  handlesFinalizers: boolean;
  nativeRegions: Set<IRStatement>;
  bindings: BindingManager;
}

interface StatementResult {
  statement: IRStatement;
  mayComplete: boolean;
}

interface StatementListResult {
  statements: IRStatement[];
  mayComplete: boolean;
}

/** Required lowering of synchronous labels/finalizers before target emission. */
export const abruptCompletionDesugarPass: IRPass = {
  name: "abrupt-completion-desugar",
  dependsOn: ["for-update-desugar"],
  run(program: IRProgram, ctx: PassContext): IRProgram {
    const resolution = resolveControlTargets(program);
    if (resolution.errors.length > 0) {
      for (const error of resolution.errors) {
        ctx.diagnostics.push(
          createBtDiagnosticAtLocation(
            ctx.sourceFile,
            error.statement.loc,
            error.message,
            undefined,
            BtDiagnosticCode.InvalidControlTarget,
          ),
        );
      }
      return program;
    }

    const body = transformExecutable(program.body, resolution, ctx);
    return body === program.body ? program : IR.program(body, program.sourceFile, program.noHoist);
  },
};

function transformExecutable(statements: IRStatement[], resolution: ControlTargetResolution, passContext: PassContext): IRStatement[] {
  const withNestedFunctions = mapStatements(statements, (statement) =>
    statement.kind === "FunctionDeclaration" ? transformNestedFunction(statement, resolution, passContext) : null,
  );
  const labels = collectLabelsInExecutable(withNestedFunctions);
  const handlesFinalizers = containsFinalizerInExecutable(withNestedFunctions);
  const nativeRegions = new Set<IRStatement>();
  const nativeJumps = new Set<IRStatement>();
  walkExecutable(withNestedFunctions, (statement) => {
    if (isNativeBoundary(statement) && canRemainNative(statement, resolution)) {
      nativeRegions.add(statement);
      walkExecutable([statement], (child) => {
        if (child.kind === "BreakStatement" || child.kind === "ContinueStatement") nativeJumps.add(child);
      });
    }
  });
  let hasJumps = false;
  walkExecutable(withNestedFunctions, (statement) => {
    if ((statement.kind === "BreakStatement" || statement.kind === "ContinueStatement") && !nativeJumps.has(statement)) hasJumps = true;
  });
  const referencedLabelTargets = new Set<number>();

  for (const [jump, resolved] of resolution.jumps) {
    if (jump.label && labels.has(resolved.target.id)) {
      referencedLabelTargets.add(resolved.target.id);
    }
  }

  // Labels that are never referenced are erased without a completion record.
  if (referencedLabelTargets.size === 0 && !handlesFinalizers) {
    const stripped = stripLabels(withNestedFunctions);
    return sameStatements(statements, stripped) ? statements : stripped;
  }

  const names: CompletionNames = {
    type: passContext.bindings.create("acType"),
    target: hasJumps ? passContext.bindings.create("acTarget") : undefined,
    value: handlesFinalizers ? passContext.bindings.create("acValue") : undefined,
  };
  const context: TransformContext = {
    names,
    resolution,
    referencedLabelTargets,
    handlesFinalizers,
    nativeRegions,
    bindings: passContext.bindings,
  };
  const transformed = transformStatementList(withNestedFunctions, context, handlesFinalizers);

  const declarations: IRStatement[] = [IR.varDecl(names.type, IR.number(NORMAL))];
  if (names.target) declarations.push(IR.varDecl(names.target, IR.number(0)));
  if (names.value) declarations.push(IR.varDecl(names.value, null));

  const dispatch: IRStatement[] = [];
  if (handlesFinalizers) {
    dispatch.push(
      IR.if(IR.binary("===", IR.id(names.type), IR.number(RETURN)), IR.block([IR.return(IR.id(requireCompletionValue(names)))])),
      IR.if(IR.binary("===", IR.id(names.type), IR.number(THROW)), IR.block([IR.throw(IR.id(requireCompletionValue(names)))])),
    );
  }

  return [...declarations, ...transformed.statements, ...dispatch];
}

function transformNestedFunction(statement: IRStatement, resolution: ControlTargetResolution, passContext: PassContext): IRStatement {
  if (statement.kind !== "FunctionDeclaration") return statement;

  const fn = statement as IRFunctionDeclaration;
  const body = transformExecutable(fn.body, resolution, passContext);
  return body === fn.body ? fn : IR.functionDecl(fn.name, fn.originalParams, body, fn.loc, fn.plainSignature);
}

function transformStatementList(statements: IRStatement[], context: TransformContext, useEscapeFrame: boolean): StatementListResult {
  const transformed: StatementResult[] = statements.map((statement) => transformStatement(statement, context));
  const mayComplete = transformed.some((result) => result.mayComplete);
  const flat = transformed.map((result) => result.statement);

  if (!mayComplete || !useEscapeFrame) {
    return { statements: flat, mayComplete };
  }

  const frameBody: IRStatement[] = [];
  for (const [index, result] of transformed.entries()) {
    frameBody.push(result.statement);
    // A direct completion already breaks this frame. At the end of a list,
    // the unconditional frame break makes a pending-state check redundant.
    const directBreak = result.statement.kind === "BlockStatement" && result.statement.body.at(-1)?.kind === "BreakStatement";
    if (result.mayComplete && !directBreak && index < transformed.length - 1) {
      frameBody.push(breakIfPending(context.names));
    }
  }
  frameBody.push(IR.break());

  return {
    statements: [IR.while(IR.bool(true), IR.block(frameBody))],
    mayComplete: true,
  };
}

function transformStatement(statement: IRStatement, context: TransformContext): StatementResult {
  switch (statement.kind) {
    case "FunctionDeclaration":
      return { statement, mayComplete: false };

    case "LabeledStatement":
      return transformLabeledStatement(statement as IRLabeledStatement, context);

    case "BlockStatement": {
      const block = statement as IRBlockStatement;
      const body = transformStatementList(block.body, context, true);
      return { statement: IR.block(body.statements, block.loc), mayComplete: body.mayComplete };
    }

    case "IfStatement": {
      const current = statement as IRIfStatement;
      const consequent = transformStatement(current.consequent, context);
      const alternate = current.alternate ? transformStatement(current.alternate, context) : null;
      return {
        statement: IR.if(current.test, consequent.statement, alternate?.statement ?? null, current.loc),
        mayComplete: consequent.mayComplete || (alternate?.mayComplete ?? false),
      };
    }

    case "ForStatement":
    case "ForInStatement":
    case "WhileStatement":
    case "DoWhileStatement":
      return transformIterationStatement(statement, context);

    case "SwitchStatement":
      return transformSwitchStatement(statement as IRSwitchStatement, context);

    case "TryStatement":
      return transformTryStatement(statement as IRTryStatement, context);

    case "ReturnStatement":
      return context.resolution.protectedReturns.has(statement) ? transformReturn(statement, context) : { statement, mayComplete: false };

    case "BreakStatement":
      return transformJump(statement as IRBreakStatement, BREAK, context);

    case "ContinueStatement":
      return transformJump(statement as IRContinueStatement, CONTINUE, context);

    case "VariableDeclaration":
    case "ExpressionStatement":
    case "ThrowStatement":
    case "EmptyStatement":
    case "EnvDeclaration":
    case "EnvAssign":
    case "CaseClause":
      return { statement, mayComplete: false };
  }
}

function transformReturn(statement: Extract<IRStatement, { kind: "ReturnStatement" }>, context: TransformContext): StatementResult {
  const valueName = requireCompletionValue(context.names);
  const value = statement.argument ?? IR.id("undefined");

  // Evaluate the expression before setting RETURN. If it throws, a source
  // catch (or generated finalizer wrapper) must observe the real exception.
  return {
    statement: IR.block([IR.exprStmt(IR.assign("=", IR.id(valueName), value)), assignNumber(context.names.type, RETURN), IR.break()]),
    mayComplete: true,
  };
}

function transformJump(
  statement: IRBreakStatement | IRContinueStatement,
  completionType: number,
  context: TransformContext,
): StatementResult {
  const resolved = context.resolution.jumps.get(statement);
  if (!resolved) throw new Error("Unresolved break/continue reached abrupt-completion rewrite");

  return {
    statement: IR.block([
      assignNumber(context.names.type, completionType),
      assignNumber(requireCompletionTarget(context.names), resolved.target.id),
      IR.break(),
    ]),
    mayComplete: true,
  };
}

function transformLabeledStatement(statement: IRLabeledStatement, context: TransformContext): StatementResult {
  const body = transformStatement(statement.body, context);
  const referenced = context.referencedLabelTargets.has(statement.controlTargetId);

  // Loop/switch boundaries consume completions with the shared target id.
  if (!referenced || statement.targetKind === "iteration" || statement.targetKind === "switch") {
    return body;
  }

  const frame = IR.while(
    IR.bool(true),
    IR.block([body.statement, ...(body.mayComplete ? [breakIfPending(context.names)] : []), IR.break()]),
  );
  const consume = IR.if(
    IR.binary("===", IR.id(context.names.type), IR.number(BREAK)),
    IR.block([
      IR.if(
        IR.binary("===", IR.id(requireCompletionTarget(context.names)), IR.number(statement.controlTargetId)),
        IR.block([assignNumber(context.names.type, NORMAL)]),
      ),
    ]),
  );

  return { statement: IR.block([frame, consume]), mayComplete: true };
}

function transformIterationStatement(
  statement: IRForStatement | IRForInStatement | IRWhileStatement | IRDoWhileStatement,
  context: TransformContext,
): StatementResult {
  if (context.nativeRegions.has(statement)) return { statement: stripLabels([statement])[0], mayComplete: false };
  const targetId = statement.controlTargetId;
  if (targetId === undefined) {
    throw new Error(`${statement.kind} is missing controlTargetId`);
  }

  const body = transformIterationBody(statement, context);
  const transformedBody = ensureBlock(body.statement);
  const guardedBody = body.mayComplete
    ? IR.block(
        [
          ...transformedBody.body,
          ...(context.names.target
            ? [
                consumeLoopCompletion(CONTINUE, targetId, IR.continue(), context.names),
                consumeLoopCompletion(BREAK, targetId, IR.break(), context.names),
              ]
            : []),
          breakIfPending(context.names),
        ],
        transformedBody.loc,
      )
    : body.statement;

  switch (statement.kind) {
    case "ForStatement": {
      const current = statement as IRForStatement;
      return {
        statement: IR.for(current.init, current.test, current.update, guardedBody, current.loc, current.controlTargetId),
        mayComplete: body.mayComplete,
      };
    }
    case "ForInStatement": {
      const current = statement as IRForInStatement;
      return {
        statement: IR.forIn(current.left, current.right, guardedBody, current.loc, current.controlTargetId),
        mayComplete: body.mayComplete,
      };
    }
    case "WhileStatement": {
      const current = statement as IRWhileStatement;
      return {
        statement: IR.while(current.test, guardedBody, current.loc, current.controlTargetId),
        mayComplete: body.mayComplete,
      };
    }
    case "DoWhileStatement": {
      const current = statement as IRDoWhileStatement;
      return {
        statement: IR.doWhile(guardedBody, current.test, current.loc, current.controlTargetId),
        mayComplete: body.mayComplete,
      };
    }
  }
}

/**
 * Keep a completion-free loop prefix outside escape frames. Its local native
 * jumps target this real iteration, with no intervening finalizer. In particular
 * a desugared for's update and condition exit need no completion record.
 * Once a child can produce nonlocal state, every remaining child uses frames.
 */
function transformIterationBody(
  statement: IRForStatement | IRForInStatement | IRWhileStatement | IRDoWhileStatement,
  context: TransformContext,
): StatementResult {
  const body = statement.body;
  if (body.kind !== "BlockStatement") return transformStatement(body, context);
  let prefixLength = 0;
  while (prefixLength < body.body.length && canRemainNative(body.body[prefixLength], context.resolution, statement.controlTargetId)) {
    prefixLength++;
  }
  if (prefixLength === 0) return transformStatement(body, context);

  const prefix = stripLabels(body.body.slice(0, prefixLength));
  const remaining = body.body.slice(prefixLength);
  // A single source block already encloses its own escape frame. No sibling
  // continuation needs another wrapper around that block.
  const suffix =
    remaining.length === 1 && remaining[0].kind === "BlockStatement"
      ? (() => {
          const result = transformStatement(remaining[0], context);
          return { statements: [result.statement], mayComplete: result.mayComplete };
        })()
      : transformStatementList(remaining, context, true);
  return { statement: IR.block([...prefix, ...suffix.statements], body.loc), mayComplete: suffix.mayComplete };
}

function transformSwitchStatement(statement: IRSwitchStatement, context: TransformContext): StatementResult {
  if (context.nativeRegions.has(statement)) return { statement: stripLabels([statement])[0], mayComplete: false };
  const targetId = statement.controlTargetId;
  if (targetId === undefined) throw new Error("SwitchStatement is missing controlTargetId");

  let mayComplete = false;
  const cases = statement.cases.map((clause) => {
    const consequent = transformStatementList(clause.consequent, context, true);
    mayComplete ||= consequent.mayComplete;
    if (!consequent.mayComplete) return IR.case(clause.test, consequent.statements);

    return IR.case(clause.test, [
      ...consequent.statements,
      ...(context.names.target ? [consumeSwitchBreak(targetId, context.names)] : []),
      breakIfPending(context.names),
    ]);
  });

  return {
    statement: IR.switch(statement.discriminant, cases, statement.loc, statement.controlTargetId),
    mayComplete,
  };
}

function transformTryStatement(statement: IRTryStatement, context: TransformContext): StatementResult {
  const block = transformStatement(statement.block, context);
  const handler = statement.handler ? transformStatement(statement.handler.body, context) : null;
  const finalizer = statement.finalizer ? transformStatement(statement.finalizer, context) : null;

  if (statement.finalizer) {
    return lowerTryFinally(statement, block, handler, finalizer!, context);
  }

  const mayComplete = block.mayComplete || (handler?.mayComplete ?? false);

  let tryBlock = ensureBlock(block.statement);
  if (statement.handler && context.handlesFinalizers && block.mayComplete) {
    tryBlock = appendThrowBridge(tryBlock, context.names);
  }

  return {
    statement: IR.try(
      tryBlock,
      statement.handler ? sourceCatch(statement.handler.param, ensureBlock(handler!.statement), context, block.mayComplete) : null,
      null,
      statement.loc,
    ),
    mayComplete,
  };
}

function lowerTryFinally(
  source: IRTryStatement,
  block: StatementResult,
  handler: StatementResult | null,
  finalizer: StatementResult,
  context: TransformContext,
): StatementResult {
  const valueName = requireCompletionValue(context.names);
  const caughtName = context.bindings.create("abruptError");

  let protectedStatement: IRStatement;
  if (source.handler) {
    const bridgedTryBlock = block.mayComplete
      ? appendThrowBridge(ensureBlock(block.statement), context.names)
      : ensureBlock(block.statement);
    protectedStatement = IR.try(
      bridgedTryBlock,
      sourceCatch(source.handler.param, ensureBlock(handler!.statement), context, block.mayComplete),
      null,
      source.loc,
    );
  } else {
    protectedStatement = block.statement;
  }

  const captureEscapingException = IR.try(
    ensureBlock(protectedStatement),
    IR.catch(
      caughtName,
      IR.block([IR.exprStmt(IR.assign("=", IR.id(valueName), IR.id(caughtName))), assignNumber(context.names.type, THROW)]),
    ),
    null,
    source.loc,
  );

  // A finalizer with no state-producing child cannot overwrite the record.
  // A native return/throw exits directly; an outer finalizer still catches a
  // native throw or receives a protected return. No save/reset/restore needed.
  if (!finalizer.mayComplete) {
    return { statement: IR.block([captureEscapingException, finalizer.statement]), mayComplete: true };
  }

  const savedType = context.bindings.create("savedType");
  const savedTarget = context.names.target ? context.bindings.create("savedTarget") : undefined;
  const savedValue = context.bindings.create("savedValue");

  const sequence: IRStatement[] = [
    IR.varDecl(savedType, null),
    ...(savedTarget ? [IR.varDecl(savedTarget, null)] : []),
    IR.varDecl(savedValue, null),
    captureEscapingException,
    IR.exprStmt(IR.assign("=", IR.id(savedType), IR.id(context.names.type))),
    ...(savedTarget ? [IR.exprStmt(IR.assign("=", IR.id(savedTarget), IR.id(requireCompletionTarget(context.names))))] : []),
    IR.exprStmt(IR.assign("=", IR.id(savedValue), IR.id(valueName))),
    assignNumber(context.names.type, NORMAL),
    ...(context.names.target ? [assignNumber(context.names.target, 0)] : []),
    IR.exprStmt(IR.assign("=", IR.id(valueName), IR.id("undefined"))),
    finalizer.statement,
    IR.if(
      IR.binary("===", IR.id(context.names.type), IR.number(NORMAL)),
      IR.block([
        IR.exprStmt(IR.assign("=", IR.id(context.names.type), IR.id(savedType))),
        ...(savedTarget ? [IR.exprStmt(IR.assign("=", IR.id(requireCompletionTarget(context.names)), IR.id(savedTarget)))] : []),
        IR.exprStmt(IR.assign("=", IR.id(valueName), IR.id(savedValue))),
      ]),
    ),
  ];

  return { statement: IR.block(sequence), mayComplete: true };
}

function appendThrowBridge(block: IRBlockStatement, names: CompletionNames): IRBlockStatement {
  const valueName = requireCompletionValue(names);
  return IR.block(
    [
      ...block.body,
      IR.if(
        IR.binary("===", IR.id(names.type), IR.number(THROW)),
        IR.block([assignNumber(names.type, NORMAL), IR.throw(IR.id(valueName))]),
      ),
    ],
    block.loc,
  );
}

function sourceCatch(param: string | null, body: IRBlockStatement, context: TransformContext, protectedBodyMayComplete: boolean) {
  // A real exception overrides any pending completion (e.g. a finalizer
  // throws during RETURN and an enclosing source catch recovers). A catch
  // starts a fresh completion region even on the finalizer fast path.
  // An unaffected local try/catch inside a fast-path finalizer must preserve
  // the outer saved completion, even when that local catch handles an error.
  return IR.catch(
    param,
    context.handlesFinalizers && protectedBodyMayComplete
      ? IR.block([assignNumber(context.names.type, NORMAL), ...body.body], body.loc)
      : body,
  );
}

/** A complete native boundary shields local jumps from outer synthetic frames. */
function canRemainNative(statement: IRStatement, resolution: ControlTargetResolution, enclosingIterationId?: number): boolean {
  const targetIds = new Set<number>();
  if (enclosingIterationId !== undefined) targetIds.add(enclosingIterationId);
  walkExecutable([statement], (child) => {
    if ("controlTargetId" in child && child.controlTargetId !== undefined) targetIds.add(child.controlTargetId);
  });
  let safe = true;
  walkExecutable([statement], (child) => {
    if (child.kind === "TryStatement" && child.finalizer) safe = false;
    if (child.kind === "ReturnStatement" && resolution.protectedReturns.has(child)) safe = false;
    if (child.kind === "BreakStatement" || child.kind === "ContinueStatement") {
      const jump = resolution.jumps.get(child);
      if (child.label || !jump || jump.crossedFinalizers.length > 0 || !targetIds.has(jump.target.id)) safe = false;
    }
  });
  return safe;
}

function isNativeBoundary(statement: IRStatement): boolean {
  return (
    statement.kind === "ForStatement" ||
    statement.kind === "ForInStatement" ||
    statement.kind === "WhileStatement" ||
    statement.kind === "DoWhileStatement" ||
    statement.kind === "SwitchStatement"
  );
}

function consumeLoopCompletion(completionType: number, targetId: number, nativeJump: IRStatement, names: CompletionNames): IRStatement {
  return IR.if(
    IR.binary("===", IR.id(names.type), IR.number(completionType)),
    IR.block([
      IR.if(
        IR.binary("===", IR.id(requireCompletionTarget(names)), IR.number(targetId)),
        IR.block([assignNumber(names.type, NORMAL), nativeJump]),
      ),
    ]),
  );
}

function consumeSwitchBreak(targetId: number, names: CompletionNames): IRStatement {
  return IR.if(
    IR.binary("===", IR.id(names.type), IR.number(BREAK)),
    IR.block([
      IR.if(
        IR.binary("===", IR.id(requireCompletionTarget(names)), IR.number(targetId)),
        IR.block([assignNumber(names.type, NORMAL), IR.break()]),
      ),
    ]),
  );
}

function breakIfPending(names: CompletionNames): IRStatement {
  return IR.if(IR.binary("!==", IR.id(names.type), IR.number(NORMAL)), IR.block([IR.break()]));
}

function assignNumber(name: string, value: number): IRStatement {
  return IR.exprStmt(IR.assign("=", IR.id(name), IR.number(value)));
}

function ensureBlock(statement: IRStatement): IRBlockStatement {
  return statement.kind === "BlockStatement" ? (statement as IRBlockStatement) : IR.block([statement]);
}

function requireCompletionValue(names: CompletionNames): string {
  if (!names.value) throw new Error("Abrupt completion value storage is not available in this executable scope");
  return names.value;
}

function requireCompletionTarget(names: CompletionNames): string {
  if (!names.target) throw new Error("Abrupt completion target storage is not available in this executable scope");
  return names.target;
}

function containsFinalizerInExecutable(statements: IRStatement[]): boolean {
  let found = false;
  walkExecutable(statements, (statement) => {
    if (statement.kind === "TryStatement" && (statement as IRTryStatement).finalizer) found = true;
  });
  return found;
}

function collectLabelsInExecutable(statements: IRStatement[]): Map<number, IRLabeledStatement> {
  const labels = new Map<number, IRLabeledStatement>();

  walkExecutable(statements, (statement) => {
    if (statement.kind === "LabeledStatement") {
      const label = statement as IRLabeledStatement;
      labels.set(label.controlTargetId, label);
    }
  });
  return labels;
}

function stripLabels(statements: IRStatement[]): IRStatement[] {
  return mapStatements(statements, (statement) => {
    if (statement.kind !== "LabeledStatement") return null;
    return stripLabels([statement.body]);
  });
}

function walkExecutable(statements: IRStatement[], visit: (statement: IRStatement) => void): void {
  for (const statement of statements) {
    visit(statement);
    switch (statement.kind) {
      case "FunctionDeclaration":
        break;
      case "LabeledStatement":
        walkExecutable([(statement as IRLabeledStatement).body], visit);
        break;
      case "BlockStatement":
        walkExecutable((statement as IRBlockStatement).body, visit);
        break;
      case "IfStatement": {
        const current = statement as IRIfStatement;
        walkExecutable([current.consequent], visit);
        if (current.alternate) walkExecutable([current.alternate], visit);
        break;
      }
      case "ForStatement":
      case "ForInStatement":
      case "WhileStatement":
      case "DoWhileStatement":
        walkExecutable([statement.body], visit);
        break;
      case "SwitchStatement":
        for (const clause of (statement as IRSwitchStatement).cases) walkExecutable(clause.consequent, visit);
        break;
      case "TryStatement": {
        const current = statement as IRTryStatement;
        walkExecutable(current.block.body, visit);
        if (current.handler) walkExecutable(current.handler.body.body, visit);
        if (current.finalizer) walkExecutable(current.finalizer.body, visit);
        break;
      }
    }
  }
}

function sameStatements(left: IRStatement[], right: IRStatement[]): boolean {
  return left.length === right.length && left.every((statement, index) => statement === right[index]);
}
