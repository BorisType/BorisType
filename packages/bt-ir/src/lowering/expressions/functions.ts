/**
 * Function Expression Visitors — обработка arrow functions и function expressions
 *
 * Содержит:
 * - visitArrowFunction
 * - visitFunctionExpression
 *
 * @module lowering/expressions/functions
 */

import * as ts from "typescript";
import { IR, type IRStatement, type IRExpression } from "../../ir/index.ts";
import type { VisitorContext } from "../visitor.ts";
import { visitStatementList } from "../statements.ts";
import { getModuleEnvDepth } from "../env-resolution.ts";
import { getLoc, collectCapturedVarsForArrow } from "../helpers.ts";
import { buildFunction, getEnvFunctionRef } from "../function-builder.ts";
import {
  resolvePerCallEnv,
  buildPerCallEnvStatements,
  extractFunctionParams,
  createInnerFunctionContext,
  applyHoisting,
} from "../function-helpers.ts";
import { visitBareArrowFunction, visitBareFunctionExpression } from "../bare-visitors.ts";
import { visitExpression } from "./dispatch.ts";

// ============================================================================
// Arrow functions
// ============================================================================

/**
 * Обрабатывает arrow function
 *
 * Использует buildFunction для генерации env/desc паттерна
 * Возвращает: __env.__arrowN
 */
export function visitArrowFunction(node: ts.ArrowFunction, ctx: VisitorContext): IRExpression {
  // Without env/desc: plain function
  if (!ctx.config.useEnvDescPattern) return visitBareArrowFunction(node, ctx);

  const funcScope = ctx.scopeAnalysis.nodeToScope.get(node) || ctx.currentScope;
  const capturedVars = collectCapturedVarsForArrow(funcScope, ctx);
  const perCallEnv = resolvePerCallEnv(funcScope, ctx);

  const fnCtx = createInnerFunctionContext({ funcScope, ctx, perCallEnv, capturedVars });
  const params = extractFunctionParams(node.parameters, funcScope, fnCtx, perCallEnv.needed);

  // Тело
  let body: IRStatement[];
  if (ts.isBlock(node.body)) {
    body = visitStatementList(node.body.statements, fnCtx);
  } else {
    // Expression body: x => x + 1 → function() { return x + 1; }
    body = [IR.return(visitExpression(node.body, fnCtx))];
  }

  if (fnCtx.pendingStatements.length > 0) {
    body.unshift(...fnCtx.pendingStatements);
  }

  // Prepend per-call env
  if (perCallEnv.needed && perCallEnv.envName) {
    body.unshift(...buildPerCallEnvStatements(perCallEnv.envName, node.parameters, funcScope));
  }

  const result = buildFunction({
    namePrefix: "arrow",
    params,
    body,
    capturedVars,
    bindings: ctx.bindings,
    loc: getLoc(node, ctx),
    effectiveEnvRef: ctx.currentEnvRef,
    useRefFormat: ctx.config.useRefFormat,
    registrationEnvRef: ctx.currentEnvRef,
    codelibraryDepth: getModuleEnvDepth(ctx),
  });

  applyHoisting(result, ctx);
  return getEnvFunctionRef(result.name, getLoc(node, ctx), ctx.currentEnvRef);
}

// ============================================================================
// Function expressions
// ============================================================================

/**
 * Обрабатывает function expression
 */
export function visitFunctionExpression(node: ts.FunctionExpression, ctx: VisitorContext): IRExpression {
  // Without env/desc: plain function
  if (!ctx.config.useEnvDescPattern) return visitBareFunctionExpression(node, ctx);

  const originalName = node.name?.text ?? ctx.bindings.create("func");
  const isNestedInModule = ctx.config.moduleExports && ctx.currentScope.type !== "module";
  const name = isNestedInModule ? ctx.bindings.hoistedName(originalName) : originalName;

  const funcScope = ctx.scopeAnalysis.nodeToScope.get(node) || ctx.currentScope;
  const capturedVars = collectCapturedVarsForArrow(funcScope, ctx);
  const perCallEnv = resolvePerCallEnv(funcScope, ctx);

  const fnCtx = createInnerFunctionContext({ funcScope, ctx, perCallEnv, capturedVars });
  const params = extractFunctionParams(node.parameters, funcScope, fnCtx, perCallEnv.needed);

  // Тело
  let body = node.body ? visitStatementList(node.body.statements, fnCtx) : [];
  if (fnCtx.pendingStatements.length > 0) {
    body = [...fnCtx.pendingStatements, ...body];
  }

  // Prepend per-call env
  if (perCallEnv.needed && perCallEnv.envName) {
    body = [...buildPerCallEnvStatements(perCallEnv.envName, node.parameters, funcScope), ...body];
  }

  const result = buildFunction({
    name,
    params,
    body,
    capturedVars,
    bindings: ctx.bindings,
    loc: getLoc(node, ctx),
    effectiveEnvRef: ctx.currentEnvRef,
    useRefFormat: ctx.config.useRefFormat,
    registrationEnvRef: ctx.currentEnvRef,
    codelibraryDepth: getModuleEnvDepth(ctx),
  });

  applyHoisting(result, ctx);
  return getEnvFunctionRef(result.name, getLoc(node, ctx), ctx.currentEnvRef);
}
