/**
 * Helper функции для visitor
 *
 * Содержит вспомогательные функции:
 * - Работа с позициями (SourceLocation)
 * - Операторы (assignment, unary)
 * - Проверка внутренних имён
 * - Scope utilities
 *
 * @module lowering/helpers
 */

import * as ts from "typescript";
import type { SourceLocation } from "../ir/index.ts";
import type { Scope, VariableInfo } from "../analyzer/index.ts";
import type { VisitorContext } from "./visitor.ts";

// ============================================================================
// Location helpers
// ============================================================================

/**
 * Получает SourceLocation из TS node
 */
export function getLoc(node: ts.Node, ctx: VisitorContext): SourceLocation | undefined {
  const start = ctx.sourceFile.getLineAndCharacterOfPosition(node.getStart());
  const end = ctx.sourceFile.getLineAndCharacterOfPosition(node.getEnd());

  return {
    start: { line: start.line + 1, column: start.character },
    end: { line: end.line + 1, column: end.character },
    source: ctx.sourceFile.fileName,
  };
}

/** Returns a stable id for a source control-flow target. */
export function getControlTargetId(node: ts.Node, ctx: VisitorContext): number {
  const existing = ctx.controlTargetIds.get(node);
  if (existing !== undefined) return existing;

  const id = ctx.nextControlTargetId.value++;
  ctx.controlTargetIds.set(node, id);
  return id;
}

// ============================================================================
// Internal access helpers
// ============================================================================

/**
 * Проверяет, является ли выражение внутренним (__env, __* переменные)
 * Внутренние обращения сохраняются в IR как прямой доступ.
 */
export function isInternalAccess(expr: ts.Expression): boolean {
  // __env
  if (ts.isIdentifier(expr) && expr.text === "__env") {
    return true;
  }

  // Любой идентификатор начинающийся с __
  if (ts.isIdentifier(expr) && expr.text.startsWith("__")) {
    return true;
  }

  // Цепочка доступа: __env.something.else
  if (ts.isPropertyAccessExpression(expr)) {
    return isInternalAccess(expr.expression);
  }

  return false;
}

// ============================================================================
// Operator helpers
// ============================================================================

/**
 * Проверяет является ли оператор assignment
 */
export function isAssignmentOperator(kind: ts.SyntaxKind): boolean {
  return (
    kind === ts.SyntaxKind.EqualsToken ||
    kind === ts.SyntaxKind.PlusEqualsToken ||
    kind === ts.SyntaxKind.MinusEqualsToken ||
    kind === ts.SyntaxKind.AsteriskEqualsToken ||
    kind === ts.SyntaxKind.SlashEqualsToken ||
    kind === ts.SyntaxKind.PercentEqualsToken ||
    kind === ts.SyntaxKind.LessThanLessThanEqualsToken ||
    kind === ts.SyntaxKind.GreaterThanGreaterThanEqualsToken ||
    kind === ts.SyntaxKind.GreaterThanGreaterThanGreaterThanEqualsToken ||
    kind === ts.SyntaxKind.AmpersandEqualsToken ||
    kind === ts.SyntaxKind.BarEqualsToken ||
    kind === ts.SyntaxKind.CaretEqualsToken
  );
}

/**
 * Получает строку assignment оператора
 */
export function getAssignmentOperator(kind: ts.SyntaxKind): import("../ir/index.js").AssignmentOperator {
  switch (kind) {
    case ts.SyntaxKind.EqualsToken:
      return "=";
    case ts.SyntaxKind.PlusEqualsToken:
      return "+=";
    case ts.SyntaxKind.MinusEqualsToken:
      return "-=";
    case ts.SyntaxKind.AsteriskEqualsToken:
      return "*=";
    case ts.SyntaxKind.SlashEqualsToken:
      return "/=";
    case ts.SyntaxKind.PercentEqualsToken:
      return "%=";
    case ts.SyntaxKind.LessThanLessThanEqualsToken:
      return "<<=";
    case ts.SyntaxKind.GreaterThanGreaterThanEqualsToken:
      return ">>=";
    case ts.SyntaxKind.GreaterThanGreaterThanGreaterThanEqualsToken:
      return ">>>=";
    case ts.SyntaxKind.AmpersandEqualsToken:
      return "&=";
    case ts.SyntaxKind.BarEqualsToken:
      return "|=";
    case ts.SyntaxKind.CaretEqualsToken:
      return "^=";
    default:
      return "=";
  }
}

/**
 * Получает строку unary оператора
 */
export function getUnaryOperator(kind: ts.PrefixUnaryOperator): import("../ir/index.js").UnaryOperator {
  switch (kind) {
    case ts.SyntaxKind.MinusToken:
      return "-";
    case ts.SyntaxKind.PlusToken:
      return "+";
    case ts.SyntaxKind.ExclamationToken:
      return "!";
    case ts.SyntaxKind.TildeToken:
      return "~";
    default:
      return "-";
  }
}

// ============================================================================
// Scope helpers
// ============================================================================

/**
 * Ищет переменную в цепочке scopes
 */
export function resolveVariableInScope(name: string, fromScope: Scope): VariableInfo | null {
  let current: Scope | null = fromScope;
  while (current) {
    const varInfo = current.variables.get(name);
    if (varInfo) {
      return varInfo;
    }
    current = current.parent;
  }
  return null;
}
