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
import { getControlTargetId, getLoc } from "../helpers.ts";
import { visitBlock, visitStatementList, visitStatementAsBlock } from "./blocks.ts";
import { BtDiagnosticCode, createBtDiagnostic } from "../../pipeline/diagnostics.ts";

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

  return IR.switch(discriminant, cases, getLoc(node, ctx), getControlTargetId(node, ctx));
}

/**
 * Обрабатывает try statement.
 *
 * Конвертирует TS AST → IR. Десахаризация try-finally
 * выполняется позже в IR pass (abruptCompletionDesugarPass).
 */
export function visitTryStatement(node: ts.TryStatement, ctx: VisitorContext): IRStatement {
  const block = visitBlock(node.tryBlock, ctx);

  let handler: import("../../ir/index.js").IRCatchClause | null = null;
  if (node.catchClause) {
    const binding = node.catchClause.variableDeclaration?.name;
    if (binding && !ts.isIdentifier(binding)) {
      ctx.diagnostics.push(
        createBtDiagnostic(
          ctx.sourceFile,
          binding,
          "Destructured catch binding pattern is not supported; use an identifier and destructure it inside the catch body.",
          ts.DiagnosticCategory.Error,
          BtDiagnosticCode.DestructuredCatchBinding,
        ),
      );
    }
    const catchScope = ctx.scopeAnalysis.nodeToScope.get(node.catchClause.block);
    const catchBinding = binding && ts.isIdentifier(binding) ? catchScope?.variables.get(binding.text) : undefined;
    const param =
      binding && ts.isIdentifier(binding) ? (catchBinding?.renamedTo ?? ctx.bindings.create("caught")) : ctx.bindings.create("caught");
    let body = visitBlock(node.catchClause.block, ctx);

    if (catchBinding?.isCaptured) {
      const envDecl = body.body[0];
      if (envDecl?.kind !== "EnvDeclaration") {
        throw new Error("Captured catch binding requires a block environment");
      }

      const property = catchBinding.renamedTo ?? catchBinding.name;
      body = IR.block([envDecl, IR.envAssign(envDecl.name, property, IR.id(param)), ...body.body.slice(1)], body.loc);
    }

    handler = IR.catch(param, body);
  }

  const finalizer = node.finallyBlock ? visitBlock(node.finallyBlock, ctx) : null;

  return IR.try(block, handler, finalizer, getLoc(node, ctx));
}
