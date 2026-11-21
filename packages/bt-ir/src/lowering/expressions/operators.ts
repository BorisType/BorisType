/**
 * Operator Visitors — binary и unary expression обработка
 *
 * Содержит:
 * - visitBinaryExpression (assignment, logical, arithmetic)
 * - visitPrefixUnaryExpression
 * - visitPostfixUnaryExpression
 *
 * @module lowering/expressions/operators
 */

import * as ts from "typescript";
import { IR, type IRExpression } from "../../ir/index.ts";
import type { VisitorContext } from "../visitor.ts";
import { getLoc, isAssignmentOperator, getAssignmentOperator, getUnaryOperator } from "../helpers.ts";
import { visitExpression, maybeExtract } from "./dispatch.ts";
import { createBtDiagnostic, BtDiagnosticCode } from "../../pipeline/diagnostics.ts";

// ============================================================================
// Binary expressions
// ============================================================================

/**
 * Обрабатывает binary expression
 */
export function visitBinaryExpression(node: ts.BinaryExpression, ctx: VisitorContext): IRExpression {
  const operatorToken = node.operatorToken.kind;

  // Assignment operators
  if (isAssignmentOperator(operatorToken)) {
    const operator = getAssignmentOperator(operatorToken);
    const right = visitExpression(node.right, ctx);

    // Property access assignment: obj.prop = value
    if (ts.isPropertyAccessExpression(node.left)) {
      const obj = visitExpression(node.left.expression, ctx);
      const propName = node.left.name.text;

      const left = IR.dot(obj, propName, getLoc(node.left, ctx));
      if (operator === "=") {
        return IR.assign(operator, left, right, getLoc(node, ctx));
      }
      const currentValue = IR.dot(obj, propName, getLoc(node.left, ctx));
      const binaryOp = operator.slice(0, -1) as any;
      const newValue = IR.binary(binaryOp, currentValue, right);
      return IR.assign("=", left, newValue, getLoc(node, ctx));
    }

    // Element access assignment: obj[key] = value
    if (ts.isElementAccessExpression(node.left)) {
      const obj = visitExpression(node.left.expression, ctx);
      const key = visitExpression(node.left.argumentExpression, ctx);

      const left = IR.member(obj, key, true, getLoc(node.left, ctx));
      if (operator === "=") {
        return IR.assign(operator, left, right, getLoc(node, ctx));
      }
      const currentValue = IR.member(obj, key, true, getLoc(node.left, ctx));
      const binaryOp = operator.slice(0, -1) as any;
      const newValue = IR.binary(binaryOp, currentValue, right);
      return IR.assign("=", left, newValue, getLoc(node, ctx));
    }

    // Обычное присваивание (идентификатор)
    const left = visitExpression(node.left, ctx);
    if (left.kind === "Identifier" || left.kind === "MemberExpression") {
      return IR.assign(operator, left as any, right, getLoc(node, ctx));
    }

    ctx.diagnostics.push(
      createBtDiagnostic(
        ctx.sourceFile,
        node,
        "Invalid assignment target",
        ts.DiagnosticCategory.Error,
        BtDiagnosticCode.InvalidAssignmentTarget,
      ),
    );
    return IR.id("__invalid__");
  }

  // Logical operators — maybeExtract для безопасного инлайна conditional
  if (operatorToken === ts.SyntaxKind.AmpersandAmpersandToken) {
    const left = maybeExtract(visitExpression(node.left, ctx), ctx);
    const right = maybeExtract(visitExpression(node.right, ctx), ctx);
    return IR.logical("&&", left, right, getLoc(node, ctx));
  }

  if (operatorToken === ts.SyntaxKind.BarBarToken) {
    const left = maybeExtract(visitExpression(node.left, ctx), ctx);
    const right = maybeExtract(visitExpression(node.right, ctx), ctx);
    return IR.logical("||", left, right, getLoc(node, ctx));
  }

  if (operatorToken === ts.SyntaxKind.QuestionQuestionToken) {
    // В BorisScript нет оператора ??.
    ctx.diagnostics.push(
      createBtDiagnostic(
        ctx.sourceFile,
        node,
        "?? is not supported in bare mode",
        ts.DiagnosticCategory.Error,
        BtDiagnosticCode.NullishCoalescingBareMode,
      ),
    );
    return IR.id("__invalid__");
  }

  // Binary operators — maybeExtract для безопасного инлайна conditional
  const operator = ts.tokenToString(operatorToken);
  if (!operator) {
    ctx.diagnostics.push(
      createBtDiagnostic(
        ctx.sourceFile,
        node,
        `Unknown operator: ${ts.SyntaxKind[operatorToken]}`,
        ts.DiagnosticCategory.Error,
        BtDiagnosticCode.UnknownOperator,
      ),
    );
    return IR.id("__unknown__");
  }

  const left = maybeExtract(visitExpression(node.left, ctx), ctx);
  const right = maybeExtract(visitExpression(node.right, ctx), ctx);
  return IR.binary(operator as any, left, right, getLoc(node, ctx));
}

// ============================================================================
// Unary expressions
// ============================================================================

/**
 * Обрабатывает prefix unary expression
 */
export function visitPrefixUnaryExpression(node: ts.PrefixUnaryExpression, ctx: VisitorContext): IRExpression {
  const operator = node.operator;

  // ++/-- prefix
  if (operator === ts.SyntaxKind.PlusPlusToken || operator === ts.SyntaxKind.MinusMinusToken) {
    const arg = visitExpression(node.operand, ctx);
    if (arg.kind === "Identifier" || arg.kind === "MemberExpression") {
      return IR.update(operator === ts.SyntaxKind.PlusPlusToken ? "++" : "--", arg as any, true, getLoc(node, ctx));
    }
  }

  // Unary operators
  const opStr = getUnaryOperator(operator);
  return IR.unary(opStr, visitExpression(node.operand, ctx), true, getLoc(node, ctx));
}

/**
 * Обрабатывает postfix unary expression
 */
export function visitPostfixUnaryExpression(node: ts.PostfixUnaryExpression, ctx: VisitorContext): IRExpression {
  const arg = visitExpression(node.operand, ctx);

  if (arg.kind === "Identifier" || arg.kind === "MemberExpression") {
    return IR.update(node.operator === ts.SyntaxKind.PlusPlusToken ? "++" : "--", arg as any, false, getLoc(node, ctx));
  }

  ctx.diagnostics.push(
    createBtDiagnostic(
      ctx.sourceFile,
      node,
      "Invalid update expression operand",
      ts.DiagnosticCategory.Error,
      BtDiagnosticCode.InvalidUpdateOperand,
    ),
  );
  return IR.id("__invalid__");
}
