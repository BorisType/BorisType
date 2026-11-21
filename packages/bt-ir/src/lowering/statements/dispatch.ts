/**
 * Statement dispatcher — visitStatement
 *
 * Маршрутизирует все statement типы к соответствующим обработчикам.
 *
 * @module lowering/statements/dispatch
 */

import * as ts from "typescript";
import { IR, type IRStatement } from "../../ir/index.ts";
import type { VisitorContext } from "../visitor.ts";
import { visitExpression } from "../expressions.ts";
import { getControlTargetId, getLoc } from "../helpers.ts";
import { createBtDiagnostic, BtDiagnosticCode } from "../../pipeline/diagnostics.ts";
import { visitIfStatement, visitSwitchStatement, visitTryStatement } from "./control-flow.ts";
import { visitForStatement, visitForInStatement, visitForOfStatement, visitWhileStatement, visitDoWhileStatement } from "./loops.ts";
import { visitBlock, visitReturnStatement } from "./blocks.ts";

/**
 * Обрабатывает statement
 */
export function visitStatement(node: ts.Node, ctx: VisitorContext): IRStatement | IRStatement[] | null {
  // Label is preserved in IR and removed by abrupt-completion desugaring.
  if (ts.isLabeledStatement(node)) {
    let sourceTarget: ts.Statement = node.statement;
    while (ts.isLabeledStatement(sourceTarget)) {
      sourceTarget = sourceTarget.statement;
    }
    if (ts.isFunctionDeclaration(sourceTarget)) {
      ctx.diagnostics.push(
        createBtDiagnostic(
          ctx.sourceFile,
          sourceTarget,
          "Labelled function declarations (Annex B) are not supported; label a block instead.",
          ts.DiagnosticCategory.Error,
          BtDiagnosticCode.LabelledFunctionUnsupported,
        ),
      );
      return null;
    }

    const lowered = visitStatement(node.statement, ctx);
    const body = Array.isArray(lowered) ? IR.block(lowered) : (lowered ?? IR.empty(getLoc(node.statement, ctx)));
    const targetKind = ts.isIterationStatement(sourceTarget, false)
      ? "iteration"
      : ts.isSwitchStatement(sourceTarget)
        ? "switch"
        : "statement";

    return IR.labeled(node.label.text, body, getControlTargetId(sourceTarget, ctx), targetKind, getLoc(node, ctx));
  }

  // Function declaration
  if (ts.isFunctionDeclaration(node)) {
    return ctx.config.visitors.functionDeclaration(node, ctx);
  }

  // Variable statement (let/const/var)
  if (ts.isVariableStatement(node)) {
    return ctx.config.visitors.variableStatement(node, ctx);
  }

  // Return statement
  if (ts.isReturnStatement(node)) {
    return visitReturnStatement(node, ctx);
  }

  // Expression statement
  if (ts.isExpressionStatement(node)) {
    return IR.exprStmt(visitExpression(node.expression, ctx), getLoc(node, ctx));
  }

  // If statement
  if (ts.isIfStatement(node)) {
    return visitIfStatement(node, ctx);
  }

  // For statement
  if (ts.isForStatement(node)) {
    return visitForStatement(node, ctx);
  }

  // For-in statement
  if (ts.isForInStatement(node)) {
    return visitForInStatement(node, ctx);
  }

  // For-of statement → преобразуем в for-in с индексом
  if (ts.isForOfStatement(node)) {
    return visitForOfStatement(node, ctx);
  }

  // While statement
  if (ts.isWhileStatement(node)) {
    return visitWhileStatement(node, ctx);
  }

  // Do-while statement
  if (ts.isDoStatement(node)) {
    return visitDoWhileStatement(node, ctx);
  }

  // Switch statement
  if (ts.isSwitchStatement(node)) {
    return visitSwitchStatement(node, ctx);
  }

  // Try statement
  if (ts.isTryStatement(node)) {
    return visitTryStatement(node, ctx);
  }

  // Throw statement
  if (ts.isThrowStatement(node)) {
    return IR.throw(visitExpression(node.expression, ctx), getLoc(node, ctx));
  }

  // Break statement
  if (ts.isBreakStatement(node)) {
    return IR.break(node.label?.text, getLoc(node, ctx));
  }

  // Continue statement
  if (ts.isContinueStatement(node)) {
    return IR.continue(node.label?.text, getLoc(node, ctx));
  }

  // Block statement
  if (ts.isBlock(node)) {
    return visitBlock(node, ctx);
  }

  // Empty statement
  if (ts.isEmptyStatement(node)) {
    return IR.empty(getLoc(node, ctx));
  }

  // Namespace declaration: export namespace X { ... }
  if (ts.isModuleDeclaration(node)) {
    return ctx.config.visitors.namespaceDeclaration(node, ctx);
  }

  if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node) || ts.isExportAssignment(node)) {
    return null;
  }

  // Type-only: interface, type alias, enum — пропускаем
  if (ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node) || ts.isEnumDeclaration(node)) {
    return null;
  }

  // Class declaration
  if (ts.isClassDeclaration(node)) {
    ctx.diagnostics.push(
      createBtDiagnostic(
        ctx.sourceFile,
        node,
        "ClassDeclaration is not supported in bare mode",
        ts.DiagnosticCategory.Error,
        BtDiagnosticCode.ClassDeclarationBareMode,
      ),
    );
    return null;
  }

  ctx.diagnostics.push(
    createBtDiagnostic(
      ctx.sourceFile,
      node,
      `Unhandled statement: ${ts.SyntaxKind[node.kind]}`,
      ts.DiagnosticCategory.Error,
      BtDiagnosticCode.UnhandledStatement,
    ),
  );
  return null;
}
