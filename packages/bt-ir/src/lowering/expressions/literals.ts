/**
 * Literal & Identifier Visitors — обработка идентификаторов, шаблонных строк, объектов и массивов
 *
 * Содержит:
 * - visitIdentifier
 * - visitTemplateExpression
 * - visitObjectLiteral
 * - visitArrayLiteral
 *
 * @module lowering/expressions/literals
 */

import * as ts from "typescript";
import { IR, type IRExpression, type IRObjectProperty } from "../../ir/index.ts";
import type { VisitorContext } from "../visitor.ts";
import { createBtDiagnostic, BtDiagnosticCode } from "../../pipeline/diagnostics.ts";
import { getLoc, resolveVariableInScope } from "../helpers.ts";
import { visitBareObjectMethod } from "../bare-visitors.ts";
import { visitExpression, maybeExtract } from "./dispatch.ts";

// ============================================================================
// Identifier
// ============================================================================

/**
 * Обрабатывает identifier
 */
export function visitIdentifier(node: ts.Identifier, ctx: VisitorContext): IRExpression {
  const name = node.text;
  const loc = getLoc(node, ctx);
  const varInfo = resolveVariableInScope(name, ctx.currentScope);

  return IR.id(varInfo?.renamedTo ?? name, loc);
}

// ============================================================================
// Template literals
// ============================================================================

/**
 * Обрабатывает template expression
 */
export function visitTemplateExpression(node: ts.TemplateExpression, ctx: VisitorContext): IRExpression {
  const parts: IRExpression[] = [];

  // Head
  if (node.head.text) {
    parts.push(IR.string(node.head.text, getLoc(node.head, ctx)));
  }

  // Spans — maybeExtract для безопасного инлайна сложных выражений (optional chaining, ternary)
  for (const span of node.templateSpans) {
    parts.push(maybeExtract(visitExpression(span.expression, ctx), ctx));

    if (span.literal.text) {
      parts.push(IR.string(span.literal.text, getLoc(span.literal, ctx)));
    }
  }

  // Собираем в цепочку конкатенаций
  if (parts.length === 0) {
    return IR.string("", getLoc(node, ctx));
  }

  let result = parts[0];
  for (let i = 1; i < parts.length; i++) {
    result = IR.binary("+", result, parts[i], getLoc(node, ctx));
  }

  return result;
}

// ============================================================================
// Object literals
// ============================================================================

/**
 * Обрабатывает object literal
 *
 * Spread-свойства преобразуются в вызовы ObjectUnion.
 */
export function visitObjectLiteral(node: ts.ObjectLiteralExpression, ctx: VisitorContext): IRExpression {
  // Проверяем наличие spread
  const hasSpread = node.properties.some((prop) => ts.isSpreadAssignment(prop));

  if (hasSpread) {
    ctx.helperFlags.needsObjectUnion = true;

    const parts: IRExpression[] = [];
    let currentProperties: IRObjectProperty[] = [];

    for (const prop of node.properties) {
      if (ts.isSpreadAssignment(prop)) {
        if (currentProperties.length > 0) {
          parts.push(IR.object(currentProperties, getLoc(node, ctx)));
          currentProperties = [];
        }
        parts.push(visitExpression(prop.expression, ctx));
      } else if (ts.isPropertyAssignment(prop)) {
        let key: string;
        if (ts.isIdentifier(prop.name)) {
          key = prop.name.text;
        } else if (ts.isStringLiteral(prop.name)) {
          key = prop.name.text;
        } else if (ts.isNumericLiteral(prop.name)) {
          key = prop.name.text;
        } else {
          continue;
        }
        currentProperties.push(IR.prop(key, maybeExtract(visitExpression(prop.initializer, ctx), ctx)));
      } else if (ts.isShorthandPropertyAssignment(prop)) {
        currentProperties.push(IR.prop(prop.name.text, visitIdentifier(prop.name, ctx)));
      }
      // MethodDeclaration в объектах со spread пока не поддерживается
    }

    if (currentProperties.length > 0) {
      parts.push(IR.object(currentProperties, getLoc(node, ctx)));
    }

    if (parts.length === 0) {
      return IR.object([], getLoc(node, ctx));
    }
    if (parts.length === 1) {
      return IR.call(IR.id("ObjectUnion"), [IR.object([], getLoc(node, ctx)), parts[0]], getLoc(node, ctx));
    }

    // Строим цепочку ObjectUnion(left, right) left-associative
    let expr: IRExpression = parts[0];
    for (let i = 1; i < parts.length; i++) {
      expr = IR.call(IR.id("ObjectUnion"), [expr, parts[i]], getLoc(node, ctx));
    }
    return expr;
  }

  const properties: IRObjectProperty[] = [];

  for (const prop of node.properties) {
    // Property assignment: { key: value }
    if (ts.isPropertyAssignment(prop)) {
      let key: string;
      if (ts.isIdentifier(prop.name)) {
        key = prop.name.text;
      } else if (ts.isStringLiteral(prop.name)) {
        key = prop.name.text;
      } else if (ts.isNumericLiteral(prop.name)) {
        key = prop.name.text;
      } else {
        ctx.diagnostics.push(
          createBtDiagnostic(
            ctx.sourceFile,
            prop.name,
            `Computed property keys are not supported: ${prop.name.getText(ctx.sourceFile)}`,
            ts.DiagnosticCategory.Error,
            BtDiagnosticCode.ComputedPropertyKey,
          ),
        );
        continue;
      }

      const value = maybeExtract(visitExpression(prop.initializer, ctx), ctx);
      properties.push(IR.prop(key, value));
    }
    // Shorthand property: { x }
    else if (ts.isShorthandPropertyAssignment(prop)) {
      const key = prop.name.text;
      properties.push(IR.prop(key, visitIdentifier(prop.name, ctx)));
    }
    // Method declaration: { method() {} }
    else if (ts.isMethodDeclaration(prop) && ts.isIdentifier(prop.name) && prop.body) {
      const funcName = visitBareObjectMethod(prop, ctx);
      properties.push(IR.prop(prop.name.text, IR.id(funcName)));
    }
  }

  return IR.object(properties, getLoc(node, ctx));
}

// ============================================================================
// Array literals
// ============================================================================

/**
 * Обрабатывает array literal.
 * Spread-элементы преобразуются в вызов ArrayUnion([...], spreadExpr, [...]).
 */
export function visitArrayLiteral(node: ts.ArrayLiteralExpression, ctx: VisitorContext): IRExpression {
  const hasSpread = node.elements.some((el) => ts.isSpreadElement(el));

  if (!hasSpread) {
    const elements = node.elements.map((el) => {
      if (ts.isOmittedExpression(el)) {
        return null;
      }
      return maybeExtract(visitExpression(el, ctx), ctx);
    });
    return IR.array(elements, getLoc(node, ctx));
  }

  // Собираем аргументы для ArrayUnion: [literal], spreadExpr, [literal], ...
  const args: IRExpression[] = [];
  let currentLiteral: IRExpression[] = [];

  for (const element of node.elements) {
    if (ts.isSpreadElement(element)) {
      if (currentLiteral.length > 0) {
        args.push(IR.array(currentLiteral, getLoc(node, ctx)));
        currentLiteral = [];
      }
      args.push(visitExpression(element.expression, ctx));
    } else if (ts.isOmittedExpression(element)) {
      currentLiteral.push(IR.id("undefined"));
    } else {
      currentLiteral.push(maybeExtract(visitExpression(element, ctx), ctx));
    }
  }

  if (currentLiteral.length > 0) {
    args.push(IR.array(currentLiteral, getLoc(node, ctx)));
  }

  return IR.call(IR.id("ArrayUnion"), args, getLoc(node, ctx));
}
