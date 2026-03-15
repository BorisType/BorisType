/**
 * Try-Finally Desugar Pass
 *
 * BorisScript не поддерживает корректную семантику finally.
 * Этот pass десахаризирует try-catch-finally через state machine:
 *
 * - `return` в try/catch → sentinel throw (`__fType = 1; throw __fVal;`)
 * - finally body инлайнится после try-catch
 * - dispatch: `if (__fType === 1) return __fVal; if (__fType === 2) throw __fVal;`
 *
 * Типы завершения:
 * - 0 = normal
 * - 1 = return (sentinel)
 * - 2 = throw (реальная ошибка)
 *
 * @module passes/try-finally-desugar
 */

import {
  IR,
  type IRProgram,
  type IRStatement,
  type IRIdentifier,
  type IRBlockStatement,
  type IRTryStatement,
  type IRReturnStatement,
  type IRIfStatement,
} from "../ir/index.ts";
import type { IRPass } from "./types.ts";
import { mapStatements } from "./walker.ts";

/**
 * Try-finally desugar pass.
 *
 * Должен выполняться ДО hoist pass, чтобы сгенерированные
 * `var __fType`, `var __fVal` были обработаны hoisting'ом.
 */
export const tryFinallyDesugarPass: IRPass = {
  name: "try-finally-desugar",
  run(program: IRProgram): IRProgram {
    const gen = new NameGen();
    const newBody = desugarInStatements(program.body, gen);
    return newBody === program.body
      ? program
      : IR.program(newBody, program.sourceFile, program.noHoist);
  },
};

// ============================================================================
// Name generator
// ============================================================================

/**
 * Простой генератор уникальных имён для try-finally desugaring.
 *
 * Использует те же префиксы что и BindingManager из lowering:
 * `__fType`, `__fVal`, `__fc` — с инкрементальным счётчиком.
 */
class NameGen {
  private counters = new Map<string, number>();

  create(prefix: string): string {
    const count = this.counters.get(prefix) ?? 0;
    this.counters.set(prefix, count + 1);
    return `__${prefix}${count}`;
  }
}

// ============================================================================
// Main tree walking
// ============================================================================

/**
 * Рекурсивно обходит statements, десахаризируя try-finally.
 * Заходит внутрь функций (у каждой свой scope для return).
 */
function desugarInStatements(stmts: IRStatement[], gen: NameGen): IRStatement[] {
  return mapStatements(
    stmts,
    (stmt) => {
      if (stmt.kind === "TryStatement") {
        const tryStmt = stmt as IRTryStatement;
        if (tryStmt.finalizer) {
          return desugarTryFinally(tryStmt, gen);
        }
      }
      return null; // recurse into children
    },
    { enterFunctions: true },
  );
}

// ============================================================================
// Try-finally desugaring
// ============================================================================

/**
 * Десахаризация одного try-catch-finally statement.
 *
 * Генерирует state machine:
 * ```
 * var __fType = 0;
 * var __fVal;
 * try { T' } catch (__fc) { ... }
 * F  // finally body (инлайн)
 * if (__fType === 1) return __fVal;
 * if (__fType === 2) throw __fVal;
 * ```
 */
function desugarTryFinally(tryStmt: IRTryStatement, gen: NameGen): IRStatement[] {
  // Детектируем break/continue внутри try body — не поддерживается desugaring'ом
  detectBreakContinueInTry(tryStmt);

  const loc = tryStmt.loc;
  const fType = gen.create("fType");
  const fVal = gen.create("fVal");
  const fc = gen.create("fc");

  const result: IRStatement[] = [];

  // var __fType = 0;
  result.push(IR.varDecl(fType, IR.number(0)));
  // var __fVal;
  result.push(IR.varDecl(fVal, null));

  // Сначала рекурсивно десахаризируем вложенные try-finally в try block,
  // чтобы их dispatch return'ы были видны для transformReturns ниже
  const desugaredTryBlock = desugarInBlock(tryStmt.block, gen);

  // Трансформируем try block: return → sentinel throw
  const tryBlock = transformReturnsInBlock(desugaredTryBlock, fType, fVal);

  // Statements для outer catch: __fType = 2; __fVal = __fc;
  const setThrowState: IRStatement[] = [
    IR.exprStmt(IR.assign("=", IR.id(fType) as IRIdentifier, IR.number(2))),
    IR.exprStmt(IR.assign("=", IR.id(fVal) as IRIdentifier, IR.id(fc))),
  ];

  let outerCatchBody: IRStatement[];

  if (tryStmt.handler) {
    // === try-catch-finally ===
    const userParam = tryStmt.handler.param;

    // Сначала рекурсивно десахаризируем, затем трансформируем returns
    const desugaredUserCatch = desugarInBlock(tryStmt.handler.body, gen);

    // Трансформируем return в user catch body
    const userCatchBlock = transformReturnsInBlock(desugaredUserCatch, fType, fVal);

    // Тело внутреннего try
    const innerTryBody: IRStatement[] = [];
    if (userParam) {
      innerTryBody.push(IR.varDecl(userParam, IR.id(fc)));
    }
    // Сбрасываем state
    innerTryBody.push(IR.exprStmt(IR.assign("=", IR.id(fType) as IRIdentifier, IR.number(0))));
    innerTryBody.push(IR.exprStmt(IR.assign("=", IR.id(fVal) as IRIdentifier, IR.id("undefined"))));
    innerTryBody.push(...userCatchBlock.body);

    // Внутренний catch
    const fc2 = gen.create("fc");
    const innerCatchBody: IRStatement[] = [
      IR.if(
        IR.binary("!==", IR.id(fType), IR.number(1)),
        IR.block([
          IR.exprStmt(IR.assign("=", IR.id(fType) as IRIdentifier, IR.number(2))),
          IR.exprStmt(IR.assign("=", IR.id(fVal) as IRIdentifier, IR.id(fc2))),
        ]),
      ),
    ];

    // Outer catch body
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
    // === try-finally (без catch) ===
    outerCatchBody = [IR.if(IR.binary("!==", IR.id(fType), IR.number(1)), IR.block(setThrowState))];
  }

  // Основной try-catch (без finally)
  result.push(IR.try(tryBlock, IR.catch(fc, IR.block(outerCatchBody)), null, loc));

  // Finally body — инлайним (return в finally = обычный return)
  // Рекурсивно десахаризируем вложенные try-finally в finally
  const desugaredFinally = desugarInBlock(tryStmt.finalizer!, gen);
  result.push(...desugaredFinally.body);

  // Dispatch
  result.push(
    IR.if(IR.binary("===", IR.id(fType), IR.number(1)), IR.block([IR.return(IR.id(fVal))])),
  );
  result.push(
    IR.if(IR.binary("===", IR.id(fType), IR.number(2)), IR.block([IR.throw(IR.id(fVal))])),
  );

  return result;
}

// ============================================================================
// Return → sentinel transformation
// ============================================================================

/**
 * Заменяет `return expr` → `__fType = 1; __fVal = expr; throw __fVal;`
 * в блоке. Не заходит в FunctionDeclaration (отдельный scope).
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
 * Заменяет return на sentinel в списке statements.
 * Использует mapStatements для рекурсивного обхода.
 */
function transformReturnsInList(stmts: IRStatement[], fType: string, fVal: string): IRStatement[] {
  return mapStatements(
    stmts,
    (stmt) => {
      if (stmt.kind === "ReturnStatement") {
        return buildSentinelSequence(stmt as IRReturnStatement, fType, fVal);
      }
      return null; // recurse into children
    },
    { enterFunctions: false },
  );
}

/**
 * Строит sentinel-последовательность для замены return:
 * `__fType = 1; __fVal = expr; throw __fVal;`
 */
function buildSentinelSequence(ret: IRReturnStatement, fType: string, fVal: string): IRStatement[] {
  const result: IRStatement[] = [
    IR.exprStmt(IR.assign("=", IR.id(fType) as IRIdentifier, IR.number(1))),
  ];
  if (ret.argument) {
    result.push(IR.exprStmt(IR.assign("=", IR.id(fVal) as IRIdentifier, ret.argument)));
  }
  result.push(IR.throw(IR.id(fVal)));
  return result;
}

// ============================================================================
// break/continue detection
// ============================================================================

/**
 * Детектирует break/continue внутри try/catch блоков при наличии finally.
 *
 * BorisScript try-finally desugaring не поддерживает break/continue —
 * dispatch state machine обрабатывает только return и throw.
 * При обнаружении — бросает ошибку (ловится error boundary в pipeline).
 *
 * Не заходит внутрь:
 * - Вложенных функций (у них свой scope)
 * - Циклов и switch (break/continue внутри них — валидны, таргетят цикл/switch)
 *
 * Не проверяет finally block (break/continue в finally = обычные statements).
 */
function detectBreakContinueInTry(tryStmt: IRTryStatement): void {
  const blocksToCheck: IRStatement[][] = [tryStmt.block.body];
  if (tryStmt.handler) {
    blocksToCheck.push(tryStmt.handler.body.body);
  }

  for (const stmts of blocksToCheck) {
    checkBreakContinueInStatements(stmts);
  }
}

/**
 * Рекурсивно проверяет statements на break/continue,
 * не заходя в функции, циклы и switch.
 */
function checkBreakContinueInStatements(stmts: IRStatement[]): void {
  for (const stmt of stmts) {
    if (stmt.kind === "BreakStatement") {
      throw new Error(
        "break inside try-finally is not supported (try-finally desugaring cannot preserve break semantics)",
      );
    }
    if (stmt.kind === "ContinueStatement") {
      throw new Error(
        "continue inside try-finally is not supported (try-finally desugaring cannot preserve continue semantics)",
      );
    }

    // Не заходим внутрь функций — свой scope
    if (stmt.kind === "FunctionDeclaration") continue;
    // Не заходим внутрь циклов/switch — break/continue внутри них валидны
    if (
      stmt.kind === "ForStatement" ||
      stmt.kind === "ForInStatement" ||
      stmt.kind === "WhileStatement" ||
      stmt.kind === "DoWhileStatement" ||
      stmt.kind === "SwitchStatement"
    )
      continue;

    // Заходим внутрь составных statements
    if (stmt.kind === "BlockStatement") {
      checkBreakContinueInStatements((stmt as IRBlockStatement).body);
    } else if (stmt.kind === "IfStatement") {
      const ifStmt = stmt as IRIfStatement;
      if (ifStmt.consequent.kind === "BlockStatement") {
        checkBreakContinueInStatements((ifStmt.consequent as IRBlockStatement).body);
      }
      if (ifStmt.alternate) {
        if (ifStmt.alternate.kind === "BlockStatement") {
          checkBreakContinueInStatements((ifStmt.alternate as IRBlockStatement).body);
        } else {
          checkBreakContinueInStatements([ifStmt.alternate]);
        }
      }
    } else if (stmt.kind === "TryStatement") {
      const tryInner = stmt as IRTryStatement;
      checkBreakContinueInStatements(tryInner.block.body);
      if (tryInner.handler) {
        checkBreakContinueInStatements(tryInner.handler.body.body);
      }
      if (tryInner.finalizer) {
        checkBreakContinueInStatements(tryInner.finalizer.body);
      }
    }
  }
}

// ============================================================================
// Recursive desugaring in blocks
// ============================================================================

/**
 * Рекурсивно десахаризирует вложенные try-finally внутри блока.
 */
function desugarInBlock(block: IRBlockStatement, gen: NameGen): IRBlockStatement {
  const newBody = desugarInStatements(block.body, gen);
  return newBody === block.body ? block : IR.block(newBody, block.loc);
}
