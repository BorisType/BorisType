/**
 * Hoist Pass — перемещает hoisting из emitter в IR
 *
 * Делает hoisting переменных и функций явным в IR:
 * - Вверх scope перемещаются FunctionDeclaration и hoistOnly VarDecl
 * - Inline VarDecl заменяются на assignments
 * - for(var i = ...) → for(i = ...) (init VarDecl → assignment)
 * - for(var k in obj) → for(k in obj) (left VarDecl → identifier)
 *
 * После этого pass эмиттеру не нужны Hoisted-варианты emitters.
 *
 * @module passes/hoist
 */

import {
  IR,
  type IRProgram,
  type IRStatement,
  type IRFunctionDeclaration,
  type IRVariableDeclaration,
  type IRExpression,
  type IRIdentifier,
  type IRForStatement,
  type IRForInStatement,
} from "../ir/index.ts";
import type { IRPass } from "./types.ts";
import { mapStatements, forEachStatement } from "./walker.ts";

/**
 * Hoist pass — перемещает hoisting переменных и функций в IR.
 *
 * В bare-режиме (`program.noHoist`):
 * - Top-level: без hoisting (statements остаются как есть)
 * - Внутри функций: hoisting выполняется
 *
 * В обычном режиме:
 * - Top-level и внутри функций: полный hoisting
 */
export const hoistPass: IRPass = {
  name: "hoist",
  run(program: IRProgram): IRProgram {
    if (program.noHoist) {
      // Bare mode: top-level без hoisting, но функции обрабатываем
      const newBody = hoistInFunctionsInList(program.body);
      return newBody === program.body
        ? program
        : IR.program(newBody, program.sourceFile, program.noHoist);
    }

    // Normal mode: hoisting на top level
    const newBody = hoistScope(program.body, null);
    return IR.program(newBody, program.sourceFile, program.noHoist);
  },
};

// ============================================================================
// Scope hoisting
// ============================================================================

/**
 * Рекурсивно собирает все FunctionDeclaration в текущем scope.
 * Не заходит внутрь тел функций (у них свой scope).
 */
function collectFunctionDeclarations(stmts: IRStatement[]): IRFunctionDeclaration[] {
  const result: IRFunctionDeclaration[] = [];
  forEachStatement(
    stmts,
    (stmt) => {
      if (stmt.kind === "FunctionDeclaration") {
        result.push(stmt as IRFunctionDeclaration);
      }
    },
    { enterFunctions: false },
  );
  return result;
}

/**
 * Рекурсивно удаляет все FunctionDeclaration из дерева (заменяет на пустой массив).
 * Не заходит внутрь тел функций.
 */
function removeFunctionDeclarations(stmts: IRStatement[]): IRStatement[] {
  return mapStatements(
    stmts,
    (stmt) => {
      if (stmt.kind === "FunctionDeclaration") return [];
      return null;
    },
    { enterFunctions: false },
  );
}

/**
 * Выполняет hoisting для одного scope (top-level или function body).
 *
 * @param stmts - Тело scope
 * @param paramNames - Имена параметров функции (не хоистить), null для top-level
 * @returns Новый список statements с явным hoisting
 */
function hoistScope(stmts: IRStatement[], paramNames: Set<string> | null): IRStatement[] {
  // 1. Собираем имена переменных (non-captured) для hoisting
  const varNames = collectVarNames(stmts);

  // Исключаем параметры функции
  if (paramNames) {
    for (const name of paramNames) {
      varNames.delete(name);
    }
  }

  // 2. Собираем ВСЕ FunctionDeclaration рекурсивно (в т.ч. из циклов, блоков)
  const functions = collectFunctionDeclarations(stmts);

  // 2.1. Удаляем FunctionDeclaration из тела (они переместятся наверх)
  const stmtsWithoutFns = removeFunctionDeclarations(stmts);

  // 3. Рекурсивно обрабатываем вложенные функции (hoisting в их body)
  const hoistedFunctions = functions.map((fn) => hoistFunction(fn));

  // 4. Заменяем VarDecl → assignments в основном теле
  const transformedBody = transformVarDeclsToAssignments(stmtsWithoutFns);

  // 4.1. Рекурсивно обрабатываем вложенные функции (внутри blocks, if, etc.)
  const finalBody = hoistInFunctionsInList(transformedBody);

  // 5. Собираем результат: functions → hoistOnly vars → transformed body
  const result: IRStatement[] = [];

  // Functions first
  for (const fn of hoistedFunctions) {
    result.push(fn);
  }

  // Hoisted var declarations
  for (const name of varNames) {
    result.push(IR.varDecl(name, null, undefined, undefined, undefined, true));
  }

  // Transformed body
  for (const stmt of finalBody) {
    result.push(stmt);
  }

  return result;
}

/**
 * Обрабатывает одну FunctionDeclaration: hoisting в её body.
 */
function hoistFunction(fn: IRFunctionDeclaration): IRFunctionDeclaration {
  const paramNames = new Set(fn.originalParams.map((p) => p.name));

  const isBarePlain = fn.plainSignature === true;

  let newBody: IRStatement[];

  if (isBarePlain) {
    // Bare/plain function: хоистим только переменные, функции остаются на месте
    newBody = hoistScopeVarsOnly(fn.body, paramNames);
  } else {
    // Normal function: полный hoisting (функции + переменные)
    newBody = hoistScope(fn.body, paramNames);
  }

  if (newBody === fn.body) return fn;
  return IR.functionDecl(fn.name, fn.originalParams, newBody, fn.loc, fn.plainSignature);
}

/**
 * Hoisting только переменных (не функций) — для bare/plain functions.
 *
 * @param stmts - Тело функции
 * @param paramNames - Имена параметров (не хоистить)
 */
function hoistScopeVarsOnly(stmts: IRStatement[], paramNames: Set<string>): IRStatement[] {
  // 1. Собираем имена переменных
  const varNames = collectVarNames(stmts);
  for (const name of paramNames) {
    varNames.delete(name);
  }

  if (varNames.size === 0) {
    // Нет переменных для hoisting, но рекурсируем в nested functions
    return hoistInFunctionsInList(stmts);
  }

  // 2. Заменяем VarDecl → assignments
  const transformedBody = transformVarDeclsToAssignments(stmts);

  // 3. Рекурсируем в nested functions (внутри transformed body)
  const finalBody = hoistInFunctionsInList(transformedBody);

  // 4. Собираем результат: hoistOnly vars → transformed body
  const result: IRStatement[] = [];

  for (const name of varNames) {
    result.push(IR.varDecl(name, null, undefined, undefined, undefined, true));
  }

  for (const stmt of finalBody) {
    result.push(stmt);
  }

  return result;
}

/**
 * Рекурсивно обрабатывает nested functions в списке statements.
 * Использует mapStatements для обхода только FunctionDeclaration.
 */
function hoistInFunctionsInList(stmts: IRStatement[]): IRStatement[] {
  return mapStatements(
    stmts,
    (stmt) => {
      if (stmt.kind === "FunctionDeclaration") {
        const fn = hoistFunction(stmt as IRFunctionDeclaration);
        return fn !== stmt ? fn : null;
      }
      return null;
    },
    { enterFunctions: false },
  );
}

// ============================================================================
// Variable name collection
// ============================================================================

/**
 * Собирает имена non-captured переменных из statements.
 *
 * Не заходит внутрь функций (у них свой scope).
 */
function collectVarNames(stmts: IRStatement[]): Set<string> {
  const vars = new Set<string>();

  forEachStatement(stmts, (stmt) => {
    if (stmt.kind === "VariableDeclaration") {
      const decl = stmt as IRVariableDeclaration;
      if (!decl.isCaptured) {
        vars.add(decl.name);
      }
    }
    // Обрабатываем for(var i = ...) и for(var k in ...)
    if (stmt.kind === "ForStatement") {
      const forStmt = stmt as IRForStatement;
      if (forStmt.init && forStmt.init.kind === "VariableDeclaration") {
        const decl = forStmt.init as IRVariableDeclaration;
        if (!decl.isCaptured) {
          vars.add(decl.name);
        }
      }
    }
    if (stmt.kind === "ForInStatement") {
      const forInStmt = stmt as IRForInStatement;
      if (forInStmt.left.kind === "VariableDeclaration") {
        const decl = forInStmt.left as IRVariableDeclaration;
        if (!decl.isCaptured) {
          vars.add(decl.name);
        }
      }
    }
  });

  return vars;
}

// ============================================================================
// VarDecl → Assignment transformation
// ============================================================================

/**
 * Заменяет VarDecl на assignments рекурсивно (не входит в функции).
 * Также трансформирует for(var i = ...)/for(var k in ...).
 */
function transformVarDeclsToAssignments(stmts: IRStatement[]): IRStatement[] {
  return mapStatements(stmts, (stmt) => {
    // for(var i = 0; ...) → for(i = 0; ...)
    if (stmt.kind === "ForStatement") {
      const s = stmt as IRForStatement;
      if (s.init && s.init.kind === "VariableDeclaration") {
        const transformed = transformForInit(s);
        if (transformed !== stmt) return transformed;
      }
      return null; // let walker recurse into body
    }

    // for(var k in obj) → for(k in obj)
    if (stmt.kind === "ForInStatement") {
      const s = stmt as IRForInStatement;
      if (s.left.kind === "VariableDeclaration") {
        const transformed = transformForInLeft(s);
        if (transformed !== stmt) return transformed;
      }
      return null; // let walker recurse into body
    }

    // var x = init → x = init; (or __env.x = init;)
    if (stmt.kind === "VariableDeclaration") {
      return transformVarDecl(stmt as IRVariableDeclaration);
    }

    return null; // let walker recurse
  });
}

/**
 * Трансформирует одну VarDecl в assignment(s).
 *
 * - hoistOnly → удаляем (пустой массив)
 * - captured + init → __env.name = init;
 * - captured, no init → __env.name = undefined;
 * - non-captured + init → name = init;
 * - non-captured, no init → name = undefined;
 */
function transformVarDecl(decl: IRVariableDeclaration): StatementResult {
  // hoistOnly — уже обработано collectVarNames, убираем
  if (decl.hoistOnly) return [];

  if (decl.isCaptured) {
    // Captured: __env.name = init/undefined
    const envRef = decl.envRef ?? "__env";
    const value = decl.init ?? IR.id("undefined");
    return IR.envAssign(envRef, decl.name, value, decl.loc);
  }

  // Non-captured: name = init/undefined
  const value = decl.init ?? IR.id("undefined");
  return IR.exprStmt(IR.assign("=", IR.id(decl.name), value), decl.loc);
}

type StatementResult = IRStatement | IRStatement[];

/**
 * for(var i = expr; ...) → for(i = expr; ...)
 * for(var i; ...) → for(i = undefined; ...)
 *
 * Возвращает новый ForStatement с init заменённым на assignment expression.
 * Body рекурсивно трансформируется через mapStatements (вернётся из вызова caller'а).
 */
function transformForInit(s: IRForStatement): IRStatement {
  const decl = s.init as IRVariableDeclaration;
  let newInit: IRExpression;

  if (decl.isCaptured) {
    const envRef = decl.envRef ?? "__env";
    const value = decl.init ?? IR.id("undefined");
    newInit = IR.assign("=", IR.member(IR.id(envRef), IR.id(decl.name), false), value);
  } else {
    const value = decl.init ?? IR.id("undefined");
    newInit = IR.assign("=", IR.id(decl.name), value);
  }

  // Рекурсивно трансформируем body
  const newBody = transformVarDeclsInBody(s.body);

  return IR.for(newInit, s.test, s.update, newBody, s.loc);
}

/**
 * for(var k in obj) → for(k in obj)
 */
function transformForInLeft(s: IRForInStatement): IRStatement {
  const decl = s.left as IRVariableDeclaration;
  const newLeft = IR.id(decl.name) as IRIdentifier;

  // Рекурсивно трансформируем body
  const newBody = transformVarDeclsInBody(s.body);

  return IR.forIn(newLeft, s.right, newBody, s.loc);
}

/**
 * Трансформирует один statement (body цикла) рекурсивно.
 */
function transformVarDeclsInBody(body: IRStatement): IRStatement {
  if (body.kind === "BlockStatement") {
    const newStatements = transformVarDeclsToAssignments(body.body);
    return newStatements === body.body ? body : IR.block(newStatements, body.loc);
  }

  // Одиночный statement
  if (body.kind === "VariableDeclaration") {
    const result = transformVarDecl(body as IRVariableDeclaration);
    if (Array.isArray(result)) {
      return result.length === 0 ? IR.empty() : result.length === 1 ? result[0] : IR.block(result);
    }
    return result;
  }

  // mapStatements works on arrays, wrap & unwrap
  const transformed = transformVarDeclsToAssignments([body]);
  if (transformed.length === 1 && transformed[0] === body) return body;
  if (transformed.length === 1) return transformed[0];
  return IR.block(transformed);
}
