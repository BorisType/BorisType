/**
 * Helper функции для visitor
 * 
 * Содержит вспомогательные функции:
 * - Работа с позициями (SourceLocation)
 * - Определение типов polyfill
 * - Операторы (assignment, unary)
 * - Проверки (isInternalAccess, isBuiltinFunction)
 * - Scope utilities
 * 
 * @module lowering/helpers
 */

import * as ts from "typescript";
import type { SourceLocation } from "../ir/index.ts";
import type { ScopeAnalysisResult, Scope, VariableInfo } from "../analyzer/index.ts";
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

// ============================================================================
// Polyfill / Runtime helpers
// ============================================================================

/**
 * Определяет тип polyfill для типа выражения
 */
export function getPolyfillType(type: ts.Type, checker: ts.TypeChecker): string | null {
  if (type.flags & ts.TypeFlags.Number || type.flags & ts.TypeFlags.NumberLiteral) {
    return "Number";
  }

  if (type.flags & ts.TypeFlags.String || type.flags & ts.TypeFlags.StringLiteral) {
    return "String";
  }

  // Array
  const typeName = checker.typeToString(type);
  if (typeName.endsWith("[]") || typeName.startsWith("Array<")) {
    return "Array";
  }

  return null;
}

// ============================================================================
// XML type helpers
// ============================================================================

/**
 * Проверяет, является ли импорт только типом (type, interface и т.д.)
 * Используется для Bundler mode, где не обязательно писать type в импорте.
 */
export function isTypeOnlyImport(
  typeChecker: ts.TypeChecker,
  node: ts.Identifier
): boolean {
  let symbol = typeChecker.getSymbolAtLocation(node);
  if (!symbol) return false;

  if (symbol.flags & ts.SymbolFlags.Alias) {
    symbol = typeChecker.getAliasedSymbol(symbol);
  }

  if (!symbol.declarations || symbol.declarations.length === 0) {
    return false;
  }

  return symbol.declarations.every((decl) => {
    return (
      ts.isTypeAliasDeclaration(decl) ||
      ts.isInterfaceDeclaration(decl) ||
      ts.isTypeParameterDeclaration(decl)
    );
  });
}

/**
 * Ищет символ по имени в scope файла (классы, интерфейсы, type alias)
 */
export function findSymbolByName(
  typeChecker: ts.TypeChecker,
  sourceFile: ts.SourceFile,
  name: string
): ts.Symbol | undefined {
  return typeChecker.getSymbolsInScope(
    sourceFile,
    ts.SymbolFlags.Class | ts.SymbolFlags.Interface | ts.SymbolFlags.TypeAlias | ts.SymbolFlags.Value
  ).find((symbol) => symbol.getName() === name);
}

/**
 * Проверяет, относится ли тип узла к XML-типам (XmlDocument, XmlElem и т.д.)
 * с учётом union и intersection типов. Для XML-типов не используется bt.getProperty,
 * т.к. они имеют другую семантику и прямой доступ более оптимизирован.
 */
export function isXmlRelatedType(
  typeChecker: ts.TypeChecker,
  node: ts.Node,
  xmlDocumentSymbol: ts.Symbol | undefined,
  xmlElemSymbol: ts.Symbol | undefined
): boolean {
  if (!xmlDocumentSymbol && !xmlElemSymbol) {
    return false;
  }

  let type: ts.Type;
  try {
    type = typeChecker.getTypeAtLocation(node);
  } catch {
    return false;
  }

  if (type.flags & ts.TypeFlags.Any) {
    return false;
  }

  if (xmlDocumentSymbol) {
    try {
      const xmlDocType = typeChecker.getDeclaredTypeOfSymbol(xmlDocumentSymbol);
      if (typeChecker.isTypeAssignableTo(type, xmlDocType)) {
        return true;
      }
    } catch {
      // ignore
    }
  }

  if (xmlElemSymbol) {
    try {
      const xmlElemType = typeChecker.getDeclaredTypeOfSymbol(xmlElemSymbol);
      if (typeChecker.isTypeAssignableTo(type, xmlElemType)) {
        return true;
      }
    } catch {
      // ignore
    }
  }

  const typeString = typeChecker.typeToString(type);

  if (typeString.startsWith("typeof tools") || typeString.startsWith("typeof botest")) {
    return true;
  }

  if (
    typeString.startsWith("XmlElem<") ||
    typeString.startsWith("XmElem<") ||
    typeString.startsWith("XmlMultiElem<") ||
    typeString.startsWith("XmlTopElem") ||
    typeString === "XmlDocument" ||
    typeString === "XmlElem" ||
    typeString === "XmElem"
  ) {
    return true;
  }

  if (type.isIntersection && type.isIntersection()) {
    const hasXmlType = type.types.some((t) => {
      const tString = typeChecker.typeToString(t);
      return (
        tString.startsWith("XmlElem<") ||
        tString.startsWith("XmElem<") ||
        tString.startsWith("XmlMultiElem<") ||
        tString.startsWith("XmlTopElem") ||
        tString === "XmlDocument" ||
        tString === "XmlElem" ||
        tString === "XmElem"
      );
    });
    if (hasXmlType) return true;
  }

  if (type.isUnion()) {
    return type.types.some((t) => {
      const tString = typeChecker.typeToString(t);
      return (
        tString.startsWith("XmlElem<") ||
        tString.startsWith("XmElem<") ||
        tString.startsWith("XmlMultiElem<") ||
        tString.startsWith("XmlTopElem") ||
        tString === "XmlDocument" ||
        tString === "XmlElem" ||
        tString === "XmElem"
      );
    });
  }

  return false;
}

// ============================================================================
// Internal access helpers
// ============================================================================

/**
 * Проверяет, является ли выражение внутренним (__env, __* переменные)
 * Такие выражения не оборачиваются в bt.getProperty/bt.setProperty
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

/**
 * Проверяет, является ли функция встроенной (не объявлена в файле)
 */
export function isBuiltinFunction(name: string, ctx: VisitorContext): boolean {
  // Ищем в variables всех scope'ов
  for (const scope of getAllScopes(ctx.scopeAnalysis)) {
    if (scope.variables.has(name)) {
      return false; // Объявлена в файле — не встроенная
    }
  }
  
  return true; // Не найдена в файле — встроенная
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
export function getAssignmentOperator(
  kind: ts.SyntaxKind
): import("../ir/index.js").AssignmentOperator {
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
export function getUnaryOperator(
  kind: ts.PrefixUnaryOperator
): import("../ir/index.js").UnaryOperator {
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

/**
 * Проверяет, находится ли scope внутри targetScope (или равен ему)
 */
export function isScopeInsideOrEqual(scope: Scope, targetScope: Scope): boolean {
  let current: Scope | null = scope;
  while (current) {
    if (current === targetScope) {
      return true;
    }
    current = current.parent;
  }
  return false;
}

/**
 * Возвращает все scopes из анализа (рекурсивно)
 */
export function getAllScopes(analysis: ScopeAnalysisResult): Scope[] {
  const result: Scope[] = [analysis.moduleScope];
  
  function collectScopes(scope: Scope) {
    for (const child of scope.children) {
      result.push(child);
      collectScopes(child);
    }
  }
  
  collectScopes(analysis.moduleScope);
  return result;
}

/**
 * Возвращает captured переменные объявленные в данном scope
 */
export function getCapturedVariablesInScope(scope: Scope): VariableInfo[] {
  const result: VariableInfo[] = [];
  for (const varInfo of scope.variables.values()) {
    if (varInfo.isCaptured) {
      result.push(varInfo);
    }
  }
  return result;
}

/**
 * Собирает captured переменные для функции
 * Возвращает только переменные, которые:
 * 1. Используются в этой функции (или её вложенных scopes)
 * 2. Объявлены ВНЕ этой функции (в родительском scope)
 */
export function collectCapturedVarsForArrow(
  funcScope: Scope,
  ctx: VisitorContext
): Array<{ name: string; kind: VariableInfo["kind"]; renamedTo?: string }> {
  const result: Array<{ name: string; kind: VariableInfo["kind"]; renamedTo?: string }> = [];

  // Проходим по всем captured переменным
  for (const capturedVar of ctx.scopeAnalysis.capturedVariables) {
    // Проверяем что переменная используется в этой функции
    if (!capturedVar.usedInScopes.has(funcScope)) {
      continue;
    }
    
    // Проверяем что переменная объявлена ВНЕ этой функции
    // (declarationScope не должен быть funcScope или его потомком)
    if (isScopeInsideOrEqual(capturedVar.declarationScope, funcScope)) {
      continue;
    }
    
    result.push({
      name: capturedVar.name,
      kind: capturedVar.kind,
      renamedTo: capturedVar.renamedTo,
    });
  }

  return result;
}
