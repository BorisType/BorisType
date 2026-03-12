/**
 * Expression emitters — emitExpression dispatcher and all expression emitters
 *
 * @module emitter/emit-expressions
 */

import type {
  IRExpression,
  IRObjectExpression,
  IREnvAccess,
  IRRuntimeCall,
  IRBinaryExpression,
  IRUnaryExpression,
  IRLogicalExpression,
  IRConditionalExpression,
  IRAssignmentExpression,
  IRUpdateExpression,
  IRArrayExpression,
} from "../ir/index.ts";
import type { EmitContext } from "./emit-helpers.ts";
import { getIndent, increaseIndent } from "./emit-helpers.ts";
import { emitPolyfillCall } from "./emit-polyfills.ts";

/**
 * Генерирует код выражения
 */
export function emitExpression(expr: IRExpression, ctx: EmitContext): string {
  switch (expr.kind) {
    case "Identifier":
      return expr.name;

    case "Literal":
      return expr.raw;

    case "BinaryExpression":
      return emitBinary(expr, ctx);

    case "UnaryExpression":
      return emitUnary(expr, ctx);

    case "ConditionalExpression":
      return emitConditional(expr, ctx);

    case "LogicalExpression":
      return emitLogical(expr, ctx);

    case "CallExpression":
      return emitCall(expr, ctx);

    case "MemberExpression":
      return emitMember(expr, ctx);

    case "ArrayExpression":
      return emitArray(expr, ctx);

    case "ObjectExpression":
      return emitObjectExpression(expr, ctx);

    case "AssignmentExpression":
      return emitAssignment(expr, ctx);

    case "UpdateExpression":
      return emitUpdate(expr, ctx);

    case "SequenceExpression":
      return `(${expr.expressions.map((e) => emitExpression(e, ctx)).join(", ")})`;

    case "ArgsAccess":
      return expr.originalName;

    case "EnvAccess":
      return emitEnvAccess(expr);

    case "PolyfillCall":
      return emitPolyfillCall(expr, ctx);

    case "RuntimeCall":
      return emitRuntimeCall(expr, ctx);

    case "BTGetProperty":
      return emitBTGetProperty(expr, ctx);

    case "BTSetProperty":
      return emitBTSetProperty(expr, ctx);

    case "BTCallFunction":
      return emitBTCallFunction(expr, ctx);

    case "BTIsFunction":
      return emitBTIsFunction(expr, ctx);

    case "BTIsTrue":
      return emitBTIsTrue(expr, ctx);

    case "GroupingExpression":
      return `(${emitExpression(expr.expression, ctx)})`;

    default:
      return `/* unknown expression: ${(expr as any).kind} */`;
  }
}

/**
 * Генерирует код binary expression
 */
function emitBinary(expr: IRBinaryExpression, ctx: EmitContext): string {
  const left = emitExpression(expr.left, ctx);
  const right = emitExpression(expr.right, ctx);
  return `${left} ${expr.operator} ${right}`;
}

/**
 * Генерирует код unary expression
 */
function emitUnary(expr: IRUnaryExpression, ctx: EmitContext): string {
  const arg = emitExpression(expr.argument, ctx);

  if (expr.prefix) {
    // typeof, void, delete нужен пробел
    if (expr.operator === "typeof" || expr.operator === "void" || expr.operator === "delete") {
      return `${expr.operator} ${arg}`;
    }
    return `${expr.operator}${arg}`;
  }

  return `${arg}${expr.operator}`;
}

/**
 * Генерирует код conditional expression
 */
function emitConditional(expr: IRConditionalExpression, ctx: EmitContext): string {
  const test = emitExpression(expr.test, ctx);
  const consequent = emitExpression(expr.consequent, ctx);
  const alternate = emitExpression(expr.alternate, ctx);
  return `${test} ? ${consequent} : ${alternate}`;
}

/**
 * Генерирует код logical expression
 */
function emitLogical(expr: IRLogicalExpression, ctx: EmitContext): string {
  const left = emitExpression(expr.left, ctx);
  const right = emitExpression(expr.right, ctx);
  return `${left} ${expr.operator} ${right}`;
}

/**
 * Генерирует код call expression
 */
function emitCall(expr: import("../ir/index.js").IRCallExpression, ctx: EmitContext): string {
  const callee = emitExpression(expr.callee, ctx);
  const args = expr.arguments.map((a) => emitExpression(a, ctx)).join(", ");
  return `${callee}(${args})`;
}

/**
 * Генерирует код member expression
 */
function emitMember(expr: import("../ir/index.js").IRMemberExpression, ctx: EmitContext): string {
  const object = emitExpression(expr.object, ctx);

  if (expr.computed) {
    return `${object}[${emitExpression(expr.property, ctx)}]`;
  }

  return `${object}.${emitExpression(expr.property, ctx)}`;
}

/**
 * Генерирует код array expression
 */
function emitArray(expr: IRArrayExpression, ctx: EmitContext): string {
  const elements = expr.elements.map((e) => (e ? emitExpression(e, ctx) : "")).join(", ");
  return `[${elements}]`;
}

/**
 * Генерирует код object expression
 */
export function emitObjectExpression(obj: IRObjectExpression, ctx: EmitContext): string {
  if (obj.properties.length === 0) {
    return "{}";
  }

  const innerCtx = increaseIndent(ctx);
  const innerPad = getIndent(innerCtx);
  const pad = getIndent(ctx);

  const lines: string[] = ["{"];

  obj.properties.forEach((prop, i) => {
    const comma = i < obj.properties.length - 1 ? "," : "";
    const value = emitExpression(prop.value, innerCtx);
    // Computed keys use [], non-identifier keys need quotes
    // Все ключи объектных литералов оборачиваем в кавычки для совместимости с BorisScript
    const key = prop.computed ? `[${prop.key}]` : `"${prop.key}"`;
    lines.push(`${innerPad}${key}: ${value}${comma}`);
  });

  lines.push(`${pad}}`);
  return lines.join("\n");
}

/**
 * Генерирует код assignment expression
 */
function emitAssignment(expr: IRAssignmentExpression, ctx: EmitContext): string {
  const left =
    expr.left.kind === "EnvAccess" ? emitEnvAccess(expr.left) : emitExpression(expr.left, ctx);
  const right = emitExpression(expr.right, ctx);
  return `${left} ${expr.operator} ${right}`;
}

/**
 * Генерирует код update expression
 */
function emitUpdate(expr: IRUpdateExpression, ctx: EmitContext): string {
  const arg = emitExpression(expr.argument, ctx);
  return expr.prefix ? `${expr.operator}${arg}` : `${arg}${expr.operator}`;
}

/**
 * Генерирует код env access
 */
export function emitEnvAccess(access: IREnvAccess): string {
  let result = "__env";
  for (let i = 0; i < access.depth; i++) {
    result += ".__parent";
  }
  return `${result}.${access.key}`;
}

/**
 * Генерирует код runtime call
 */
function emitRuntimeCall(call: IRRuntimeCall, ctx: EmitContext): string {
  const args = call.arguments.map((a) => emitExpression(a, ctx)).join(", ");
  return `bt.${call.namespace}.${call.method}(${args})`;
}

/**
 * Генерирует код bt.getProperty(obj, prop)
 */
function emitBTGetProperty(
  expr: import("../ir/index.js").IRBTGetProperty,
  ctx: EmitContext,
): string {
  const obj = emitExpression(expr.object, ctx);
  const prop = emitExpression(expr.property, ctx);
  return `bt.getProperty(${obj}, ${prop})`;
}

/**
 * Генерирует код bt.setProperty(obj, prop, value)
 */
function emitBTSetProperty(
  expr: import("../ir/index.js").IRBTSetProperty,
  ctx: EmitContext,
): string {
  const obj = emitExpression(expr.object, ctx);
  const prop = emitExpression(expr.property, ctx);
  const value = emitExpression(expr.value, ctx);
  return `bt.setProperty(${obj}, ${prop}, ${value})`;
}

/**
 * Генерирует код bt.callFunction(func, [args])
 */
function emitBTCallFunction(
  expr: import("../ir/index.js").IRBTCallFunction,
  ctx: EmitContext,
): string {
  const callee = emitExpression(expr.callee, ctx);
  const args = expr.arguments.map((a) => emitExpression(a, ctx)).join(", ");
  return `bt.callFunction(${callee}, [${args}])`;
}

/**
 * Генерирует код bt.isFunction(value)
 */
function emitBTIsFunction(expr: import("../ir/index.js").IRBTIsFunction, ctx: EmitContext): string {
  const value = emitExpression(expr.value, ctx);
  return `bt.isFunction(${value})`;
}

/**
 * Генерирует код bt.isTrue(value)
 */
function emitBTIsTrue(expr: import("../ir/index.js").IRBTIsTrue, ctx: EmitContext): string {
  const value = emitExpression(expr.value, ctx);
  return `bt.isTrue(${value})`;
}
