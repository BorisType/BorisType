/**
 * Comma Safety Pass — защита comma-separated контекстов для BS парсера
 *
 * BS парсер некорректно обрабатывает сложные выражения в comma-separated
 * контекстах (аргументы вызовов, элементы массивов, значения объектов).
 * Любое не-атомарное выражение в списке через запятую (при >1 элементе)
 * может вызвать ошибку парсинга.
 *
 * Оборачивает не-атомарные выражения в GroupingExpression в таких контекстах.
 * Одиночные элементы не оборачиваются — BS обрабатывает их корректно.
 *
 * @module passes/comma-safety
 */

import {
  IR,
  type IRProgram,
  type IRExpression,
  type IRCallExpression,
  type IRArrayExpression,
  type IRObjectExpression,
  type IRPolyfillCall,
  type IRRuntimeCall,
  type IRBTCallFunction,
} from "../ir/index.ts";
import type { IRPass, PassContext } from "./types.ts";
import { mapExpression, mapStatements, type MapStatementsOptions } from "./walker.ts";

// ============================================================================
// Atomicity check
// ============================================================================

/**
 * Expression kinds that are "atomic" — safe in comma-separated contexts.
 *
 * Atomic expressions don't confuse the BS parser when appearing between commas.
 * Non-atomic expressions (binary, logical, conditional, assignment, unary, sequence)
 * need wrapping in GroupingExpression.
 */
const ATOMIC_KINDS = new Set([
  "Identifier",
  "Literal",
  "CallExpression",
  "MemberExpression",
  "GroupingExpression",
  "ArgsAccess",
  "EnvAccess",
  "BTCallFunction",
  "BTGetProperty",
  "BTSetProperty",
  "BTIsTrue",
  "BTIsFunction",
  "ArrayExpression",
  "ObjectExpression",
  "UpdateExpression",
  "PolyfillCall",
  "RuntimeCall",
]);

/**
 * Проверяет, является ли выражение атомарным (безопасным в comma-separated контексте).
 */
function isAtomic(expr: IRExpression): boolean {
  return ATOMIC_KINDS.has(expr.kind);
}

/**
 * Оборачивает выражение в GroupingExpression если оно не атомарное.
 */
function wrapIfNeeded(expr: IRExpression): IRExpression {
  if (isAtomic(expr)) return expr;
  return IR.grouping(expr, expr.loc);
}

// ============================================================================
// List wrapping
// ============================================================================

/**
 * Оборачивает не-атомарные выражения в списке, если элементов больше одного.
 * Возвращает оригинальный массив если ничего не изменилось.
 */
function wrapList(items: IRExpression[]): IRExpression[] {
  if (items.length <= 1) return items;

  let changed = false;
  const result = items.map((item) => {
    const wrapped = wrapIfNeeded(item);
    if (wrapped !== item) changed = true;
    return wrapped;
  });

  return changed ? result : items;
}

/**
 * Оборачивает не-атомарные выражения в списке, допускающем null (ArrayExpression).
 * Возвращает оригинальный массив если ничего не изменилось.
 */
function wrapNullableList(items: (IRExpression | null)[]): (IRExpression | null)[] {
  if (items.length <= 1) return items;

  let changed = false;
  const result = items.map((item) => {
    if (item === null) return null;
    const wrapped = wrapIfNeeded(item);
    if (wrapped !== item) changed = true;
    return wrapped;
  });

  return changed ? result : items;
}

// ============================================================================
// Expression mapper
// ============================================================================

/**
 * Обрабатывает expression: рекурсивно обходит дерево, оборачивая
 * не-атомарные выражения в comma-separated контекстах.
 */
function commaSafeExpr(expr: IRExpression): IRExpression {
  return mapExpression(expr, (e) => {
    switch (e.kind) {
      case "CallExpression": {
        const call = e as IRCallExpression;
        const newCallee = commaSafeExpr(call.callee);
        const newArgs = wrapList(call.arguments.map((a) => commaSafeExpr(a)));
        if (newCallee === call.callee && newArgs === call.arguments) return null;
        return IR.call(newCallee, newArgs, call.loc);
      }

      case "BTCallFunction": {
        const call = e as IRBTCallFunction;
        const newCallee = commaSafeExpr(call.callee);
        const newArgs = wrapList(call.arguments.map((a) => commaSafeExpr(a)));
        if (newCallee === call.callee && newArgs === call.arguments) return null;
        return IR.btCallFunction(newCallee, newArgs, call.loc);
      }

      case "PolyfillCall": {
        const call = e as IRPolyfillCall;
        const newTarget = commaSafeExpr(call.target);
        const newArgs = wrapList(call.arguments.map((a) => commaSafeExpr(a)));
        if (newTarget === call.target && newArgs === call.arguments) return null;
        return IR.polyfillCall(call.polyfillType, call.method, newTarget, newArgs, call.loc);
      }

      case "RuntimeCall": {
        const call = e as IRRuntimeCall;
        const newArgs = wrapList(call.arguments.map((a) => commaSafeExpr(a)));
        if (newArgs === call.arguments) return null;
        return IR.runtimeCall(call.namespace, call.method, newArgs, call.loc);
      }

      case "ArrayExpression": {
        const arr = e as IRArrayExpression;
        const mapped = arr.elements.map((el) => (el === null ? null : commaSafeExpr(el)));
        const newElements = wrapNullableList(mapped);
        if (newElements === arr.elements) return null;
        return IR.array(newElements, arr.loc);
      }

      case "ObjectExpression": {
        const obj = e as IRObjectExpression;
        if (obj.properties.length <= 1) return null;

        let changed = false;
        const newProps = obj.properties.map((p) => {
          const newValue = commaSafeExpr(p.value);
          const wrapped = wrapIfNeeded(newValue);
          if (wrapped !== p.value) changed = true;
          return wrapped === p.value ? p : IR.prop(p.key, wrapped, p.computed);
        });

        return changed ? IR.object(newProps, obj.loc) : null;
      }

      default:
        return null; // mapExpression handles recursion for other kinds
    }
  });
}

// ============================================================================
// Statement-level integration via walker
// ============================================================================

/** Options: enter functions to process comma-separated contexts inside them */
const WALK_OPTIONS: MapStatementsOptions = { enterFunctions: true };

// ============================================================================
// Pass definition
// ============================================================================

/**
 * Comma Safety pass — wraps non-atomic expressions in comma-separated contexts.
 *
 * Должен выполняться после parenthesize (который добавляет скобки для приоритетов)
 * и перед cleanup-grouping (который удаляет ненужные скобки вокруг атомов).
 */
export const commaSafetyPass: IRPass = {
  name: "comma-safety",
  dependsOn: ["parenthesize"],
  run(program: IRProgram, _ctx: PassContext): IRProgram {
    const newBody = mapStatements(
      program.body,
      (stmt) => {
        switch (stmt.kind) {
          case "ExpressionStatement": {
            const e = commaSafeExpr(stmt.expression);
            return e === stmt.expression ? null : IR.exprStmt(e, stmt.loc);
          }

          case "VariableDeclaration": {
            if (!stmt.init) return null;
            const e = commaSafeExpr(stmt.init);
            return e === stmt.init ? null : IR.varDecl(stmt.name, e, stmt.loc, stmt.isCaptured, stmt.envRef, stmt.hoistOnly);
          }

          case "ReturnStatement": {
            if (!stmt.argument) return null;
            const e = commaSafeExpr(stmt.argument);
            return e === stmt.argument ? null : IR.return(e, stmt.loc);
          }

          case "ThrowStatement": {
            const e = commaSafeExpr(stmt.argument);
            return e === stmt.argument ? null : IR.throw(e, stmt.loc);
          }

          case "IfStatement": {
            const newTest = commaSafeExpr(stmt.test);
            return newTest === stmt.test ? null : IR.if(newTest, stmt.consequent, stmt.alternate, stmt.loc);
          }

          case "WhileStatement": {
            const newTest = commaSafeExpr(stmt.test);
            return newTest === stmt.test ? null : IR.while(newTest, stmt.body, stmt.loc);
          }

          case "DoWhileStatement": {
            const newTest = commaSafeExpr(stmt.test);
            return newTest === stmt.test ? null : IR.doWhile(stmt.body, newTest, stmt.loc);
          }

          case "ForStatement": {
            let newInit = stmt.init;
            if (stmt.init) {
              if (stmt.init.kind === "VariableDeclaration") {
                if (stmt.init.init) {
                  const e = commaSafeExpr(stmt.init.init);
                  if (e !== stmt.init.init) {
                    newInit = IR.varDecl(stmt.init.name, e, stmt.init.loc, stmt.init.isCaptured, stmt.init.envRef, stmt.init.hoistOnly);
                  }
                }
              } else {
                const e = commaSafeExpr(stmt.init as IRExpression);
                if (e !== stmt.init) newInit = e;
              }
            }
            const newTest = stmt.test ? commaSafeExpr(stmt.test) : stmt.test;
            const newUpdate = stmt.update ? commaSafeExpr(stmt.update) : stmt.update;
            if (newInit === stmt.init && newTest === stmt.test && newUpdate === stmt.update) {
              return null;
            }
            return IR.for(newInit, newTest, newUpdate, stmt.body, stmt.loc);
          }

          case "ForInStatement": {
            const newRight = commaSafeExpr(stmt.right);
            return newRight === stmt.right ? null : IR.forIn(stmt.left, newRight, stmt.body, stmt.loc);
          }

          case "SwitchStatement": {
            const newDisc = commaSafeExpr(stmt.discriminant);
            return newDisc === stmt.discriminant ? null : IR.switch(newDisc, stmt.cases, stmt.loc);
          }

          case "EnvAssign": {
            const e = commaSafeExpr(stmt.value);
            return e === stmt.value ? null : IR.envAssign(stmt.envName, stmt.key, e, stmt.loc);
          }

          default:
            return null;
        }
      },
      WALK_OPTIONS,
    );

    return newBody === program.body ? program : { ...program, body: newBody };
  },
};
