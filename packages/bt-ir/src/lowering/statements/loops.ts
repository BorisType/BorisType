/**
 * Loop visitors — for, for-in, for-of, while, do-while
 *
 * Содержит:
 * - visitForStatement
 * - visitForInStatement
 * - visitForOfStatement
 * - visitWhileStatement
 * - visitDoWhileStatement
 *
 * @module lowering/statements/loops
 */

import * as ts from "typescript";
import { IR, type IRStatement, type IRExpression, type IRIdentifier } from "../../ir/index.ts";
import type { VisitorContext } from "../visitor.ts";
import { visitExpression } from "../expressions.ts";
import { getLoc, resolveVariableInScope } from "../helpers.ts";
import { visitStatementAsBlock } from "./blocks.ts";

/**
 * Обрабатывает for statement
 */
export function visitForStatement(node: ts.ForStatement, ctx: VisitorContext): IRStatement {
  let init: import("../../ir/index.js").IRVariableDeclaration | IRExpression | null = null;

  if (node.initializer) {
    if (ts.isVariableDeclarationList(node.initializer)) {
      const decl = node.initializer.declarations[0];
      if (ts.isIdentifier(decl.name)) {
        init = IR.varDecl(decl.name.text, decl.initializer ? visitExpression(decl.initializer, ctx) : null);
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
  let left: import("../../ir/index.js").IRVariableDeclaration | import("../../ir/index.js").IRIdentifier;

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
  }

  // Визитим тело с block env если нужно
  const loopCtx: VisitorContext =
    useBlockEnv && blockEnvName ? { ...ctx, currentEnvRef: blockEnvName, currentEnvScope: loopBodyScope! } : ctx;
  const body = visitStatementAsBlock(node.statement, loopCtx);

  // Добавляем в начало тела: block env и/или присваивание переменной цикла
  if (useBlockEnv && blockEnvName) {
    body.body.unshift(IR.envDecl(blockEnvName, ctx.currentEnvRef));
    if (isCaptured) {
      body.body.splice(1, 0, IR.exprStmt(IR.assign("=", IR.dot(IR.id(blockEnvName), actualName), IR.id(loopVar))));
    } else {
      body.body.splice(1, 0, IR.varDecl(actualName, IR.id(loopVar)));
    }
  } else if (isCaptured) {
    body.body.unshift(IR.exprStmt(IR.assign("=", IR.dot(IR.id(ctx.currentEnvRef), actualName), IR.id(loopVar))));
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
  return IR.while(visitExpression(node.expression, ctx), visitStatementAsBlock(node.statement, ctx), getLoc(node, ctx));
}

/**
 * Обрабатывает do-while statement
 */
export function visitDoWhileStatement(node: ts.DoStatement, ctx: VisitorContext): IRStatement {
  return IR.doWhile(visitStatementAsBlock(node.statement, ctx), visitExpression(node.expression, ctx), getLoc(node, ctx));
}
