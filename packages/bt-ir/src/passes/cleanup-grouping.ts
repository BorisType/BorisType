/**
 * Cleanup Grouping Pass — удаление вредных GroupingExpression
 *
 * BS парсер ломается на конструкциях вроде `(a).toString()` — скобки вокруг
 * простых атомарных выражений не нужны и могут вызвать syntax error.
 *
 * Этот pass удаляет GroupingExpression вокруг выражений, которые НИКОГДА
 * не нуждаются в скобках (Identifier, Literal, MemberExpression и т.д.).
 *
 * Safety net после parenthesize и других passes, которые могут добавить
 * избыточные GroupingExpression.
 *
 * @module passes/cleanup-grouping
 */

import { IR, type IRProgram, type IRExpression, type IRGroupingExpression } from "../ir/index.ts";
import type { IRPass, PassContext } from "./types.ts";
import { mapExpression, mapStatements, type MapStatementsOptions } from "./walker.ts";

// ============================================================================
// Safe-to-unwrap expression kinds
// ============================================================================

/**
 * Expression kinds that are always "atomic" — never need GroupingExpression.
 *
 * Скобки вокруг этих выражений не несут семантической нагрузки
 * и могут вызывать BS parser errors (например `(a).toString()`).
 */
const SAFE_TO_UNWRAP = new Set([
  "Identifier",
  "Literal",
  "MemberExpression",
  "CallExpression",
  "GroupingExpression",
  "ArgsAccess",
  "EnvAccess",
  "BTCallFunction",
  "BTGetProperty",
  "UpdateExpression",
  "ArrayExpression",
  "ObjectExpression",
]);

// ============================================================================
// Expression mapper
// ============================================================================

/**
 * Unwrap GroupingExpression вокруг safe-to-unwrap выражений.
 *
 * Рекурсивно обходит expression tree. Для каждого GroupingExpression
 * проверяет inner expression — если оно атомарное, убирает обёртку.
 */
function cleanupExpr(expr: IRExpression): IRExpression {
  return mapExpression(expr, (e) => {
    if (e.kind !== "GroupingExpression") return null;

    const grouping = e as IRGroupingExpression;
    const inner = cleanupExpr(grouping.expression);

    if (SAFE_TO_UNWRAP.has(inner.kind)) {
      return inner;
    }

    // Inner changed but still needs grouping
    if (inner !== grouping.expression) {
      return IR.grouping(inner, grouping.loc);
    }

    return null;
  });
}

// ============================================================================
// Statement-level integration via walker
// ============================================================================

/** Options: enter functions (each function has its own scope but still needs cleanup) */
const WALK_OPTIONS: MapStatementsOptions = { enterFunctions: true };

// ============================================================================
// Pass definition
// ============================================================================

/**
 * Cleanup Grouping pass — removes harmful GroupingExpression around atomic expressions.
 *
 * Должен выполняться после parenthesize (и после comma-safety / literal-extract
 * когда они будут добавлены) — как последний pass перед hoist.
 */
export const cleanupGroupingPass: IRPass = {
  name: "cleanup-grouping",
  dependsOn: ["literal-extract"],
  run(program: IRProgram, _ctx: PassContext): IRProgram {
    const newBody = mapStatements(
      program.body,
      (stmt) => {
        switch (stmt.kind) {
          case "ExpressionStatement": {
            const e = cleanupExpr(stmt.expression);
            return e === stmt.expression ? null : IR.exprStmt(e, stmt.loc);
          }

          case "VariableDeclaration": {
            if (!stmt.init) return null;
            const e = cleanupExpr(stmt.init);
            return e === stmt.init
              ? null
              : IR.varDecl(stmt.name, e, stmt.loc, stmt.isCaptured, stmt.envRef, stmt.hoistOnly);
          }

          case "ReturnStatement": {
            if (!stmt.argument) return null;
            const e = cleanupExpr(stmt.argument);
            return e === stmt.argument ? null : IR.return(e, stmt.loc);
          }

          case "ThrowStatement": {
            const e = cleanupExpr(stmt.argument);
            return e === stmt.argument ? null : IR.throw(e, stmt.loc);
          }

          case "IfStatement": {
            const newTest = cleanupExpr(stmt.test);
            return newTest === stmt.test
              ? null
              : IR.if(newTest, stmt.consequent, stmt.alternate, stmt.loc);
          }

          case "WhileStatement": {
            const newTest = cleanupExpr(stmt.test);
            return newTest === stmt.test ? null : IR.while(newTest, stmt.body, stmt.loc);
          }

          case "DoWhileStatement": {
            const newTest = cleanupExpr(stmt.test);
            return newTest === stmt.test ? null : IR.doWhile(stmt.body, newTest, stmt.loc);
          }

          case "ForStatement": {
            let newInit = stmt.init;
            if (stmt.init) {
              if (stmt.init.kind === "VariableDeclaration") {
                if (stmt.init.init) {
                  const e = cleanupExpr(stmt.init.init);
                  if (e !== stmt.init.init) {
                    newInit = IR.varDecl(
                      stmt.init.name,
                      e,
                      stmt.init.loc,
                      stmt.init.isCaptured,
                      stmt.init.envRef,
                      stmt.init.hoistOnly,
                    );
                  }
                }
              } else {
                const e = cleanupExpr(stmt.init as IRExpression);
                if (e !== stmt.init) newInit = e;
              }
            }
            const newTest = stmt.test ? cleanupExpr(stmt.test) : stmt.test;
            const newUpdate = stmt.update ? cleanupExpr(stmt.update) : stmt.update;
            if (newInit === stmt.init && newTest === stmt.test && newUpdate === stmt.update) {
              return null;
            }
            return IR.for(newInit, newTest, newUpdate, stmt.body, stmt.loc);
          }

          case "ForInStatement": {
            const newRight = cleanupExpr(stmt.right);
            return newRight === stmt.right
              ? null
              : IR.forIn(stmt.left, newRight, stmt.body, stmt.loc);
          }

          case "SwitchStatement": {
            const newDisc = cleanupExpr(stmt.discriminant);
            return newDisc === stmt.discriminant ? null : IR.switch(newDisc, stmt.cases, stmt.loc);
          }

          case "EnvAssign": {
            const e = cleanupExpr(stmt.value);
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
