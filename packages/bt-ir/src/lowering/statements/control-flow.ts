/**
 * Control-flow visitors — if, switch, try/catch/finally
 *
 * Содержит:
 * - visitIfStatement
 * - visitSwitchStatement
 * - visitTryStatement (десахаризация finally в IR pass)
 *
 * @module lowering/statements/control-flow
 */

import * as ts from "typescript";
import { IR, type IRStatement } from "../../ir/index.ts";
import type { VisitorContext } from "../visitor.ts";
import { visitExpression } from "../expressions.ts";
import { getLoc } from "../helpers.ts";
import { visitBlock, visitStatementList, visitStatementAsBlock } from "./blocks.ts";

// ============================================================================
// Control flow statements
// ============================================================================

/**
 * Обрабатывает if statement
 */
export function visitIfStatement(node: ts.IfStatement, ctx: VisitorContext): IRStatement {
  const test = visitExpression(node.expression, ctx);
  const consequent = visitStatementAsBlock(node.thenStatement, ctx);
  const alternate = node.elseStatement
    ? ts.isIfStatement(node.elseStatement)
      ? visitIfStatement(node.elseStatement, ctx)
      : visitStatementAsBlock(node.elseStatement, ctx)
    : null;

  return IR.if(test, consequent, alternate, getLoc(node, ctx));
}

/**
 * Обрабатывает switch statement
 */
export function visitSwitchStatement(node: ts.SwitchStatement, ctx: VisitorContext): IRStatement {
  const discriminant = visitExpression(node.expression, ctx);
  const cases = node.caseBlock.clauses.map((clause) => {
    const test = ts.isCaseClause(clause) ? visitExpression(clause.expression, ctx) : null;
    const consequent = visitStatementList(clause.statements, ctx);
    return IR.case(test, consequent);
  });

  return IR.switch(discriminant, cases, getLoc(node, ctx));
}

/**
 * Обрабатывает try statement.
 *
 * Конвертирует TS AST → IR. Десахаризация try-finally
 * выполняется позже в IR pass (tryFinallyDesugarPass).
 */
export function visitTryStatement(node: ts.TryStatement, ctx: VisitorContext): IRStatement {
  const block = visitBlock(node.tryBlock, ctx);

  let handler: import("../../ir/index.js").IRCatchClause | null = null;
  if (node.catchClause) {
    const param = node.catchClause.variableDeclaration
      ? ts.isIdentifier(node.catchClause.variableDeclaration.name)
        ? node.catchClause.variableDeclaration.name.text
        : null
      : null;
    const body = visitBlock(node.catchClause.block, ctx);
    handler = IR.catch(param, body);
  }

  const finalizer = node.finallyBlock ? visitBlock(node.finallyBlock, ctx) : null;

  return IR.try(block, handler, finalizer, getLoc(node, ctx));
}
