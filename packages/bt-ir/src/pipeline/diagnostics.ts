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
  /** break/continue внутри try-finally не поддерживается */
  BreakContinueTryFinally: 90012,
  /** Ошибка IR pass */
  PassFailed: 90013,
  /** Ошибка emitter */
  EmitFailed: 90014,
  /** Ошибка IR transformation */
  TransformFailed: 90015,
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
