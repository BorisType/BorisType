/**
 * Bare Mode Visitors — упрощённые visitors для режима bare
 *
 * В bare mode транспиляция почти 1:1:
 * - let/const → var
 * - Типы и импорты вырезаются
 * - Функции остаются с оригинальной сигнатурой (без __env/__this/__args)
 * - Нет captured variables, env/desc, bt.getProperty/bt.setProperty
 * - export namespace X { ... } → "META:NAMESPACE:X"; + содержимое наружу
 *
 * @module lowering/bare-visitors
 */

import * as ts from "typescript";
import { IR, type IRStatement, type IRExpression, type IRFunctionParam } from "../ir/index.ts";
import type { VisitorContext } from "./visitor.ts";
import { visitExpression } from "./expressions.ts";
import { visitStatementList, visitStatement } from "./statements.ts";
import { getLoc } from "./helpers.ts";

// ============================================================================
// Bare Function Declaration
// ============================================================================

/**
 * Обрабатывает объявление функции в bare mode.
 * Генерирует plain function с оригинальными параметрами, без env/desc.
 *
 * @param node - TypeScript FunctionDeclaration
 * @param ctx - VisitorContext (mode === "bare")
 * @returns IR statements (одно объявление функции)
 */
export function visitBareFunctionDeclaration(
  node: ts.FunctionDeclaration,
  ctx: VisitorContext,
): IRStatement[] | null {
  if (!node.name || !node.body) {
    return null;
  }

  const name = node.name.text;
  const params = collectBareParams(node.parameters, ctx);

  // Создаём дочерний контекст без captured/env логики
  const fnCtx = createBareFnCtx(node, ctx);
  // Регистрируем параметры для дочернего контекста (не используется в bare,
  // но нужно чтобы visitIdentifier не ломался)
  node.parameters.forEach((param, index) => {
    if (ts.isIdentifier(param.name)) {
      fnCtx.functionParams.set(param.name.text, index);
    }
  });

  const body = visitStatementList(node.body.statements, fnCtx);

  // pending statements из тела (вложенные функции и т.п.)
  const fullBody =
    fnCtx.pendingStatements.length > 0 ? [...fnCtx.pendingStatements, ...body] : body;

  return [IR.functionDecl(name, params, fullBody, getLoc(node, ctx), true)];
}

// ============================================================================
// Bare Variable Statement
// ============================================================================

/**
 * Обрабатывает объявление переменной в bare mode.
 * Просто генерирует var name = init; без captured/env логики.
 *
 * @param node - TypeScript VariableStatement
 * @param ctx - VisitorContext (mode === "bare")
 * @returns IR statements
 */
export function visitBareVariableStatement(
  node: ts.VariableStatement,
  ctx: VisitorContext,
): IRStatement | IRStatement[] | null {
  // Ambient declarations (declare var/let/const) — strip completely
  if (node.modifiers?.some((m) => m.kind === ts.SyntaxKind.DeclareKeyword)) {
    return null;
  }

  const results: IRStatement[] = [];

  for (const decl of node.declarationList.declarations) {
    if (ts.isIdentifier(decl.name)) {
      const varName = decl.name.text;
      const init = decl.initializer ? visitExpression(decl.initializer, ctx) : null;
      results.push(IR.varDecl(varName, init, getLoc(decl, ctx)));
    }
    // Деструктуризация объекта: const { a, b } = obj
    else if (ts.isObjectBindingPattern(decl.name) && decl.initializer) {
      const init = visitExpression(decl.initializer, ctx);
      for (const element of decl.name.elements) {
        if (ts.isBindingElement(element) && ts.isIdentifier(element.name)) {
          if (element.dotDotDotToken) {
            // rest не поддерживается в bare
            continue;
          }
          const propertyName = element.propertyName
            ? (element.propertyName as ts.Identifier).text
            : element.name.text;
          const variableName = element.name.text;
          const val = IR.dot(init, propertyName, getLoc(decl, ctx));
          const initExpr = element.initializer
            ? IR.conditional(
                IR.binary("!==", val, IR.id("undefined")),
                val,
                visitExpression(element.initializer, ctx),
                getLoc(decl, ctx),
              )
            : val;
          results.push(IR.varDecl(variableName, initExpr, getLoc(decl, ctx)));
        }
      }
    }
    // Деструктуризация массива: const [a, b] = arr
    else if (ts.isArrayBindingPattern(decl.name) && decl.initializer) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const init = visitExpression(decl.initializer, ctx);
      let index = 0;
      for (const element of decl.name.elements) {
        if (ts.isOmittedExpression(element)) {
          index++;
          continue;
        }
        if (ts.isBindingElement(element) && ts.isIdentifier(element.name)) {
          if (element.dotDotDotToken) {
            // rest не поддерживается в bare
            continue;
          }
          const variableName = element.name.text;
          const val = IR.member(IR.id("__arr"), IR.number(index), true, getLoc(decl, ctx));
          results.push(IR.varDecl(variableName, val, getLoc(decl, ctx)));
          index++;
        }
      }
    }
  }

  return results.length === 1 ? results[0] : results;
}

// ============================================================================
// Bare Namespace Declaration
// ============================================================================

/**
 * Обрабатывает export namespace X { ... } в bare mode.
 * Генерирует "META:NAMESPACE:X"; + все statements из тела namespace.
 *
 * @param node - TypeScript ModuleDeclaration
 * @param ctx - VisitorContext (mode === "bare")
 * @returns IR statements
 */
export function visitBareNamespaceDeclaration(
  node: ts.ModuleDeclaration,
  ctx: VisitorContext,
): IRStatement[] | null {
  const name = node.name.text;
  const results: IRStatement[] = [];

  // "META:NAMESPACE:<name>";
  results.push(IR.exprStmt(IR.string(`META:NAMESPACE:${name}`)));

  // Извлекаем содержимое тела namespace
  if (node.body && ts.isModuleBlock(node.body)) {
    for (const statement of node.body.statements) {
      const irNodes = visitStatement(statement, ctx);
      if (irNodes) {
        if (Array.isArray(irNodes)) {
          results.push(...irNodes);
        } else {
          results.push(irNodes);
        }
      }
    }
  }

  return results;
}

// ============================================================================
// Bare Arrow Function
// ============================================================================

/**
 * Обрабатывает arrow function в bare mode.
 * Генерирует plain function с оригинальными параметрами.
 * Arrow → именованная функция, hoisted в pendingStatements.
 *
 * @param node - TypeScript ArrowFunction
 * @param ctx - VisitorContext (mode === "bare")
 * @returns IR expression (ссылка на имя функции)
 */
export function visitBareArrowFunction(node: ts.ArrowFunction, ctx: VisitorContext): IRExpression {
  const params = collectBareParams(node.parameters, ctx);
  const funcName = ctx.bindings.create("arrow");

  const fnCtx = createBareFnCtx(node, ctx);
  node.parameters.forEach((param, index) => {
    if (ts.isIdentifier(param.name)) {
      fnCtx.functionParams.set(param.name.text, index);
    }
  });

  let body: IRStatement[];
  if (ts.isBlock(node.body)) {
    body = visitStatementList(node.body.statements, fnCtx);
  } else {
    body = [IR.return(visitExpression(node.body, fnCtx))];
  }

  if (fnCtx.pendingStatements.length > 0) {
    body = [...fnCtx.pendingStatements, ...body];
  }

  const funcDecl = IR.functionDecl(funcName, params, body, getLoc(node, ctx), true);
  ctx.pendingStatements.push(funcDecl);

  return IR.id(funcName, getLoc(node, ctx));
}

// ============================================================================
// Bare Function Expression
// ============================================================================

/**
 * Обрабатывает function expression в bare mode.
 * Генерирует plain function, hoisted в pendingStatements.
 *
 * @param node - TypeScript FunctionExpression
 * @param ctx - VisitorContext (mode === "bare")
 * @returns IR expression (ссылка на имя функции)
 */
export function visitBareFunctionExpression(
  node: ts.FunctionExpression,
  ctx: VisitorContext,
): IRExpression {
  const name = node.name?.text ?? ctx.bindings.create("func");
  const params = collectBareParams(node.parameters, ctx);

  const fnCtx = createBareFnCtx(node, ctx);
  node.parameters.forEach((param, index) => {
    if (ts.isIdentifier(param.name)) {
      fnCtx.functionParams.set(param.name.text, index);
    }
  });

  let body = node.body ? visitStatementList(node.body.statements, fnCtx) : [];
  if (fnCtx.pendingStatements.length > 0) {
    body = [...fnCtx.pendingStatements, ...body];
  }

  const funcDecl = IR.functionDecl(name, params, body, getLoc(node, ctx), true);
  ctx.pendingStatements.push(funcDecl);

  return IR.id(name, getLoc(node, ctx));
}

// ============================================================================
// Bare Object Method
// ============================================================================

/**
 * Обрабатывает метод объекта в bare mode.
 * Генерирует plain function, hoisted в pendingStatements.
 * Возвращает имя функции для использования в свойстве объекта.
 *
 * @param prop - TypeScript MethodDeclaration
 * @param ctx - VisitorContext (mode === "bare")
 * @returns имя сгенерированной функции
 */
export function visitBareObjectMethod(prop: ts.MethodDeclaration, ctx: VisitorContext): string {
  const methodName = (prop.name as ts.Identifier).text;
  const funcName = ctx.bindings.create(`${methodName}__method`);
  const params = collectBareParams(prop.parameters, ctx);

  const fnCtx = createBareFnCtx(prop, ctx);
  prop.parameters.forEach((param, index) => {
    if (ts.isIdentifier(param.name)) {
      fnCtx.functionParams.set(param.name.text, index);
    }
  });

  let body = prop.body ? visitStatementList(prop.body.statements, fnCtx) : [];
  if (fnCtx.pendingStatements.length > 0) {
    body = [...fnCtx.pendingStatements, ...body];
  }

  const funcDecl = IR.functionDecl(funcName, params, body, getLoc(prop, ctx), true);
  ctx.pendingStatements.push(funcDecl);

  return funcName;
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Собирает параметры функции для bare mode (оригинальные имена, без __env/__this/__args)
 */
function collectBareParams(
  parameters: ts.NodeArray<ts.ParameterDeclaration>,
  ctx: VisitorContext,
): IRFunctionParam[] {
  const params: IRFunctionParam[] = [];
  for (const param of parameters) {
    if (ts.isIdentifier(param.name)) {
      const defaultValue = param.initializer ? visitExpression(param.initializer, ctx) : undefined;
      const isRest = !!param.dotDotDotToken;
      params.push(IR.param(param.name.text, defaultValue, isRest));
    }
  }
  return params;
}

/**
 * Создаёт дочерний VisitorContext для bare mode функции.
 * Без captured variables, env/desc и прочей логики script/module режимов.
 */
function createBareFnCtx(node: ts.Node, ctx: VisitorContext): VisitorContext {
  const funcScope = ctx.scopeAnalysis.nodeToScope.get(node) || ctx.currentScope;
  return {
    mode: ctx.mode,
    config: ctx.config,
    functionParams: new Map(),
    hoistedFunctions: [],
    typeChecker: ctx.typeChecker,
    sourceFile: ctx.sourceFile,
    bindings: ctx.bindings,
    scopeAnalysis: ctx.scopeAnalysis,
    currentScope: funcScope,
    pendingStatements: [],
    currentEnvRef: "__env",
    currentEnvScope: funcScope,
    xmlDocumentSymbol: ctx.xmlDocumentSymbol,
    xmlElemSymbol: ctx.xmlElemSymbol,
    importBindings: ctx.importBindings,
    helperFlags: ctx.helperFlags,
  };
}
