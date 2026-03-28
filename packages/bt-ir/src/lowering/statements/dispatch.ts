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
import { visitExpression, resolveCallableRef } from "../expressions.ts";
import { getLoc } from "../helpers.ts";
import { createBtDiagnostic, BtDiagnosticCode } from "../../pipeline/diagnostics.ts";
import { visitBareFunctionDeclaration, visitBareVariableStatement, visitBareNamespaceDeclaration } from "../bare-visitors.ts";
import {
  visitFunctionDeclaration,
  visitVariableStatement,
  visitImportDeclaration,
  visitExportDeclaration,
  visitExportAssignment,
  visitClassDeclaration,
} from "./declarations.ts";
import { visitIfStatement, visitSwitchStatement, visitTryStatement } from "./control-flow.ts";
import { visitForStatement, visitForInStatement, visitForOfStatement, visitWhileStatement, visitDoWhileStatement } from "./loops.ts";
import { visitBlock, visitReturnStatement } from "./blocks.ts";

/**
 * Обрабатывает statement
 */
export function visitStatement(node: ts.Node, ctx: VisitorContext): IRStatement | IRStatement[] | null {
  // Function declaration
  if (ts.isFunctionDeclaration(node)) {
    if (!ctx.config.useEnvDescPattern) return visitBareFunctionDeclaration(node, ctx);
    return visitFunctionDeclaration(node, ctx);
  }

  // Variable statement (let/const/var)
  if (ts.isVariableStatement(node)) {
    if (!ctx.config.useEnvDescPattern) return visitBareVariableStatement(node, ctx);
    return visitVariableStatement(node, ctx);
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
    if (!ctx.config.useEnvDescPattern) return visitBareNamespaceDeclaration(node, ctx);
    // script/module: namespace не поддерживается
    ctx.diagnostics.push(
      createBtDiagnostic(
        ctx.sourceFile,
        node,
        "Unhandled statement: ModuleDeclaration",
        ts.DiagnosticCategory.Warning,
        BtDiagnosticCode.ModuleDeclarationUnsupported,
      ),
    );
    return null;
  }

  // Import — генерируем require и заполняем importBindings для live binding
  if (ts.isImportDeclaration(node)) {
    // Without env/desc: all imports are stripped
    if (!ctx.config.useEnvDescPattern) return null;
    return visitImportDeclaration(node, ctx);
  }

  // Export declaration: export { a, b as c }
  if (ts.isExportDeclaration(node) && ctx.config.moduleExports) {
    return visitExportDeclaration(node, ctx);
  }
  if (ts.isExportDeclaration(node)) {
    return null;
  }

  // Export assignment: export default expr
  if (ts.isExportAssignment(node) && ctx.config.moduleExports) {
    return visitExportAssignment(node, ctx);
  }
  if (ts.isExportAssignment(node)) {
    return null;
  }

  // Type-only: interface, type alias, enum — пропускаем
  if (ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node) || ts.isEnumDeclaration(node)) {
    return null;
  }

  // Class declaration → prototype + constructor pattern
  if (ts.isClassDeclaration(node)) {
    if (!ctx.config.useEnvDescPattern) {
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
    return visitClassDeclaration(node, ctx);
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
