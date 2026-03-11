/**
 * Statement Visitors - обработка statements TypeScript AST
 *
 * Содержит:
 * - visitStatement (dispatch)
 * - visitFunctionDeclaration
 * - visitVariableStatement
 * - visitReturnStatement
 * - visitIfStatement
 * - visitFor*, visitWhile*, visitDoWhile*
 * - visitSwitchStatement
 * - visitTryStatement
 * - visitBlock, visitStatementList, visitStatementAsBlock
 *
 * @module lowering/statements
 */

import * as ts from "typescript";
import {
  IR,
  type IRStatement,
  type IRExpression,
  type IRFunctionParam,
  type IRFunctionDeclaration,
  type IRObjectProperty,
  type IRIdentifier,
  type IRBlockStatement,
  type IRReturnStatement,
} from "../ir/index.ts";
import type { VisitorContext } from "./visitor.ts";
import {
  visitExpression,
  helperEnvAccess as helperEnvAccessFromStatements,
  resolveCallableRef,
} from "./expressions.ts";
import {
  getLoc,
  resolveVariableInScope,
  collectCapturedVarsForArrow,
  isTypeOnlyImport,
} from "./helpers.ts";
import { getModuleEnvDepth } from "./env-resolution.ts";
import { buildFunction } from "./function-builder.ts";
import {
  visitBareFunctionDeclaration,
  visitBareVariableStatement,
  visitBareNamespaceDeclaration,
} from "./bare-visitors.ts";

// ============================================================================
// Main statement dispatcher
// ============================================================================

/**
 * Обрабатывает statement
 */
export function visitStatement(
  node: ts.Node,
  ctx: VisitorContext,
): IRStatement | IRStatement[] | null {
  // Function declaration
  if (ts.isFunctionDeclaration(node)) {
    if (ctx.mode === "bare") return visitBareFunctionDeclaration(node, ctx);
    return visitFunctionDeclaration(node, ctx);
  }

  // Variable statement (let/const/var)
  if (ts.isVariableStatement(node)) {
    if (ctx.mode === "bare") return visitBareVariableStatement(node, ctx);
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
    if (ctx.mode === "bare") return visitBareNamespaceDeclaration(node, ctx);
    // script/module: namespace не поддерживается
    console.warn(`Unhandled statement: ModuleDeclaration`);
    return null;
  }

  // Import — генерируем require и заполняем importBindings для live binding
  if (ts.isImportDeclaration(node)) {
    // bare: все импорты вырезаются
    if (ctx.mode === "bare") return null;
    return visitImportDeclaration(node, ctx);
  }

  // Export declaration: export { a, b as c }
  if (ts.isExportDeclaration(node) && ctx.mode === "module") {
    return visitExportDeclaration(node, ctx);
  }
  if (ts.isExportDeclaration(node)) {
    return null;
  }

  // Export assignment: export default expr
  if (ts.isExportAssignment(node) && ctx.mode === "module") {
    return visitExportAssignment(node, ctx);
  }
  if (ts.isExportAssignment(node)) {
    return null;
  }

  // Type-only: interface, type alias, enum — пропускаем
  if (
    ts.isInterfaceDeclaration(node) ||
    ts.isTypeAliasDeclaration(node) ||
    ts.isEnumDeclaration(node)
  ) {
    return null;
  }

  // Class declaration → prototype + constructor pattern
  if (ts.isClassDeclaration(node)) {
    if (ctx.mode === "bare") {
      console.warn(`ClassDeclaration is not supported in bare mode`);
      return null;
    }
    return visitClassDeclaration(node, ctx);
  }

  console.warn(`Unhandled statement: ${ts.SyntaxKind[node.kind]}`);
  return null;
}

// ============================================================================
// Import declaration
// ============================================================================

/**
 * Обрабатывает ImportDeclaration: генерирует bt.require и заполняет importBindings.
 * Live binding: доступ через moduleVar.exportedName при каждом обращении.
 */
function visitImportDeclaration(
  node: ts.ImportDeclaration,
  ctx: VisitorContext,
): IRStatement | IRStatement[] | null {
  const moduleSpecifier = node.moduleSpecifier;
  if (!ts.isStringLiteral(moduleSpecifier)) {
    return null;
  }

  const modulePath = moduleSpecifier.text;
  const moduleVar = `__module_${modulePath.replace(/[^a-zA-Z0-9]/g, "_")}`;

  // Собираем все локальные имена импортов из этой декларации,
  // чтобы проверить, используется ли хотя бы одно из них во вложенных функциях (captured).
  const localImportNames: string[] = [];
  if (node.importClause) {
    // import X from "Y"
    if (node.importClause.name && !node.importClause.isTypeOnly) {
      if (!isTypeOnlyImport(ctx.typeChecker, node.importClause.name)) {
        localImportNames.push(node.importClause.name.text);
      }
    }
    // import { a, b as c }
    if (node.importClause.namedBindings && ts.isNamedImports(node.importClause.namedBindings)) {
      for (const element of node.importClause.namedBindings.elements) {
        if (!element.isTypeOnly && !isTypeOnlyImport(ctx.typeChecker, element.name)) {
          localImportNames.push(element.name.text);
        }
      }
    }
    // import * as ns from "Y"
    if (node.importClause.namedBindings && ts.isNamespaceImport(node.importClause.namedBindings)) {
      localImportNames.push(node.importClause.namedBindings.name.text);
    }
  }

  // Проверяем captured-статус: если хотя бы один именованный импорт captured,
  // весь __module_X должен быть в __env
  const anyImportCaptured = localImportNames.some((localName) => {
    const varInfo = resolveVariableInScope(localName, ctx.scopeAnalysis.moduleScope);
    return varInfo?.isCaptured ?? false;
  });

  // Второй аргумент bt.require — baseUrl текущего модуля
  ctx.helperFlags.usesImportMeta = true;
  const dirUrlRef = helperEnvAccessFromStatements("__ImportMeta_dirUrl", ctx);
  const requireCall = IR.call(
    IR.dot(IR.id("bt"), "require"),
    [IR.string(modulePath), IR.btCallFunction(dirUrlRef, [])],
    getLoc(node, ctx),
  );

  const result: IRStatement[] = [
    IR.varDecl(
      moduleVar,
      requireCall,
      getLoc(node, ctx),
      anyImportCaptured,
      anyImportCaptured ? "__env" : undefined,
    ),
  ];

  if (!node.importClause) {
    return result;
  }

  // import X from "Y" — default
  if (node.importClause.name && !node.importClause.isTypeOnly) {
    const importName = node.importClause.name;
    if (!isTypeOnlyImport(ctx.typeChecker, importName)) {
      ctx.importBindings.set(importName.text, {
        moduleVar,
        exportedName: "__default",
        isCaptured: anyImportCaptured,
      });
    }
  }

  // import { a, b as c }
  if (node.importClause.namedBindings && ts.isNamedImports(node.importClause.namedBindings)) {
    for (const element of node.importClause.namedBindings.elements) {
      if (!element.isTypeOnly && !isTypeOnlyImport(ctx.typeChecker, element.name)) {
        const importedName = element.propertyName ? element.propertyName.text : element.name.text;
        const localName = element.name.text;
        ctx.importBindings.set(localName, {
          moduleVar,
          exportedName: importedName,
          isCaptured: anyImportCaptured,
        });
      }
    }
  }

  // import * as ns from "Y" — ns это ссылка на весь модуль
  if (node.importClause.namedBindings && ts.isNamespaceImport(node.importClause.namedBindings)) {
    const namespaceName = node.importClause.namedBindings.name.text;
    ctx.importBindings.set(namespaceName, {
      moduleVar,
      exportedName: "", // пустая строка = namespace, в visitIdentifier вернём IR.id(moduleVar)
      isCaptured: anyImportCaptured,
    });
  }

  return result;
}

// ============================================================================
// Declaration statements
// ============================================================================

/**
 * Обрабатывает function declaration
 *
 * Использует buildFunction для генерации env/desc паттерна
 */
export function visitFunctionDeclaration(
  node: ts.FunctionDeclaration,
  ctx: VisitorContext,
): IRStatement[] | null {
  if (!node.name || !node.body) {
    return null;
  }

  const name = node.name.text;
  const params: IRFunctionParam[] = [];

  // Находим scope для этой функции
  const funcScope = ctx.scopeAnalysis.nodeToScope.get(node) || ctx.currentScope;

  // Собираем captured для проверки (нужно до создания fnCtx)
  const capturedVars = collectCapturedVarsForArrow(funcScope, ctx);

  // Per-call env: если функция содержит локальные captured переменные
  // (используемые вложенными замыканиями), создаём отдельный env-объект
  // ВНУТРИ тела функции при каждом вызове. Это решает:
  // 1. Shared-state баг (повторные вызовы не перезаписывают данные)
  // 2. Depth-баг (getEnvDepth корректно считает от funcScope)
  const needsPerCallEnv = funcScope.hasCaptured;
  const perCallEnvName = needsPerCallEnv ? ctx.bindings.create("fn") + "_env" : undefined;

  const fnCtx: VisitorContext = {
    mode: ctx.mode,
    functionParams: new Map(),
    hoistedFunctions: ctx.hoistedFunctions,
    typeChecker: ctx.typeChecker,
    sourceFile: ctx.sourceFile,
    bindings: ctx.bindings,
    scopeAnalysis: ctx.scopeAnalysis,
    currentScope: funcScope,
    pendingStatements: [],
    currentEnvRef: perCallEnvName ?? "__env",
    currentEnvScope: funcScope,
    // closureEnvScope: когда per-call env — не ставим, т.к. visitIdentifier
    // должен использовать currentEnvRef (= per-call env) как базу.
    // Без per-call env при наличии captures — ставим parent scope (старое поведение).
    closureEnvScope: capturedVars.length > 0 && !needsPerCallEnv ? ctx.currentEnvScope : undefined,
    xmlDocumentSymbol: ctx.xmlDocumentSymbol,
    xmlElemSymbol: ctx.xmlElemSymbol,
    importBindings: ctx.importBindings,
    helperFlags: ctx.helperFlags,
  };

  // Собираем параметры
  node.parameters.forEach((param, index) => {
    if (ts.isIdentifier(param.name)) {
      const paramName = param.name.text;
      const defaultValue = param.initializer
        ? visitExpression(param.initializer, fnCtx)
        : undefined;
      const isRest = !!param.dotDotDotToken;

      // Проверяем, используется ли параметр в замыкании
      const varInfo = resolveVariableInScope(paramName, funcScope);
      const isCaptured = varInfo?.isCaptured ?? false;

      // При per-call env параметры извлекаются как обычные var,
      // а потом копируются в per-call env явным присваиванием
      params.push(IR.param(paramName, defaultValue, isRest, needsPerCallEnv ? false : isCaptured));
      fnCtx.functionParams.set(paramName, index);
    }
    // TODO: destructuring parameters
  });

  // Обрабатываем тело функции
  let body = visitStatementList(node.body.statements, fnCtx);

  // Добавляем pending statements из тела (вложенные arrow/методы)
  if (fnCtx.pendingStatements.length > 0) {
    body = [...fnCtx.pendingStatements, ...body];
  }

  // Prepend per-call env: var __fnN_env = { __parent: __env };
  // + копирование captured параметров: __fnN_env.paramName = paramName
  if (needsPerCallEnv && perCallEnvName) {
    const perCallEnvCreation = IR.varDecl(
      perCallEnvName,
      IR.object([IR.prop("__parent", IR.id("__env"))]),
    );

    const capturedParamAssignments: IRStatement[] = [];
    node.parameters.forEach((param) => {
      if (ts.isIdentifier(param.name)) {
        const paramVarInfo = resolveVariableInScope(param.name.text, funcScope);
        if (paramVarInfo?.isCaptured) {
          capturedParamAssignments.push(
            IR.exprStmt(
              IR.assign(
                "=",
                IR.dot(IR.id(perCallEnvName), param.name.text),
                IR.id(param.name.text),
              ),
            ),
          );
        }
      }
    });

    body = [perCallEnvCreation, ...capturedParamAssignments, ...body];
  }

  // Module mode: вложенные функции получают уникальное имя при hoisting
  const isNestedInModule = ctx.mode === "module" && ctx.currentScope.type !== "module";
  const actualName = isNestedInModule ? ctx.bindings.hoistedName(name) : name;
  const isExported =
    ctx.mode === "module" &&
    ts.getModifiers(node)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);

  // Используем buildFunction для генерации desc паттерна
  // envRegistrationName = name: вызывающий код использует __env.inner, не __env.__hoisted_inner_0
  // effectiveEnvRef: всегда передаём ctx.currentEnvRef — дескриптор хранит parent env напрямую.
  // Отдельный per-function env НЕ создаётся — он бесполезен.
  // Per-call env (если нужен) создаётся внутри тела функции при каждом вызове.
  const result = buildFunction({
    name: actualName,
    params,
    body,
    capturedVars,
    bindings: ctx.bindings,
    loc: getLoc(node, ctx),
    effectiveEnvRef: ctx.currentEnvRef,
    useRefFormat: ctx.mode === "module",
    exportAs: isExported ? name : undefined,
    envRegistrationName: name,
    registrationEnvRef: ctx.currentEnvRef,
    codelibraryDepth: getModuleEnvDepth(ctx),
  });

  // Script mode: вложенные функции остаются в своей functional scope
  const isNestedInScript = ctx.mode === "script" && ctx.currentScope.type !== "module";
  if (isNestedInScript) {
    ctx.pendingStatements.unshift(result.funcDecl, ...result.setupStatements);
    return [];
  }

  // Top-level (script) или module: hoist наверх
  ctx.hoistedFunctions.push(result.funcDecl);
  ctx.pendingStatements.push(...result.setupStatements);

  return [];
}

/**
 * Обрабатывает variable statement
 */
export function visitVariableStatement(
  node: ts.VariableStatement,
  ctx: VisitorContext,
): IRStatement | IRStatement[] | null {
  const results: IRStatement[] = [];
  const isExported =
    ctx.mode === "module" &&
    ts.getModifiers(node)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);

  for (const decl of node.declarationList.declarations) {
    // Простой идентификатор
    if (ts.isIdentifier(decl.name)) {
      const varName = decl.name.text;
      const init = decl.initializer ? visitExpression(decl.initializer, ctx, varName) : null;

      // Проверяем является ли переменная captured и есть ли переименование
      const varInfo = resolveVariableInScope(varName, ctx.currentScope);
      const isCaptured = varInfo?.isCaptured ?? false;
      const actualName = varInfo?.renamedTo ?? varName;

      const envRef = isCaptured ? ctx.currentEnvRef : undefined;
      results.push(IR.varDecl(actualName, init, getLoc(decl, ctx), isCaptured, envRef));
      if (isExported) {
        results.push(
          IR.exprStmt(
            IR.assign(
              "=",
              IR.dot(IR.dot(IR.id("__module"), "exports"), varName),
              IR.id(actualName),
            ),
          ),
        );
      }
    }
    // Деструктуризация объекта: const { a, b, ...rest } = obj
    else if (ts.isObjectBindingPattern(decl.name) && decl.initializer) {
      let init = visitExpression(decl.initializer, ctx);
      // Литерал — выделяем временную переменную, чтобы не повторять его в выводе
      if (ts.isObjectLiteralExpression(decl.initializer)) {
        const tempVar = ctx.bindings.create("destruct");
        results.push(IR.varDecl(tempVar, init, getLoc(decl, ctx)));
        init = IR.id(tempVar);
      }
      const excludedKeys: string[] = [];

      for (const element of decl.name.elements) {
        if (ts.isBindingElement(element)) {
          if (element.dotDotDotToken) {
            if (!ts.isIdentifier(element.name)) continue;
            const restName = element.name.text;
            const varInfo = resolveVariableInScope(restName, ctx.currentScope);
            const actualName = varInfo?.renamedTo ?? restName;
            const restCall = IR.call(
              IR.dot(IR.id("bt"), "object_rest"),
              [init, IR.array(excludedKeys.map((k) => IR.string(k)))],
              getLoc(decl, ctx),
            );
            results.push(IR.varDecl(actualName, restCall, getLoc(decl, ctx)));
          } else if (ts.isIdentifier(element.name)) {
            const propertyName = element.propertyName
              ? (element.propertyName as ts.Identifier).text
              : element.name.text;
            const variableName = element.name.text;
            excludedKeys.push(propertyName);
            const val =
              ctx.mode === "bare"
                ? IR.dot(init, propertyName, getLoc(decl, ctx))
                : IR.btGetProperty(init, IR.string(propertyName), getLoc(decl, ctx));
            const initExpr = element.initializer
              ? IR.conditional(
                  IR.binary("!==", val, IR.id("undefined")),
                  val,
                  visitExpression(element.initializer, ctx),
                  getLoc(decl, ctx),
                )
              : val;
            const varInfo = resolveVariableInScope(variableName, ctx.currentScope);
            const actualName = varInfo?.renamedTo ?? variableName;
            results.push(IR.varDecl(actualName, initExpr, getLoc(decl, ctx)));
          }
          // Вложенная деструктуризация { a: { b } } пока не поддерживается
        }
      }
    }
    // Деструктуризация массива: const [x, y, ...rest] = arr
    else if (ts.isArrayBindingPattern(decl.name) && decl.initializer) {
      const init = visitExpression(decl.initializer, ctx);
      const auxVarName = ctx.bindings.create("arr");
      const auxInit = IR.call(IR.id("ArrayDirect"), [init], getLoc(decl, ctx));
      results.push(IR.varDecl(auxVarName, auxInit, getLoc(decl, ctx)));

      let index = 0;
      for (const element of decl.name.elements) {
        if (ts.isOmittedExpression(element)) {
          index++;
          continue;
        }
        if (ts.isBindingElement(element) && ts.isIdentifier(element.name)) {
          if (element.dotDotDotToken) {
            const restName = element.name.text;
            const varInfo = resolveVariableInScope(restName, ctx.currentScope);
            const actualName = varInfo?.renamedTo ?? restName;
            const restCall = IR.call(
              IR.dot(IR.id("bt"), "array_rest"),
              [IR.id(auxVarName), IR.number(index)],
              getLoc(decl, ctx),
            );
            results.push(IR.varDecl(actualName, restCall, getLoc(decl, ctx)));
          } else {
            const variableName = element.name.text;
            const val =
              ctx.mode === "bare"
                ? IR.member(IR.id(auxVarName), IR.number(index), true, getLoc(decl, ctx))
                : IR.btGetProperty(IR.id(auxVarName), IR.number(index), getLoc(decl, ctx));
            const initExpr = element.initializer
              ? IR.conditional(
                  IR.binary("!==", val, IR.id("undefined")),
                  val,
                  visitExpression(element.initializer, ctx),
                  getLoc(decl, ctx),
                )
              : val;
            const varInfo = resolveVariableInScope(variableName, ctx.currentScope);
            const actualName = varInfo?.renamedTo ?? variableName;
            results.push(IR.varDecl(actualName, initExpr, getLoc(decl, ctx)));
            index++;
          }
        }
      }
    } else {
      console.warn(`Destructuring not yet supported in variable declarations`);
    }
  }

  return results.length === 1 ? results[0] : results.length > 0 ? results : null;
}

/**
 * Обрабатывает export { a, b as c }
 */
function visitExportDeclaration(
  node: ts.ExportDeclaration,
  _ctx: VisitorContext,
): IRStatement[] | null {
  const clause = node.exportClause;
  if (!clause || !ts.isNamedExports(clause)) return null;

  const results: IRStatement[] = [];
  for (const spec of clause.elements) {
    const localName = (spec.propertyName ?? spec.name).text;
    const exportName = spec.name.text;
    results.push(
      IR.exprStmt(
        IR.assign("=", IR.dot(IR.dot(IR.id("__module"), "exports"), exportName), IR.id(localName)),
      ),
    );
  }
  return results;
}

/**
 * Обрабатывает export default expr
 */
function visitExportAssignment(node: ts.ExportAssignment, ctx: VisitorContext): IRStatement | null {
  const expr = visitExpression(node.expression, ctx);
  return IR.exprStmt(IR.assign("=", IR.dot(IR.dot(IR.id("__module"), "exports"), "default"), expr));
}

/**
 * Обрабатывает return statement
 */
export function visitReturnStatement(node: ts.ReturnStatement, ctx: VisitorContext): IRStatement {
  return IR.return(
    node.expression ? visitExpression(node.expression, ctx) : null,
    getLoc(node, ctx),
  );
}

// ============================================================================
// Control flow statements
// ============================================================================

/**
 * Обрабатывает if statement
 */
export function visitIfStatement(node: ts.IfStatement, ctx: VisitorContext): IRStatement {
  const test = visitExpression(node.expression, ctx);
  const consequent = visitStatementAsBlock(node.thenStatement, ctx);
  const alternate = node.elseStatement
    ? ts.isIfStatement(node.elseStatement)
      ? visitIfStatement(node.elseStatement, ctx)
      : visitStatementAsBlock(node.elseStatement, ctx)
    : null;

  return IR.if(test, consequent, alternate, getLoc(node, ctx));
}

/**
 * Обрабатывает for statement
 */
export function visitForStatement(node: ts.ForStatement, ctx: VisitorContext): IRStatement {
  let init: import("../ir/index.js").IRVariableDeclaration | IRExpression | null = null;

  if (node.initializer) {
    if (ts.isVariableDeclarationList(node.initializer)) {
      const decl = node.initializer.declarations[0];
      if (ts.isIdentifier(decl.name)) {
        init = IR.varDecl(
          decl.name.text,
          decl.initializer ? visitExpression(decl.initializer, ctx) : null,
        );
      }
    } else {
      init = visitExpression(node.initializer, ctx);
    }
  }

  const test = node.condition ? visitExpression(node.condition, ctx) : null;
  const update = node.incrementor ? visitExpression(node.incrementor, ctx) : null;
  const body = visitStatementAsBlock(node.statement, ctx);

  return IR.for(init, test, update, body, getLoc(node, ctx));
}

/**
 * Обрабатывает for-in statement
 */
export function visitForInStatement(node: ts.ForInStatement, ctx: VisitorContext): IRStatement {
  let left: import("../ir/index.js").IRVariableDeclaration | import("../ir/index.js").IRIdentifier;

  if (ts.isVariableDeclarationList(node.initializer)) {
    const decl = node.initializer.declarations[0];
    if (ts.isIdentifier(decl.name)) {
      left = IR.varDecl(decl.name.text, null);
    } else {
      left = IR.varDecl("__key", null);
    }
  } else if (ts.isIdentifier(node.initializer)) {
    left = IR.id(node.initializer.text);
  } else {
    left = IR.varDecl("__key", null);
  }

  const right = visitExpression(node.expression, ctx);
  const body = visitStatementAsBlock(node.statement, ctx);

  return IR.forIn(left, right, body, getLoc(node, ctx));
}

/**
 * Обрабатывает for-of statement
 * В BorisScript for-in итерирует по значениям массива (как for-of в JS)
 *
 * Переменная цикла сохраняется в __env только если используется в замыкании.
 */
export function visitForOfStatement(node: ts.ForOfStatement, ctx: VisitorContext): IRStatement {
  let itemVar: string;

  if (ts.isVariableDeclarationList(node.initializer)) {
    const decl = node.initializer.declarations[0];
    if (ts.isIdentifier(decl.name)) {
      itemVar = decl.name.text;
    } else {
      itemVar = ctx.bindings.create("item").slice(2); // remove __ prefix
    }
  } else if (ts.isIdentifier(node.initializer)) {
    itemVar = node.initializer.text;
  } else {
    itemVar = ctx.bindings.create("item").slice(2); // remove __ prefix
  }

  const arrExpr = visitExpression(node.expression, ctx);

  // Если выражение - простой идентификатор, используем напрямую
  const isSimple = arrExpr.kind === "Identifier" || arrExpr.kind === "ArgsAccess";
  const arrRef: IRExpression = isSimple ? arrExpr : IR.id(ctx.bindings.create("arr"));

  // Переменная цикла — уникальное имя через BindingManager
  // Это гарантирует отсутствие коллизии с именами из исходного кода
  const loopVar = ctx.bindings.create(itemVar);

  // Scope для let/const в for-of — node.statement; для var — hoist в function/module
  const loopBodyScope = ctx.scopeAnalysis.nodeToScope.get(node.statement);
  const searchScope = loopBodyScope ?? ctx.currentScope;
  const varInfo = resolveVariableInScope(itemVar, searchScope);
  const isCaptured = varInfo?.isCaptured ?? false;
  const actualName = varInfo?.renamedTo ?? itemVar;

  // Block env на каждую итерацию если есть captured (per-iteration semantics)
  const useBlockEnv = loopBodyScope?.hasCaptured ?? false;
  let blockEnvName: string | undefined;

  if (useBlockEnv) {
    blockEnvName = ctx.bindings.create("block") + "_env";
    ctx.pendingStatements.push(IR.varDecl(blockEnvName, null, undefined, false, undefined, true));
  }

  // Визитим тело с block env если нужно
  const loopCtx: VisitorContext =
    useBlockEnv && blockEnvName
      ? { ...ctx, currentEnvRef: blockEnvName, currentEnvScope: loopBodyScope! }
      : ctx;
  const body = visitStatementAsBlock(node.statement, loopCtx);

  // Добавляем в начало тела: block env и/или присваивание переменной цикла
  if (useBlockEnv && blockEnvName) {
    body.body.unshift(
      IR.exprStmt(
        IR.assign(
          "=",
          IR.id(blockEnvName),
          IR.object([IR.prop("__parent", IR.id(ctx.currentEnvRef))]),
        ),
      ),
    );
    if (isCaptured) {
      body.body.splice(
        1,
        0,
        IR.exprStmt(IR.assign("=", IR.dot(IR.id(blockEnvName), actualName), IR.id(loopVar))),
      );
    } else {
      body.body.splice(1, 0, IR.varDecl(actualName, IR.id(loopVar)));
    }
  } else if (isCaptured) {
    body.body.unshift(
      IR.exprStmt(IR.assign("=", IR.dot(IR.id(ctx.currentEnvRef), actualName), IR.id(loopVar))),
    );
  } else {
    body.body.unshift(IR.varDecl(actualName, IR.id(loopVar)));
  }

  const forIn = IR.forIn(IR.varDecl(loopVar, null), arrRef, body, getLoc(node, ctx));

  // Если не нужна временная переменная для массива
  if (isSimple) {
    return forIn;
  }

  // Оборачиваем с временной переменной
  return IR.block([IR.varDecl((arrRef as IRIdentifier).name, arrExpr), forIn]);
}

/**
 * Обрабатывает while statement
 */
export function visitWhileStatement(node: ts.WhileStatement, ctx: VisitorContext): IRStatement {
  return IR.while(
    visitExpression(node.expression, ctx),
    visitStatementAsBlock(node.statement, ctx),
    getLoc(node, ctx),
  );
}

/**
 * Обрабатывает do-while statement
 */
export function visitDoWhileStatement(node: ts.DoStatement, ctx: VisitorContext): IRStatement {
  return IR.doWhile(
    visitStatementAsBlock(node.statement, ctx),
    visitExpression(node.expression, ctx),
    getLoc(node, ctx),
  );
}

/**
 * Обрабатывает switch statement
 */
export function visitSwitchStatement(node: ts.SwitchStatement, ctx: VisitorContext): IRStatement {
  const discriminant = visitExpression(node.expression, ctx);
  const cases = node.caseBlock.clauses.map((clause) => {
    const test = ts.isCaseClause(clause) ? visitExpression(clause.expression, ctx) : null;
    const consequent = visitStatementList(clause.statements, ctx);
    return IR.case(test, consequent);
  });

  return IR.switch(discriminant, cases, getLoc(node, ctx));
}

/**
 * Обрабатывает try statement.
 *
 * Когда присутствует finally блок, выполняется десахаризация,
 * поскольку нативный finally в BorisScript работает некорректно.
 *
 * Паттерн: state machine с переменными __fType (тип завершения)
 * и __fVal (значение завершения).
 *
 * Типы завершения:
 * - 0 = normal (по умолчанию)
 * - 1 = return (return из try/catch, dispatch после finally)
 * - 2 = throw (исключение)
 * - (зарезервировано: 3 = break, 4 = continue)
 *
 * **try-finally (без catch):**
 * ```
 * var __fType = 0;
 * var __fVal;
 * try { T } catch (__fc) { __fType = 2; __fVal = __fc; }
 * F  // finally body
 * if (__fType === 2) { throw __fVal; }
 * ```
 *
 * **try-catch-finally:**
 * ```
 * var __fType = 0;
 * var __fVal;
 * try { T } catch (__fc) {
 *   __fType = 2; __fVal = __fc;
 *   try {
 *     var e = __fc; __fType = 0; __fVal = undefined;
 *     C  // user catch body
 *   } catch (__fc2) { __fType = 2; __fVal = __fc2; }
 * }
 * F  // finally body
 * if (__fType === 2) { throw __fVal; }
 * ```
 */
export function visitTryStatement(
  node: ts.TryStatement,
  ctx: VisitorContext,
): IRStatement | IRStatement[] {
  // Без finally — стандартная трансформация, нативный try-catch работает корректно
  if (!node.finallyBlock) {
    const block = visitBlock(node.tryBlock, ctx);

    let handler: import("../ir/index.js").IRCatchClause | null = null;
    if (node.catchClause) {
      const param = node.catchClause.variableDeclaration
        ? ts.isIdentifier(node.catchClause.variableDeclaration.name)
          ? node.catchClause.variableDeclaration.name.text
          : null
        : null;
      const body = visitBlock(node.catchClause.block, ctx);
      handler = IR.catch(param, body);
    }

    return IR.try(block, handler, null, getLoc(node, ctx));
  }

  // === Десахаризация try-catch-finally ===
  return desugarTryFinally(node, ctx);
}

/**
 * Десахаризация try-catch-finally через state machine.
 *
 * Генерирует последовательность IR statements, имитирующую finally-семантику
 * с помощью только try-catch конструкций.
 *
 * Return statements внутри try/catch тел заменяются на throw-sentinel:
 * `return expr` → `__fType = 1; __fVal = expr; throw __fVal;`
 *
 * В outer catch проверяется __fType для различения return-sentinel от реальных ошибок.
 * После finally-блока добавляется dispatch: `if (__fType === 1) return __fVal;`
 */
function desugarTryFinally(node: ts.TryStatement, ctx: VisitorContext): IRStatement[] {
  const loc = getLoc(node, ctx);
  const fType = ctx.bindings.create("fType");
  const fVal = ctx.bindings.create("fVal");
  const fc = ctx.bindings.create("fc");

  const result: IRStatement[] = [];

  // var __fType = 0;
  result.push(IR.varDecl(fType, IR.number(0)));
  // var __fVal;
  result.push(IR.varDecl(fVal, null));

  // Тело try блока (с трансформацией return → throw sentinel)
  const tryBlock = transformReturnsInBlock(visitBlock(node.tryBlock, ctx), fType, fVal);

  // Statements для outer catch: __fType = 2; __fVal = __fc;
  const setThrowState: IRStatement[] = [
    IR.exprStmt(IR.assign("=", IR.id(fType) as IRIdentifier, IR.number(2))),
    IR.exprStmt(IR.assign("=", IR.id(fVal) as IRIdentifier, IR.id(fc))),
  ];

  let outerCatchBody: IRStatement[];

  if (node.catchClause) {
    // === try-catch-finally: пользователь имеет catch блок ===
    const userParam = node.catchClause.variableDeclaration
      ? ts.isIdentifier(node.catchClause.variableDeclaration.name)
        ? node.catchClause.variableDeclaration.name.text
        : null
      : null;

    // Трансформируем return в user catch body тоже
    const userCatchBlock = transformReturnsInBlock(
      visitBlock(node.catchClause.block, ctx),
      fType,
      fVal,
    );

    // Тело внутреннего try: var e = __fc; __fType = 0; __fVal = undefined; C
    const innerTryBody: IRStatement[] = [];
    if (userParam) {
      innerTryBody.push(IR.varDecl(userParam, IR.id(fc)));
    }
    // Сбрасываем state — catch обрабатывает ошибку
    innerTryBody.push(IR.exprStmt(IR.assign("=", IR.id(fType) as IRIdentifier, IR.number(0))));
    innerTryBody.push(IR.exprStmt(IR.assign("=", IR.id(fVal) as IRIdentifier, IR.id("undefined"))));
    innerTryBody.push(...userCatchBlock.body);

    // Внутренний catch: перехват ошибок/sentinel из пользовательского catch
    const fc2 = ctx.bindings.create("fc");
    const innerCatchBody: IRStatement[] = [
      // Если __fType !== 1 (не return sentinel) — это реальная ошибка из catch body
      IR.if(
        IR.binary("!==", IR.id(fType), IR.number(1)),
        IR.block([
          IR.exprStmt(IR.assign("=", IR.id(fType) as IRIdentifier, IR.number(2))),
          IR.exprStmt(IR.assign("=", IR.id(fVal) as IRIdentifier, IR.id(fc2))),
        ]),
      ),
    ];

    // Outer catch body:
    // Если __fType === 1 (return sentinel из try) — пропускаем user catch
    // Иначе — сохраняем ошибку и запускаем user catch через inner try-catch
    outerCatchBody = [
      IR.if(
        IR.binary("!==", IR.id(fType), IR.number(1)),
        IR.block([
          ...setThrowState,
          IR.try(IR.block(innerTryBody), IR.catch(fc2, IR.block(innerCatchBody)), null),
        ]),
      ),
    ];
  } else {
    // === try-finally (без catch): ===
    // Если __fType !== 1 (не return sentinel) — запоминаем ошибку
    outerCatchBody = [IR.if(IR.binary("!==", IR.id(fType), IR.number(1)), IR.block(setThrowState))];
  }

  // Основной try-catch (без finally)
  result.push(IR.try(tryBlock, IR.catch(fc, IR.block(outerCatchBody)), null, loc));

  // Finally body — инлайним (всегда выполняется)
  // Return в finally — обычный return, перезаписывает всё (корректная JS-семантика)
  const finallyBlock = visitBlock(node.finallyBlock!, ctx);
  result.push(...finallyBlock.body);

  // Dispatch: if (__fType === 1) { return __fVal; }
  result.push(
    IR.if(IR.binary("===", IR.id(fType), IR.number(1)), IR.block([IR.return(IR.id(fVal))])),
  );
  // Dispatch: if (__fType === 2) { throw __fVal; }
  result.push(
    IR.if(IR.binary("===", IR.id(fType), IR.number(2)), IR.block([IR.throw(IR.id(fVal))])),
  );

  return result;
}

// ============================================================================
// Return → throw sentinel transformation for try-finally desugaring
// ============================================================================

/**
 * Заменяет `return expr` → `__fType = 1; __fVal = expr; throw __fVal;`
 * рекурсивно внутри блока. Не заходит в объявления функций.
 */
function transformReturnsInBlock(
  block: IRBlockStatement,
  fType: string,
  fVal: string,
): IRBlockStatement {
  const newBody = transformReturnsInList(block.body, fType, fVal);
  return newBody === block.body ? block : IR.block(newBody, block.loc);
}

/**
 * Обрабатывает список statements: заменяет return на sentinel-последовательность
 * (1 statement → 2-3 statements), рекурсивно обходит составные statements.
 */
function transformReturnsInList(stmts: IRStatement[], fType: string, fVal: string): IRStatement[] {
  let changed = false;
  const result: IRStatement[] = [];

  for (const stmt of stmts) {
    if (stmt.kind === "ReturnStatement") {
      changed = true;
      const ret = stmt as IRReturnStatement;
      result.push(IR.exprStmt(IR.assign("=", IR.id(fType) as IRIdentifier, IR.number(1))));
      if (ret.argument) {
        result.push(IR.exprStmt(IR.assign("=", IR.id(fVal) as IRIdentifier, ret.argument)));
      }
      result.push(IR.throw(IR.id(fVal)));
    } else {
      const transformed = transformReturnsInStmt(stmt, fType, fVal);
      if (transformed !== stmt) changed = true;
      result.push(transformed);
    }
  }

  return changed ? result : stmts;
}

/**
 * Рекурсивно обходит составной statement (if/while/for/switch/try/block),
 * заменяя вложенные return на sentinel. Не заходит в FunctionDeclaration.
 */
function transformReturnsInStmt(stmt: IRStatement, fType: string, fVal: string): IRStatement {
  switch (stmt.kind) {
    case "FunctionDeclaration":
      return stmt;

    case "BlockStatement": {
      return transformReturnsInBlock(stmt as IRBlockStatement, fType, fVal);
    }

    case "IfStatement": {
      const s = stmt as import("../ir/index.ts").IRIfStatement;
      const cons = transformReturnsInBody(s.consequent, fType, fVal);
      const alt = s.alternate ? transformReturnsInBody(s.alternate, fType, fVal) : s.alternate;
      if (cons === s.consequent && alt === s.alternate) return stmt;
      return IR.if(s.test, cons, alt, s.loc);
    }

    case "WhileStatement": {
      const s = stmt as import("../ir/index.ts").IRWhileStatement;
      const body = transformReturnsInBody(s.body, fType, fVal);
      return body === s.body ? stmt : IR.while(s.test, body, s.loc);
    }

    case "DoWhileStatement": {
      const s = stmt as import("../ir/index.ts").IRDoWhileStatement;
      const body = transformReturnsInBody(s.body, fType, fVal);
      return body === s.body ? stmt : IR.doWhile(body, s.test, s.loc);
    }

    case "ForStatement": {
      const s = stmt as import("../ir/index.ts").IRForStatement;
      const body = transformReturnsInBody(s.body, fType, fVal);
      return body === s.body ? stmt : IR.for(s.init, s.test, s.update, body, s.loc);
    }

    case "ForInStatement": {
      const s = stmt as import("../ir/index.ts").IRForInStatement;
      const body = transformReturnsInBody(s.body, fType, fVal);
      return body === s.body ? stmt : IR.forIn(s.left, s.right, body, s.loc);
    }

    case "SwitchStatement": {
      const s = stmt as import("../ir/index.ts").IRSwitchStatement;
      let changed = false;
      const newCases = s.cases.map((c) => {
        const newConsequent = transformReturnsInList(c.consequent, fType, fVal);
        if (newConsequent !== c.consequent) changed = true;
        return newConsequent === c.consequent ? c : IR.case(c.test, newConsequent);
      });
      return changed ? IR.switch(s.discriminant, newCases, s.loc) : stmt;
    }

    case "TryStatement": {
      const s = stmt as import("../ir/index.ts").IRTryStatement;
      const newBlock = transformReturnsInBlock(s.block, fType, fVal);
      const newHandler = s.handler
        ? (() => {
            const newBody = transformReturnsInBlock(s.handler!.body, fType, fVal);
            return newBody === s.handler!.body ? s.handler : IR.catch(s.handler!.param, newBody);
          })()
        : null;
      const newFinalizer = s.finalizer
        ? transformReturnsInBlock(s.finalizer, fType, fVal)
        : s.finalizer;
      if (newBlock === s.block && newHandler === s.handler && newFinalizer === s.finalizer)
        return stmt;
      return IR.try(newBlock, newHandler, newFinalizer, s.loc);
    }

    default:
      return stmt;
  }
}

/**
 * Трансформирует одиночный statement-or-block (тело if/while/for).
 * Если это ReturnStatement — оборачивает sentinel-последовательность в блок.
 */
function transformReturnsInBody(stmt: IRStatement, fType: string, fVal: string): IRStatement {
  if (stmt.kind === "ReturnStatement") {
    const ret = stmt as IRReturnStatement;
    const sentinel: IRStatement[] = [
      IR.exprStmt(IR.assign("=", IR.id(fType) as IRIdentifier, IR.number(1))),
    ];
    if (ret.argument) {
      sentinel.push(IR.exprStmt(IR.assign("=", IR.id(fVal) as IRIdentifier, ret.argument)));
    }
    sentinel.push(IR.throw(IR.id(fVal)));
    return IR.block(sentinel);
  }
  if (stmt.kind === "BlockStatement") {
    return transformReturnsInBlock(stmt as IRBlockStatement, fType, fVal);
  }
  return transformReturnsInStmt(stmt, fType, fVal);
}

// ============================================================================
// Block and statement list helpers
// ============================================================================

/**
 * Обрабатывает block
 */
export function visitBlock(
  node: ts.Block,
  ctx: VisitorContext,
): import("../ir/index.js").IRBlockStatement {
  // Проверяем есть ли block scope для этого блока
  const blockScope = ctx.scopeAnalysis.nodeToScope.get(node);

  if (blockScope && blockScope !== ctx.currentScope) {
    const blockCtx: VisitorContext = { ...ctx, currentScope: blockScope };

    // Block env только если есть captured let/const
    // Для for-of тело цикла — block env создаётся в visitForOfStatement, используем ctx
    const isForOfLoopBody =
      node.parent && ts.isForOfStatement(node.parent) && node.parent.statement === node;
    if (blockScope.hasCaptured && !isForOfLoopBody) {
      const blockEnvName = ctx.bindings.create("block") + "_env";
      const blockEnvDecl = IR.varDecl(
        blockEnvName,
        IR.object([IR.prop("__parent", IR.id(ctx.currentEnvRef))]),
      );
      const blockCtxWithEnv: VisitorContext = {
        ...blockCtx,
        currentEnvRef: blockEnvName,
        currentEnvScope: blockScope,
      };
      const body = visitStatementList(node.statements, blockCtxWithEnv);
      return IR.block([blockEnvDecl, ...body], getLoc(node, ctx));
    }
    if (isForOfLoopBody && blockScope.hasCaptured) {
      const loopBodyCtx: VisitorContext = { ...blockCtx, currentEnvScope: blockScope };
      return IR.block(visitStatementList(node.statements, loopBodyCtx), getLoc(node, ctx));
    }
    return IR.block(visitStatementList(node.statements, blockCtx), getLoc(node, ctx));
  }

  return IR.block(visitStatementList(node.statements, ctx), getLoc(node, ctx));
}

/**
 * Обрабатывает список statements
 */
export function visitStatementList(
  statements: ts.NodeArray<ts.Statement>,
  ctx: VisitorContext,
): IRStatement[] {
  const result: IRStatement[] = [];

  for (const stmt of statements) {
    const irNodes = visitStatement(stmt, ctx);

    // Pending statements (от arrow функций и т.д.) идут ПЕРЕД результатом
    if (ctx.pendingStatements.length > 0) {
      result.push(...ctx.pendingStatements);
      ctx.pendingStatements.length = 0;
    }

    if (irNodes) {
      if (Array.isArray(irNodes)) {
        result.push(...irNodes);
      } else {
        result.push(irNodes);
      }
    }
  }

  return result;
}

/**
 * Преобразует statement в block (оборачивает если нужно)
 */
export function visitStatementAsBlock(
  node: ts.Statement,
  ctx: VisitorContext,
): import("../ir/index.js").IRBlockStatement {
  if (ts.isBlock(node)) {
    return visitBlock(node, ctx);
  }

  const stmt = visitStatement(node, ctx);

  // Pending statements (от arrow функций и т.д.) должны быть включены в блок
  const body: IRStatement[] = [];
  if (ctx.pendingStatements.length > 0) {
    body.push(...ctx.pendingStatements);
    ctx.pendingStatements.length = 0;
  }

  if (Array.isArray(stmt)) {
    body.push(...stmt);
  } else if (stmt) {
    body.push(stmt);
  }

  return IR.block(body, getLoc(node, ctx));
}

// ============================================================================
// Class declaration
// ============================================================================

/**
 * Обрабатывает ClassDeclaration — преобразует в prototype + constructor паттерн.
 *
 * Генерирует:
 * 1. Для каждого метода: function + env/desc (через buildFunction)
 * 2. Объект-прототип ClassName_proto с дескрипторами методов
 * 3. Конструктор (explicit или default): function + env/desc
 * 4. Дескриптор конструктора с дополнительным полем `proto`
 * 5. Регистрацию конструктора в __env: __env.ClassName = ctor_desc
 *
 * Пример:
 * ```typescript
 * class Animal {
 *   name: string;
 *   constructor(name: string) { this.name = name; }
 *   speak() { return this.name + " speaks"; }
 * }
 * ```
 * →
 * ```javascript
 * function Animal_speak(__env, __this, __args) { ... }
 * var Animal_speak_desc = { "@descriptor": "function", ... };
 * var Animal_proto = { speak: __env.Animal_speak };
 * function Animal_ctor(__env, __this, __args) { ... }
 * var Animal_ctor_desc = { "@descriptor": "function", ..., proto: Animal_proto };
 * __env.Animal = Animal_ctor_desc;
 * ```
 */
function visitClassDeclaration(node: ts.ClassDeclaration, ctx: VisitorContext): IRStatement[] {
  const className = node.name?.text ?? ctx.bindings.create("class");

  // ============ Наследование (extends) ============
  let baseClassExpr: ts.Expression | undefined;
  for (const clause of node.heritageClauses ?? []) {
    if (clause.token === ts.SyntaxKind.ExtendsKeyword && clause.types.length > 0) {
      baseClassExpr = clause.types[0].expression;
    }
  }

  // Собираем методы и конструктор
  const methods: ts.MethodDeclaration[] = [];
  let ctorNode: ts.ConstructorDeclaration | undefined;
  const propertyInitializers: ts.PropertyDeclaration[] = [];

  for (const member of node.members) {
    if (ts.isConstructorDeclaration(member) && member.body) {
      ctorNode = member;
    } else if (ts.isMethodDeclaration(member) && ts.isIdentifier(member.name) && member.body) {
      methods.push(member);
    } else if (
      ts.isPropertyDeclaration(member) &&
      ts.isIdentifier(member.name) &&
      member.initializer
    ) {
      propertyInitializers.push(member);
    }
    // PropertyDeclaration without initializer — type-only, skip
    // GetAccessor, SetAccessor — not supported yet
  }

  // ============ Методы ============
  const protoProperties: IRObjectProperty[] = [];
  const methodHoistedFunctions: IRFunctionDeclaration[] = [];

  for (const method of methods) {
    const methodName = (method.name as ts.Identifier).text;
    const methodScope = ctx.scopeAnalysis.nodeToScope.get(method) ?? ctx.currentScope;
    const needsPerCallEnv = methodScope.hasCaptured;
    const perCallEnvName = needsPerCallEnv ? ctx.bindings.create("fn") + "_env" : undefined;

    // Контекст для тела метода
    const fnCtx: VisitorContext = {
      mode: ctx.mode,
      functionParams: new Map(),
      hoistedFunctions: ctx.hoistedFunctions,
      typeChecker: ctx.typeChecker,
      sourceFile: ctx.sourceFile,
      bindings: ctx.bindings,
      scopeAnalysis: ctx.scopeAnalysis,
      currentScope: methodScope,
      pendingStatements: [],
      currentEnvRef: perCallEnvName ?? "__env",
      currentEnvScope: methodScope,
      closureEnvScope: needsPerCallEnv ? undefined : ctx.currentEnvScope,
      xmlDocumentSymbol: ctx.xmlDocumentSymbol,
      xmlElemSymbol: ctx.xmlElemSymbol,
      importBindings: ctx.importBindings,
      helperFlags: ctx.helperFlags,
      superContext: baseClassExpr ? { baseClassExpr } : undefined,
    };

    // Параметры
    const params: IRFunctionParam[] = [];
    method.parameters.forEach((param, index) => {
      if (ts.isIdentifier(param.name)) {
        const paramName = param.name.text;
        const defaultValue = param.initializer
          ? visitExpression(param.initializer, fnCtx)
          : undefined;
        const isRest = !!param.dotDotDotToken;
        const varInfo = resolveVariableInScope(paramName, methodScope);
        const isCaptured = varInfo?.isCaptured ?? false;
        params.push(
          IR.param(paramName, defaultValue, isRest, needsPerCallEnv ? false : isCaptured),
        );
        fnCtx.functionParams.set(paramName, index);
      }
    });

    // Тело
    let body = visitStatementList(method.body!.statements, fnCtx);
    if (fnCtx.pendingStatements.length > 0) {
      body = [...fnCtx.pendingStatements, ...body];
    }

    // Per-call env
    if (needsPerCallEnv && perCallEnvName) {
      const perCallEnvCreation = IR.varDecl(
        perCallEnvName,
        IR.object([IR.prop("__parent", IR.id("__env"))]),
      );
      const capturedParamAssignments: IRStatement[] = [];
      method.parameters.forEach((param) => {
        if (ts.isIdentifier(param.name)) {
          const paramVarInfo = resolveVariableInScope(param.name.text, methodScope);
          if (paramVarInfo?.isCaptured) {
            capturedParamAssignments.push(
              IR.exprStmt(
                IR.assign(
                  "=",
                  IR.dot(IR.id(perCallEnvName), param.name.text),
                  IR.id(param.name.text),
                ),
              ),
            );
          }
        }
      });
      body = [perCallEnvCreation, ...capturedParamAssignments, ...body];
    }

    const capturedVars =
      methodScope !== ctx.currentScope ? collectCapturedVarsForArrow(methodScope, ctx) : [];

    const funcName = `${className}_${methodName}`;
    const result = buildFunction({
      name: funcName,
      params,
      body,
      capturedVars,
      bindings: ctx.bindings,
      loc: getLoc(method, ctx),
      registerInEnv: false, // Не регистрируем отдельно в __env
      effectiveEnvRef: ctx.currentEnvRef,
      useRefFormat: ctx.mode === "module",
      registrationEnvRef: ctx.currentEnvRef,
      codelibraryDepth: getModuleEnvDepth(ctx),
    });

    // Hoist method function
    if (ctx.mode === "module") {
      ctx.hoistedFunctions.push(result.funcDecl);
    } else {
      methodHoistedFunctions.push(result.funcDecl);
    }
    ctx.pendingStatements.push(...result.setupStatements);

    // В прототипе — ссылка на дескриптор
    protoProperties.push(IR.prop(methodName, IR.id(result.descName)));
  }

  // ============ Прототип ============
  const protoVarName = `${className}_proto`;
  ctx.pendingStatements.push(
    IR.varDecl(protoVarName, IR.object(protoProperties, getLoc(node, ctx))),
  );

  // Наследование: Child_proto.__proto = ParentClass.proto
  if (baseClassExpr) {
    // Резолвим базовый класс через __env (как вызов функции)
    const baseRef = ts.isIdentifier(baseClassExpr)
      ? resolveCallableRef(baseClassExpr.text, ctx, getLoc(baseClassExpr, ctx))
      : visitExpression(baseClassExpr, ctx);
    ctx.pendingStatements.push(
      IR.exprStmt(IR.assign("=", IR.dot(IR.id(protoVarName), "__proto"), IR.dot(baseRef, "proto"))),
    );
  }

  // ============ Конструктор ============
  const ctorScope = ctorNode
    ? (ctx.scopeAnalysis.nodeToScope.get(ctorNode) ?? ctx.currentScope)
    : ctx.currentScope;
  const ctorNeedsPerCallEnv = ctorNode ? ctorScope.hasCaptured : false;
  const ctorPerCallEnvName = ctorNeedsPerCallEnv ? ctx.bindings.create("fn") + "_env" : undefined;

  const ctorFnCtx: VisitorContext = {
    mode: ctx.mode,
    functionParams: new Map(),
    hoistedFunctions: ctx.hoistedFunctions,
    typeChecker: ctx.typeChecker,
    sourceFile: ctx.sourceFile,
    bindings: ctx.bindings,
    scopeAnalysis: ctx.scopeAnalysis,
    currentScope: ctorScope,
    pendingStatements: [],
    currentEnvRef: ctorPerCallEnvName ?? "__env",
    currentEnvScope: ctorScope,
    closureEnvScope: ctorNeedsPerCallEnv ? undefined : ctx.currentEnvScope,
    xmlDocumentSymbol: ctx.xmlDocumentSymbol,
    xmlElemSymbol: ctx.xmlElemSymbol,
    importBindings: ctx.importBindings,
    helperFlags: ctx.helperFlags,
    superContext: baseClassExpr ? { baseClassExpr } : undefined,
  };

  // Параметры конструктора
  const ctorParams: IRFunctionParam[] = [];
  if (ctorNode) {
    ctorNode.parameters.forEach((param, index) => {
      if (ts.isIdentifier(param.name)) {
        const paramName = param.name.text;
        const defaultValue = param.initializer
          ? visitExpression(param.initializer, ctorFnCtx)
          : undefined;
        const isRest = !!param.dotDotDotToken;
        const varInfo = resolveVariableInScope(paramName, ctorScope);
        const isCaptured = varInfo?.isCaptured ?? false;
        ctorParams.push(
          IR.param(paramName, defaultValue, isRest, ctorNeedsPerCallEnv ? false : isCaptured),
        );
        ctorFnCtx.functionParams.set(paramName, index);
      }
    });
  }

  // Тело конструктора: property initializers + explicit body
  let ctorBody: IRStatement[] = [];

  // Property initializers: this.x = <initializer>
  for (const prop of propertyInitializers) {
    const propName = (prop.name as ts.Identifier).text;
    const initExpr = visitExpression(prop.initializer!, ctorFnCtx);
    ctorBody.push(IR.exprStmt(IR.btSetProperty(IR.id("__this"), IR.string(propName), initExpr)));
  }

  // Explicit constructor body
  if (ctorNode?.body) {
    const bodyStmts = visitStatementList(ctorNode.body.statements, ctorFnCtx);
    ctorBody.push(...bodyStmts);
  }

  // Pending statements from constructor body
  if (ctorFnCtx.pendingStatements.length > 0) {
    ctorBody = [...ctorFnCtx.pendingStatements, ...ctorBody];
  }

  // Per-call env for constructor
  if (ctorNeedsPerCallEnv && ctorPerCallEnvName) {
    const perCallEnvCreation = IR.varDecl(
      ctorPerCallEnvName,
      IR.object([IR.prop("__parent", IR.id("__env"))]),
    );
    const capturedParamAssignments: IRStatement[] = [];
    if (ctorNode) {
      ctorNode.parameters.forEach((param) => {
        if (ts.isIdentifier(param.name)) {
          const paramVarInfo = resolveVariableInScope(param.name.text, ctorScope);
          if (paramVarInfo?.isCaptured) {
            capturedParamAssignments.push(
              IR.exprStmt(
                IR.assign(
                  "=",
                  IR.dot(IR.id(ctorPerCallEnvName), param.name.text),
                  IR.id(param.name.text),
                ),
              ),
            );
          }
        }
      });
    }
    ctorBody = [perCallEnvCreation, ...capturedParamAssignments, ...ctorBody];
  }

  const ctorCapturedVars =
    ctorNode && ctorScope !== ctx.currentScope ? collectCapturedVarsForArrow(ctorScope, ctx) : [];

  const ctorFuncName = `${className}_ctor`;
  const ctorResult = buildFunction({
    name: ctorFuncName,
    params: ctorParams,
    body: ctorBody,
    capturedVars: ctorCapturedVars,
    bindings: ctx.bindings,
    loc: ctorNode ? getLoc(ctorNode, ctx) : getLoc(node, ctx),
    registerInEnv: true,
    envRegistrationName: className,
    effectiveEnvRef: ctx.currentEnvRef,
    useRefFormat: ctx.mode === "module",
    registrationEnvRef: ctx.currentEnvRef,
    codelibraryDepth: getModuleEnvDepth(ctx),
  });

  // Hoist constructor function
  if (ctx.mode === "module") {
    ctx.hoistedFunctions.push(ctorResult.funcDecl);
  } else {
    methodHoistedFunctions.push(ctorResult.funcDecl);
  }

  // Добавляем setup (env, desc, registration)
  ctx.pendingStatements.push(...ctorResult.setupStatements);

  // Добавляем proto в дескриптор конструктора: ClassName_ctor_desc.proto = ClassName_proto
  ctx.pendingStatements.push(
    IR.exprStmt(IR.assign("=", IR.dot(IR.id(ctorResult.descName), "proto"), IR.id(protoVarName))),
  );

  // Hoist method functions (script mode)
  if (ctx.mode !== "module" && methodHoistedFunctions.length > 0) {
    ctx.pendingStatements.unshift(...methodHoistedFunctions);
  }

  // Export support
  const isExported =
    ctx.mode === "module" &&
    ts.getModifiers(node)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
  if (isExported) {
    ctx.pendingStatements.push(
      IR.exprStmt(
        IR.assign(
          "=",
          IR.dot(IR.dot(IR.id("__module"), "exports"), className),
          IR.id(ctorResult.descName),
        ),
      ),
    );
  }

  return [];
}
