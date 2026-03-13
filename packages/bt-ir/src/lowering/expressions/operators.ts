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
import {
  getLoc,
  isInternalAccess,
  isXmlRelatedType,
  isAssignmentOperator,
  getAssignmentOperator,
  getUnaryOperator,
} from "../helpers.ts";
import { needsParentheses, getPrecedence } from "../precedence.ts";
import { visitExpression, maybeExtract } from "./dispatch.ts";

// ============================================================================
// Binary expressions
// ============================================================================

/**
 * Обрабатывает binary expression
 */
export function visitBinaryExpression(
  node: ts.BinaryExpression,
  ctx: VisitorContext,
): IRExpression {
  const operatorToken = node.operatorToken.kind;

  // Assignment operators
  if (isAssignmentOperator(operatorToken)) {
    const operator = getAssignmentOperator(operatorToken);
    let right = visitExpression(node.right, ctx);
    if (ts.isBinaryExpression(node.right) && needsParentheses(node, node.right, false)) {
      right = IR.grouping(right, getLoc(node.right, ctx));
    }

    // Property access assignment: obj.prop = value
    if (ts.isPropertyAccessExpression(node.left)) {
      const obj = visitExpression(node.left.expression, ctx);
      const propName = node.left.name.text;

      if (isInternalAccess(node.left.expression) || !ctx.config.wrapPropertyAccess) {
        const left = IR.dot(obj, propName, getLoc(node.left, ctx));
        if (operator === "=") {
          return IR.assign(operator, left, right, getLoc(node, ctx));
        }
        const currentValue = IR.dot(obj, propName, getLoc(node.left, ctx));
        const binaryOp = operator.slice(0, -1) as any;
        const newValue = IR.binary(binaryOp, currentValue, right);
        return IR.assign("=", left, newValue, getLoc(node, ctx));
      }
      // XML-типы: прямое присваивание без bt.setProperty (оптимизация)
      if (
        isXmlRelatedType(
          ctx.typeChecker,
          node.left.expression,
          ctx.xmlDocumentSymbol,
          ctx.xmlElemSymbol,
        )
      ) {
        const left = IR.dot(obj, propName, getLoc(node.left, ctx));
        if (operator === "=") {
          return IR.assign(operator, left, right, getLoc(node, ctx));
        }
        const currentValue = IR.dot(obj, propName, getLoc(node.left, ctx));
        const binaryOp = operator.slice(0, -1) as any;
        const newValue = IR.binary(binaryOp, currentValue, right);
        return IR.assign("=", left, newValue, getLoc(node, ctx));
      }
      if (operator === "=") {
        return IR.btSetProperty(obj, IR.string(propName), right, getLoc(node, ctx));
      }
      const currentValue = IR.btGetProperty(obj, IR.string(propName));
      const binaryOp = operator.slice(0, -1) as any;
      const newValue = IR.binary(binaryOp, currentValue, right);
      return IR.btSetProperty(obj, IR.string(propName), newValue, getLoc(node, ctx));
    }

    // Element access assignment: obj[key] = value
    if (ts.isElementAccessExpression(node.left)) {
      const obj = visitExpression(node.left.expression, ctx);
      const key = visitExpression(node.left.argumentExpression, ctx);

      if (isInternalAccess(node.left.expression) || !ctx.config.wrapPropertyAccess) {
        const left = IR.member(obj, key, true, getLoc(node.left, ctx));
        if (operator === "=") {
          return IR.assign(operator, left, right, getLoc(node, ctx));
        }
        const currentValue = IR.member(obj, key, true, getLoc(node.left, ctx));
        const binaryOp = operator.slice(0, -1) as any;
        const newValue = IR.binary(binaryOp, currentValue, right);
        return IR.assign("=", left, newValue, getLoc(node, ctx));
      }
      // XML-типы: прямое присваивание без bt.setProperty (оптимизация)
      if (
        isXmlRelatedType(
          ctx.typeChecker,
          node.left.expression,
          ctx.xmlDocumentSymbol,
          ctx.xmlElemSymbol,
        )
      ) {
        const left = IR.member(obj, key, true, getLoc(node.left, ctx));
        if (operator === "=") {
          return IR.assign(operator, left, right, getLoc(node, ctx));
        }
        const currentValue = IR.member(obj, key, true, getLoc(node.left, ctx));
        const binaryOp = operator.slice(0, -1) as any;
        const newValue = IR.binary(binaryOp, currentValue, right);
        return IR.assign("=", left, newValue, getLoc(node, ctx));
      }
      if (operator === "=") {
        return IR.btSetProperty(obj, key, right, getLoc(node, ctx));
      }
      const currentValue = IR.btGetProperty(obj, key);
      const binaryOp = operator.slice(0, -1) as any;
      const newValue = IR.binary(binaryOp, currentValue, right);
      return IR.btSetProperty(obj, key, newValue, getLoc(node, ctx));
    }

    // Обычное присваивание (идентификатор)
    let left = visitExpression(node.left, ctx);
    // ArgsAccess превращается в Identifier после извлечения параметров
    if (left.kind === "ArgsAccess") {
      left = IR.id(left.originalName, left.loc);
    }
    if (
      left.kind === "Identifier" ||
      left.kind === "MemberExpression" ||
      left.kind === "EnvAccess"
    ) {
      return IR.assign(operator, left as any, right, getLoc(node, ctx));
    }

    console.warn("Invalid assignment target");
    return IR.id("__invalid__");
  }

  // Logical operators — maybeExtract для безопасного инлайна conditional
  if (operatorToken === ts.SyntaxKind.AmpersandAmpersandToken) {
    // Without bt.isTrue, emit native &&
    if (!ctx.config.useBtIsTrue) {
      let left = maybeExtract(visitExpression(node.left, ctx), ctx);
      let right = maybeExtract(visitExpression(node.right, ctx), ctx);
      if (ts.isBinaryExpression(node.left) && needsParentheses(node, node.left, true)) {
        left = IR.grouping(left, getLoc(node.left, ctx));
      }
      if (ts.isBinaryExpression(node.right) && needsParentheses(node, node.right, false)) {
        right = IR.grouping(right, getLoc(node.right, ctx));
      }
      return IR.logical("&&", left, right, getLoc(node, ctx));
    }

    // Lowering: a && b → bt.isTrue((__la = a)) ? b : __la
    const leftExpr = maybeExtract(visitExpression(node.left, ctx), ctx);
    const tmpName = ctx.bindings.create("la");
    ctx.pendingStatements.push(IR.varDecl(tmpName, null));
    const assignExpr = IR.assign(
      "=",
      IR.id(tmpName) as import("../../ir/index.ts").IRIdentifier,
      leftExpr,
    );
    let right = maybeExtract(visitExpression(node.right, ctx), ctx);
    if (ts.isBinaryExpression(node.right) && needsParentheses(node, node.right, false)) {
      right = IR.grouping(right, getLoc(node.right, ctx));
    }
    return IR.conditional(
      IR.btIsTrue(IR.grouping(assignExpr, getLoc(node.left, ctx)), getLoc(node.left, ctx)),
      right,
      IR.id(tmpName),
      getLoc(node, ctx),
    );
  }

  if (operatorToken === ts.SyntaxKind.BarBarToken) {
    // Without bt.isTrue, emit native ||
    if (!ctx.config.useBtIsTrue) {
      let left = maybeExtract(visitExpression(node.left, ctx), ctx);
      let right = maybeExtract(visitExpression(node.right, ctx), ctx);
      if (ts.isBinaryExpression(node.left) && needsParentheses(node, node.left, true)) {
        left = IR.grouping(left, getLoc(node.left, ctx));
      }
      if (ts.isBinaryExpression(node.right) && needsParentheses(node, node.right, false)) {
        right = IR.grouping(right, getLoc(node.right, ctx));
      }
      return IR.logical("||", left, right, getLoc(node, ctx));
    }

    // Lowering: a || b → bt.isTrue((__lo = a)) ? __lo : b
    const leftExpr = maybeExtract(visitExpression(node.left, ctx), ctx);
    const tmpName = ctx.bindings.create("lo");
    ctx.pendingStatements.push(IR.varDecl(tmpName, null));
    const assignExpr = IR.assign(
      "=",
      IR.id(tmpName) as import("../../ir/index.ts").IRIdentifier,
      leftExpr,
    );
    let right = maybeExtract(visitExpression(node.right, ctx), ctx);
    if (ts.isBinaryExpression(node.right) && needsParentheses(node, node.right, false)) {
      right = IR.grouping(right, getLoc(node.right, ctx));
    }
    return IR.conditional(
      IR.btIsTrue(IR.grouping(assignExpr, getLoc(node.left, ctx)), getLoc(node.left, ctx)),
      IR.id(tmpName),
      right,
      getLoc(node, ctx),
    );
  }

  if (operatorToken === ts.SyntaxKind.QuestionQuestionToken) {
    // ?? не существует в BS — без bt.isTrue lowering невозможен
    if (!ctx.config.useBtIsTrue) {
      console.warn("?? is not supported in bare mode");
      return IR.id("__invalid__");
    }

    // Lowering: a ?? b → (__nc = a) == null || __nc == undefined ? b : __nc
    const leftExpr = maybeExtract(visitExpression(node.left, ctx), ctx);
    const tmpName = ctx.bindings.create("nc");
    ctx.pendingStatements.push(IR.varDecl(tmpName, null));
    const assignExpr = IR.assign(
      "=",
      IR.id(tmpName) as import("../../ir/index.ts").IRIdentifier,
      leftExpr,
    );
    const nullCheck = IR.binary("==", IR.grouping(assignExpr, getLoc(node.left, ctx)), IR.null());
    const undefinedCheck = IR.binary("==", IR.id(tmpName), IR.id("undefined"));
    const test = IR.logical("||", nullCheck, undefinedCheck);
    let right = maybeExtract(visitExpression(node.right, ctx), ctx);
    if (ts.isBinaryExpression(node.right) && needsParentheses(node, node.right, false)) {
      right = IR.grouping(right, getLoc(node.right, ctx));
    }
    return IR.conditional(test, right, IR.id(tmpName), getLoc(node, ctx));
  }

  // Binary operators — maybeExtract для безопасного инлайна conditional
  const operator = ts.tokenToString(operatorToken);
  if (!operator) {
    console.warn(`Unknown operator: ${ts.SyntaxKind[operatorToken]}`);
    return IR.id("__unknown__");
  }

  let left = maybeExtract(visitExpression(node.left, ctx), ctx);
  let right = maybeExtract(visitExpression(node.right, ctx), ctx);
  if (ts.isBinaryExpression(node.left) && needsParentheses(node, node.left, true)) {
    left = IR.grouping(left, getLoc(node.left, ctx));
  }
  if (ts.isBinaryExpression(node.right) && needsParentheses(node, node.right, false)) {
    right = IR.grouping(right, getLoc(node.right, ctx));
  }
  return IR.binary(operator as any, left, right, getLoc(node, ctx));
}

// ============================================================================
// Unary expressions
// ============================================================================

/**
 * Обрабатывает prefix unary expression
 */
export function visitPrefixUnaryExpression(
  node: ts.PrefixUnaryExpression,
  ctx: VisitorContext,
): IRExpression {
  const operator = node.operator;

  // ++/-- prefix
  if (operator === ts.SyntaxKind.PlusPlusToken || operator === ts.SyntaxKind.MinusMinusToken) {
    const arg = visitExpression(node.operand, ctx);
    // ArgsAccess turns into a simple identifier after parameter extraction
    if (arg.kind === "ArgsAccess") {
      return IR.update(
        operator === ts.SyntaxKind.PlusPlusToken ? "++" : "--",
        IR.id(arg.originalName, arg.loc),
        true,
        getLoc(node, ctx),
      );
    }
    if (arg.kind === "Identifier" || arg.kind === "MemberExpression") {
      return IR.update(
        operator === ts.SyntaxKind.PlusPlusToken ? "++" : "--",
        arg as any,
        true,
        getLoc(node, ctx),
      );
    }
  }

  // Unary operators
  const opStr = getUnaryOperator(operator);
  return IR.unary(opStr, visitExpression(node.operand, ctx), true, getLoc(node, ctx));
}

/**
 * Обрабатывает postfix unary expression
 */
export function visitPostfixUnaryExpression(
  node: ts.PostfixUnaryExpression,
  ctx: VisitorContext,
): IRExpression {
  const arg = visitExpression(node.operand, ctx);

  // ArgsAccess turns into a simple identifier after parameter extraction
  if (arg.kind === "ArgsAccess") {
    return IR.update(
      node.operator === ts.SyntaxKind.PlusPlusToken ? "++" : "--",
      IR.id(arg.originalName, arg.loc),
      false,
      getLoc(node, ctx),
    );
  }

  if (arg.kind === "Identifier" || arg.kind === "MemberExpression") {
    return IR.update(
      node.operator === ts.SyntaxKind.PlusPlusToken ? "++" : "--",
      arg as any,
      false,
      getLoc(node, ctx),
    );
  }

  console.warn("Invalid update expression operand");
  return IR.id("__invalid__");
}
