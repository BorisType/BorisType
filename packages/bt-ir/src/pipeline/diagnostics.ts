/**
 * BT-IR Diagnostic Helpers
 *
 * Создаёт ts.Diagnostic объекты для ошибок и предупреждений bt-ir.
 * Использует ts.Diagnostic напрямую — единый формат с TypeScript,
 * btc's reportDiagnostics() работает без изменений.
 *
 * Коды диагностик: 90001–90099 (зарезервированный диапазон для bt-ir).
 *
 * @module pipeline/diagnostics
 */

import * as ts from "typescript";
import type { SourceLocation, SourcePosition } from "../ir/index.ts";

// ============================================================================
// Diagnostic codes
// ============================================================================

/**
 * Коды диагностик BT-IR.
 *
 * Диапазон 90001–90099 зарезервирован для bt-ir.
 * TypeScript использует 1000–18000, коллизий нет.
 */
export const BtDiagnosticCode = {
  /** Нераспознанное выражение */
  UnhandledExpression: 90001,
  /** Невалидная цель присваивания */
  InvalidAssignmentTarget: 90002,
  /** Оператор ?? не поддерживается в bare mode */
  NullishCoalescingBareMode: 90003,
  /** Неизвестный оператор */
  UnknownOperator: 90004,
  /** Невалидный операнд ++/-- */
  InvalidUpdateOperand: 90005,
  /** Деструктуризация не поддерживается */
  DestructuringNotSupported: 90006,
  /** ModuleDeclaration не поддерживается */
  ModuleDeclarationUnsupported: 90007,
  /** ClassDeclaration не поддерживается в bare mode */
  ClassDeclarationBareMode: 90008,
  /** Нераспознанный statement */
  UnhandledStatement: 90009,
  /** Computed property keys не поддерживаются */
  ComputedPropertyKey: 90010,
  /** Деструктуризация параметров не поддерживается */
  DestructuredParameter: 90011,
  /** @deprecated Reserved legacy code; structured completions support these jumps. */
  BreakContinueTryFinally: 90012,
  /** Ошибка IR pass */
  PassFailed: 90013,
  /** Ошибка emitter */
  EmitFailed: 90014,
  /** Ошибка IR transformation */
  TransformFailed: 90015,
  /** Catch binding patterns require explicit destructuring in the body. */
  DestructuredCatchBinding: 90016,
  /** Annex B labelled function declarations are outside the synchronous subset. */
  LabelledFunctionUnsupported: 90017,
  /** Invalid break/continue target or duplicate lexical label. */
  InvalidControlTarget: 90018,
} as const;

// ============================================================================
// Helpers
// ============================================================================

/**
 * Создаёт ts.Diagnostic с привязкой к позиции в исходном файле.
 *
 * Используется в lowering — где доступны TS node и sourceFile.
 *
 * @param file - TypeScript SourceFile
 * @param node - TS AST node для определения позиции
 * @param message - Текст сообщения
 * @param category - Категория (default: Error)
 * @param code - Код диагностики (default: 90001)
 */
export function createBtDiagnostic(
  file: ts.SourceFile,
  node: ts.Node,
  message: string,
  category: ts.DiagnosticCategory = ts.DiagnosticCategory.Error,
  code: number = BtDiagnosticCode.UnhandledExpression,
): ts.Diagnostic {
  return {
    file,
    start: node.getStart(),
    length: node.getEnd() - node.getStart(),
    messageText: message,
    category,
    code,
  };
}

/**
 * Creates a diagnostic from an IR source range, without fabricating a TS node.
 * IR lines are 1-based; columns and diagnostic offsets use UTF-16 code units.
 * Missing, mismatched or invalid metadata falls back to a positionless diagnostic.
 *
 * @param file - Original source file, when available
 * @param loc - IR range in that file, when available
 * @param message - Diagnostic message
 * @param category - Diagnostic severity (default: Error)
 * @param code - BT diagnostic code (default: PassFailed)
 */
export function createBtDiagnosticAtLocation(
  file: ts.SourceFile | undefined,
  loc: SourceLocation | undefined,
  message: string,
  category: ts.DiagnosticCategory = ts.DiagnosticCategory.Error,
  code: number = BtDiagnosticCode.PassFailed,
): ts.Diagnostic {
  if (file && loc && (loc.source === undefined || loc.source === file.fileName)) {
    const start = sourcePositionOffset(file, loc.start);
    const end = sourcePositionOffset(file, loc.end);
    if (start !== undefined && end !== undefined && end >= start) {
      return { file, start, length: end - start, messageText: message, category, code };
    }
  }
  return createBtDiagnosticMessage(message, category, code);
}

function sourcePositionOffset(file: ts.SourceFile, position: SourcePosition): number | undefined {
  const lines = file.getLineStarts();
  if (!Number.isInteger(position.line) || !Number.isInteger(position.column) || position.line < 1 || position.column < 0) {
    return undefined;
  }
  const start = lines[position.line - 1];
  if (start === undefined) return undefined;
  let end = lines[position.line] ?? file.text.length;
  // A column cannot point into the following line, including CRLF terminators.
  while (end > start && /[\r\n\u2028\u2029]/.test(file.text[end - 1])) end--;
  return start + position.column <= end ? start + position.column : undefined;
}

/**
 * Создаёт ts.Diagnostic без привязки к файлу.
 *
 * Используется в passes и pipeline — где нет доступа к TS node.
 *
 * @param message - Текст сообщения
 * @param category - Категория (default: Error)
 * @param code - Код диагностики (default: 90013)
 */
export function createBtDiagnosticMessage(
  message: string,
  category: ts.DiagnosticCategory = ts.DiagnosticCategory.Error,
  code: number = BtDiagnosticCode.PassFailed,
): ts.Diagnostic {
  return {
    file: undefined,
    start: undefined,
    length: undefined,
    messageText: message,
    category,
    code,
  };
}
