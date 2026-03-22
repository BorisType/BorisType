/**
 * Block и Statement List visitors
 *
 * Содержит:
 * - visitReturnStatement
 * - visitBlock
 * - visitStatementList
 * - visitStatementAsBlock
 *
 * @module lowering/statements/blocks
 */

import * as ts from "typescript";
import { IR, type IRStatement } from "../../ir/index.ts";
import type { VisitorContext } from "../visitor.ts";
import { withPendingScope, collectStatements } from "../visitor.ts";
import { visitExpression } from "../expressions.ts";
import { getLoc } from "../helpers.ts";
import { visitStatement } from "./dispatch.ts";

/**
 * Обрабатывает return statement
 */
export function visitReturnStatement(node: ts.ReturnStatement, ctx: VisitorContext): IRStatement {
  return IR.return(
    node.expression ? visitExpression(node.expression, ctx) : null,
    getLoc(node, ctx),
  );
}

/**
 * Обрабатывает block
 */
export function visitBlock(
  node: ts.Block,
  ctx: VisitorContext,
): import("../../ir/index.js").IRBlockStatement {
  // Проверяем есть ли block scope для этого блока
  const blockScope = ctx.scopeAnalysis.nodeToScope.get(node);

  if (blockScope && blockScope !== ctx.currentScope) {
    const blockCtx: VisitorContext = { ...ctx, currentScope: blockScope };

    // Block env только если есть captured let/const
    // Для for-of тело цикла — block env создаётся в visitForOfStatement, используем ctx
    const isForOfLoopBody =
      node.parent && ts.isForOfStatement(node.parent) && node.parent.statement === node;
    if (blockScope.hasCaptured && !isForOfLoopBody) {
      const blockEnvName = ctx.bindings.create("block") + "_env";
      const blockEnvDecl = IR.envDecl(blockEnvName, ctx.currentEnvRef);
      const blockCtxWithEnv: VisitorContext = {
        ...blockCtx,
        currentEnvRef: blockEnvName,
        currentEnvScope: blockScope,
      };
      const body = visitStatementList(node.statements, blockCtxWithEnv);
      return IR.block([blockEnvDecl, ...body], getLoc(node, ctx));
    }
    if (isForOfLoopBody && blockScope.hasCaptured) {
      const loopBodyCtx: VisitorContext = { ...blockCtx, currentEnvScope: blockScope };
      return IR.block(visitStatementList(node.statements, loopBodyCtx), getLoc(node, ctx));
    }
    return IR.block(visitStatementList(node.statements, blockCtx), getLoc(node, ctx));
  }

  return IR.block(visitStatementList(node.statements, ctx), getLoc(node, ctx));
}

/**
 * Обрабатывает список statements
 */
export function visitStatementList(
  statements: ts.NodeArray<ts.Statement>,
  ctx: VisitorContext,
): IRStatement[] {
  const result: IRStatement[] = [];

  for (const stmt of statements) {
    const { result: irNodes, hoisted } = withPendingScope(ctx, () => visitStatement(stmt, ctx));
    result.push(...collectStatements(hoisted, irNodes));
  }

  return result;
}

/**
 * Преобразует statement в block (оборачивает если нужно)
 */
export function visitStatementAsBlock(
  node: ts.Statement,
  ctx: VisitorContext,
): import("../../ir/index.js").IRBlockStatement {
  if (ts.isBlock(node)) {
    return visitBlock(node, ctx);
  }

  const { result: stmt, hoisted } = withPendingScope(ctx, () => visitStatement(node, ctx));
  const body = collectStatements(hoisted, stmt);

  return IR.block(body, getLoc(node, ctx));
}
