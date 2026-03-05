/**
 * Логика приоритетов операторов для явной расстановки скобок.
 *
 * BorisScript не всегда корректно обрабатывает приоритеты, поэтому добавляем
 * скобки вокруг операндов в бинарных выражениях.
 *
 * Таблица приоритетов по MDN (1-13):
 * https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Operator_precedence
 *
 * @module lowering/precedence
 */

import * as ts from "typescript";

// Таблица приоритетов (1-13 по MDN)
const PRECEDENCE: Partial<Record<ts.SyntaxKind, number>> = {
  [ts.SyntaxKind.AsteriskAsteriskToken]: 13,
  [ts.SyntaxKind.AsteriskToken]: 12,
  [ts.SyntaxKind.SlashToken]: 12,
  [ts.SyntaxKind.PercentToken]: 12,
  [ts.SyntaxKind.PlusToken]: 11,
  [ts.SyntaxKind.MinusToken]: 11,
  [ts.SyntaxKind.LessThanLessThanToken]: 10,
  [ts.SyntaxKind.GreaterThanGreaterThanToken]: 10,
  [ts.SyntaxKind.GreaterThanGreaterThanGreaterThanToken]: 10,
  [ts.SyntaxKind.LessThanToken]: 9,
  [ts.SyntaxKind.LessThanEqualsToken]: 9,
  [ts.SyntaxKind.GreaterThanToken]: 9,
  [ts.SyntaxKind.GreaterThanEqualsToken]: 9,
  [ts.SyntaxKind.InKeyword]: 9,
  [ts.SyntaxKind.InstanceOfKeyword]: 9,
  [ts.SyntaxKind.EqualsEqualsToken]: 8,
  [ts.SyntaxKind.ExclamationEqualsToken]: 8,
  [ts.SyntaxKind.EqualsEqualsEqualsToken]: 8,
  [ts.SyntaxKind.ExclamationEqualsEqualsToken]: 8,
  [ts.SyntaxKind.AmpersandToken]: 7,
  [ts.SyntaxKind.CaretToken]: 6,
  [ts.SyntaxKind.BarToken]: 5,
  [ts.SyntaxKind.AmpersandAmpersandToken]: 4,
  [ts.SyntaxKind.BarBarToken]: 3,
  [ts.SyntaxKind.QuestionQuestionToken]: 3,
  [ts.SyntaxKind.EqualsToken]: 2,
  [ts.SyntaxKind.PlusEqualsToken]: 2,
  [ts.SyntaxKind.MinusEqualsToken]: 2,
  [ts.SyntaxKind.AsteriskEqualsToken]: 2,
  [ts.SyntaxKind.AsteriskAsteriskEqualsToken]: 2,
  [ts.SyntaxKind.SlashEqualsToken]: 2,
  [ts.SyntaxKind.PercentEqualsToken]: 2,
  [ts.SyntaxKind.LessThanLessThanEqualsToken]: 2,
  [ts.SyntaxKind.GreaterThanGreaterThanEqualsToken]: 2,
  [ts.SyntaxKind.GreaterThanGreaterThanGreaterThanEqualsToken]: 2,
  [ts.SyntaxKind.AmpersandEqualsToken]: 2,
  [ts.SyntaxKind.CaretEqualsToken]: 2,
  [ts.SyntaxKind.BarEqualsToken]: 2,
  [ts.SyntaxKind.AmpersandAmpersandEqualsToken]: 2,
  [ts.SyntaxKind.BarBarEqualsToken]: 2,
  [ts.SyntaxKind.QuestionQuestionEqualsToken]: 2,
  [ts.SyntaxKind.CommaToken]: 1,
};

const RIGHT_ASSOCIATIVE = new Set<ts.SyntaxKind>([
  ts.SyntaxKind.AsteriskAsteriskToken,
  ts.SyntaxKind.EqualsToken,
  ts.SyntaxKind.PlusEqualsToken,
  ts.SyntaxKind.MinusEqualsToken,
  ts.SyntaxKind.AsteriskEqualsToken,
  ts.SyntaxKind.AsteriskAsteriskEqualsToken,
  ts.SyntaxKind.SlashEqualsToken,
  ts.SyntaxKind.PercentEqualsToken,
  ts.SyntaxKind.LessThanLessThanEqualsToken,
  ts.SyntaxKind.GreaterThanGreaterThanEqualsToken,
  ts.SyntaxKind.GreaterThanGreaterThanGreaterThanEqualsToken,
  ts.SyntaxKind.AmpersandEqualsToken,
  ts.SyntaxKind.CaretEqualsToken,
  ts.SyntaxKind.BarEqualsToken,
  ts.SyntaxKind.AmpersandAmpersandEqualsToken,
  ts.SyntaxKind.BarBarEqualsToken,
  ts.SyntaxKind.QuestionQuestionEqualsToken,
]);

export function getPrecedence(kind: ts.SyntaxKind): number {
  return PRECEDENCE[kind] ?? 999;
}

function isRightAssociative(kind: ts.SyntaxKind): boolean {
  return RIGHT_ASSOCIATIVE.has(kind);
}

/**
 * Проверяет, нужны ли скобки вокруг дочернего бинарного выражения.
 */
export function needsParentheses(
  parent: ts.BinaryExpression,
  child: ts.BinaryExpression,
  isLeft: boolean
): boolean {
  const parentOp = parent.operatorToken.kind;
  const childOp = child.operatorToken.kind;

  const parentPrec = getPrecedence(parentOp);
  const childPrec = getPrecedence(childOp);

  if (childPrec < parentPrec) return true;
  if (childPrec > parentPrec) return true;

  if (childPrec === parentPrec) {
    // Right-associative (a = b = c): оборачиваем правый операнд
    if (isRightAssociative(parentOp)) return !isLeft;
    // Left-associative (a / b * c): оборачиваем левый операнд
    return isLeft;
  }

  return false;
}
