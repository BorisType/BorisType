/**
 * Declaration visitors — import, export, function, variable, class
 *
 * Содержит:
 * - visitImportDeclaration
 * - visitFunctionDeclaration
 * - visitVariableStatement
 * - visitExportDeclaration
 * - visitExportAssignment
 * - visitClassDeclaration
 *
 * @module lowering/statements/declarations
 */

import * as ts from "typescript";
import {
  IR,
  type IRStatement,
  type IRExpression,
  type IRFunctionDeclaration,
  type IRObjectProperty,
  type IRIdentifier,
} from "../../ir/index.ts";
import { createBtDiagnostic, BtDiagnosticCode } from "../../pipeline/diagnostics.ts";
import type { VisitorContext } from "../visitor.ts";
import {
  visitExpression,
  helperEnvAccess as helperEnvAccessFromStatements,
  resolveCallableRef,
} from "../expressions.ts";
import {
  getLoc,
  resolveVariableInScope,
  collectCapturedVarsForArrow,
  isTypeOnlyImport,
} from "../helpers.ts";
import { getModuleEnvDepth } from "../env-resolution.ts";
import { buildFunction } from "../function-builder.ts";
import {
  resolvePerCallEnv,
  buildPerCallEnvStatements,
  extractFunctionParams,
  createInnerFunctionContext,
  applyHoisting,
} from "../function-helpers.ts";
import { visitStatementList } from "./blocks.ts";

// ============================================================================
// Import declaration
// ============================================================================

/**
 * Обрабатывает ImportDeclaration: генерирует bt.require и заполняет importBindings.
 * Live binding: доступ через moduleVar.exportedName при каждом обращении.
 */
export function visitImportDeclaration(
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
  const funcScope = ctx.scopeAnalysis.nodeToScope.get(node) || ctx.currentScope;
  const capturedVars = collectCapturedVarsForArrow(funcScope, ctx);
  const perCallEnv = resolvePerCallEnv(funcScope, ctx);

  const fnCtx = createInnerFunctionContext({ funcScope, ctx, perCallEnv, capturedVars });
  const params = extractFunctionParams(
    node.parameters,
    funcScope,
    fnCtx,
    perCallEnv.needed,
    visitExpression,
  );

  // Обрабатываем тело функции
  let body = visitStatementList(node.body.statements, fnCtx);
  if (fnCtx.pendingStatements.length > 0) {
    body = [...fnCtx.pendingStatements, ...body];
  }

  // Prepend per-call env
  if (perCallEnv.needed && perCallEnv.envName) {
    body = [...buildPerCallEnvStatements(perCallEnv.envName, node.parameters, funcScope), ...body];
  }

  // Module mode: вложенные функции получают уникальное имя при hoisting
  const isNestedInModule = ctx.config.moduleExports && ctx.currentScope.type !== "module";
  const actualName = isNestedInModule ? ctx.bindings.hoistedName(name) : name;
  const isExported =
    ctx.config.moduleExports &&
    ts.getModifiers(node)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);

  const result = buildFunction({
    name: actualName,
    params,
    body,
    capturedVars,
    bindings: ctx.bindings,
    loc: getLoc(node, ctx),
    effectiveEnvRef: ctx.currentEnvRef,
    useRefFormat: ctx.config.useRefFormat,
    exportAs: isExported ? name : undefined,
    envRegistrationName: name,
    registrationEnvRef: ctx.currentEnvRef,
    codelibraryDepth: getModuleEnvDepth(ctx),
  });

  applyHoisting(result, ctx);
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
    ctx.config.moduleExports &&
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
            const val = !ctx.config.wrapPropertyAccess
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
            const val = !ctx.config.wrapPropertyAccess
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
      ctx.diagnostics.push(
        createBtDiagnostic(
          ctx.sourceFile,
          decl,
          "Destructuring not yet supported in variable declarations",
          ts.DiagnosticCategory.Error,
          BtDiagnosticCode.DestructuringNotSupported,
        ),
      );
    }
  }

  return results.length === 1 ? results[0] : results.length > 0 ? results : null;
}

/**
 * Обрабатывает export { a, b as c }
 */
export function visitExportDeclaration(
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
export function visitExportAssignment(
  node: ts.ExportAssignment,
  ctx: VisitorContext,
): IRStatement | null {
  const expr = visitExpression(node.expression, ctx);
  return IR.exprStmt(IR.assign("=", IR.dot(IR.dot(IR.id("__module"), "exports"), "default"), expr));
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
export function visitClassDeclaration(
  node: ts.ClassDeclaration,
  ctx: VisitorContext,
): IRStatement[] {
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
    const perCallEnv = resolvePerCallEnv(methodScope, ctx);
    const capturedVars =
      methodScope !== ctx.currentScope ? collectCapturedVarsForArrow(methodScope, ctx) : [];

    const fnCtx = createInnerFunctionContext({
      funcScope: methodScope,
      ctx,
      perCallEnv,
      capturedVars,
      extra: { superContext: baseClassExpr ? { baseClassExpr } : undefined },
    });
    const params = extractFunctionParams(
      method.parameters,
      methodScope,
      fnCtx,
      perCallEnv.needed,
      visitExpression,
    );

    // Тело
    let body = visitStatementList(method.body!.statements, fnCtx);
    if (fnCtx.pendingStatements.length > 0) {
      body = [...fnCtx.pendingStatements, ...body];
    }

    // Per-call env
    if (perCallEnv.needed && perCallEnv.envName) {
      body = [
        ...buildPerCallEnvStatements(perCallEnv.envName, method.parameters, methodScope),
        ...body,
      ];
    }

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
      useRefFormat: ctx.config.useRefFormat,
      registrationEnvRef: ctx.currentEnvRef,
      codelibraryDepth: getModuleEnvDepth(ctx),
    });

    // Hoist method function
    if (ctx.config.moduleExports) {
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
  const ctorPerCallEnv = ctorNode
    ? resolvePerCallEnv(ctorScope, ctx)
    : { envName: undefined, needed: false };
  const ctorCapturedVars =
    ctorNode && ctorScope !== ctx.currentScope ? collectCapturedVarsForArrow(ctorScope, ctx) : [];

  const ctorFnCtx = createInnerFunctionContext({
    funcScope: ctorScope,
    ctx,
    perCallEnv: ctorPerCallEnv,
    capturedVars: ctorCapturedVars,
    extra: { superContext: baseClassExpr ? { baseClassExpr } : undefined },
  });

  // Параметры конструктора
  const ctorParams = ctorNode
    ? extractFunctionParams(
        ctorNode.parameters,
        ctorScope,
        ctorFnCtx,
        ctorPerCallEnv.needed,
        visitExpression,
      )
    : [];

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
  if (ctorPerCallEnv.needed && ctorPerCallEnv.envName && ctorNode) {
    ctorBody = [
      ...buildPerCallEnvStatements(ctorPerCallEnv.envName, ctorNode.parameters, ctorScope),
      ...ctorBody,
    ];
  }

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
    useRefFormat: ctx.config.useRefFormat,
    registrationEnvRef: ctx.currentEnvRef,
    codelibraryDepth: getModuleEnvDepth(ctx),
  });

  // Hoist constructor function
  if (ctx.config.moduleExports) {
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

  // Hoist method functions (non-module mode)
  if (!ctx.config.moduleExports && methodHoistedFunctions.length > 0) {
    ctx.pendingStatements.unshift(...methodHoistedFunctions);
  }

  // Export support
  const isExported =
    ctx.config.moduleExports &&
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
