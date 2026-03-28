/**
 * Parenthesize Pass — conservative расстановка скобок для BorisScript
 *
 * BorisScript не всегда корректно обрабатывает приоритеты операторов,
 * поэтому добавляем GroupingExpression вокруг операндов в нужных позициях.
 *
 * Стратегия: conservative — оборачиваем когда precedence различается
 * в любую сторону (не только когда child < parent).
 * При равном precedence: left-associative → wrap left, right-associative → wrap right.
 *
 * @module passes/parenthesize
 */

import {
  IR,
  assertNever,
  type IRProgram,
  type IRExpression,
  type IRStatement,
  type IRBinaryExpression,
  type IRLogicalExpression,
  type IRConditionalExpression,
  type IRAssignmentExpression,
  type IRBTIsTrue,
  type IRBTIsFunction,
  type IRFunctionDeclaration,
  type IRBlockStatement,
  type IRIfStatement,
  type IRForStatement,
  type IRForInStatement,
  type IRWhileStatement,
  type IRDoWhileStatement,
  type IRSwitchStatement,
  type IRTryStatement,
  type IRExpressionStatement,
  type IRReturnStatement,
  type IRThrowStatement,
  type IRVariableDeclaration,
  type IREnvAssign,
} from "../ir/index.ts";
import type { IRPass, PassContext } from "./types.ts";
import { mapExpression } from "./walker.ts";

// ============================================================================
// Precedence table for IR operators (MDN-based, 1–13)
// ============================================================================

/** Precedence levels: higher number = binds tighter */
const PRECEDENCE: Record<string, number> = {
  // Binary operators
  "*": 12,
  "/": 12,
  "%": 12,
  "+": 11,
  "-": 11,
  "<<": 10,
  ">>": 10,
  ">>>": 10,
  "<": 9,
  "<=": 9,
  ">": 9,
  ">=": 9,
  in: 9,
  instanceof: 9,
  "==": 8,
  "!=": 8,
  "===": 8,
  "!==": 8,
  "&": 7,
  "^": 6,
  "|": 5,
  // Logical operators
  "&&": 4,
  "||": 3,
  // Assignment operators (right-associative)
  "=": 2,
  "+=": 2,
  "-=": 2,
  "*=": 2,
  "/=": 2,
  "%=": 2,
  "<<=": 2,
  ">>=": 2,
  ">>>=": 2,
  "&=": 2,
  "|=": 2,
  "^=": 2,
};

/** Assignment operators — right-associative (all others are left-associative) */
const RIGHT_ASSOCIATIVE = new Set(["=", "+=", "-=", "*=", "/=", "%=", "<<=", ">>=", ">>>=", "&=", "|=", "^="]);

/** Conditional (ternary) precedence */
const CONDITIONAL_PREC = 1;

// ============================================================================
// Precedence helpers
// ============================================================================

/**
 * Возвращает precedence для operator-expressions, или null для "атомных"
 * выражений (identifier, literal, call, member и т.д.).
 */
function getOperatorPrecedence(expr: IRExpression): number | null {
  switch (expr.kind) {
    case "BinaryExpression":
      return PRECEDENCE[(expr as IRBinaryExpression).operator] ?? null;
    case "LogicalExpression":
      return PRECEDENCE[(expr as IRLogicalExpression).operator] ?? null;
    case "AssignmentExpression":
      return PRECEDENCE[(expr as IRAssignmentExpression).operator] ?? null;
    case "ConditionalExpression":
      return CONDITIONAL_PREC;
    default:
      return null;
  }
}

/**
 * Проверяет, нужна ли обёртка операнда binary/logical выражения.
 *
 * Conservative: оборачиваем при любом различии precedence.
 * При равном precedence: left-associative → wrap left, right-associative → wrap right.
 */
function shouldWrapOperand(parentOp: string, child: IRExpression, isLeft: boolean): boolean {
  const childPrec = getOperatorPrecedence(child);
  if (childPrec === null) return false;

  const parentPrec = PRECEDENCE[parentOp];
  if (parentPrec === undefined) return false;

  if (childPrec !== parentPrec) return true;

  // Same precedence — check associativity
  if (RIGHT_ASSOCIATIVE.has(parentOp)) return !isLeft;
  return isLeft;
}

/**
 * Проверяет, нужна ли обёртка дочернего выражения внутри conditional (ternary).
 * Оборачиваем только при precedence ≤ 2 (assignment, conditional).
 */
function shouldWrapInConditional(child: IRExpression): boolean {
  const childPrec = getOperatorPrecedence(child);
  if (childPrec === null) return false;
  return childPrec <= 2;
}

// ============================================================================
// Expression parenthesizer
// ============================================================================

/**
 * Рекурсивно обходит expression и добавляет GroupingExpression для
 * операндов, требующих явных скобок.
 */
function processExpr(expr: IRExpression): IRExpression {
  return mapExpression(expr, (e) => {
    switch (e.kind) {
      case "BinaryExpression": {
        const bin = e as IRBinaryExpression;
        let left = processExpr(bin.left);
        let right = processExpr(bin.right);
        if (shouldWrapOperand(bin.operator, left, true)) {
          left = IR.grouping(left, left.loc);
        }
        if (shouldWrapOperand(bin.operator, right, false)) {
          right = IR.grouping(right, right.loc);
        }
        if (left === bin.left && right === bin.right) return e;
        return IR.binary(bin.operator, left, right, bin.loc);
      }

      case "LogicalExpression": {
        const log = e as IRLogicalExpression;
        let left = processExpr(log.left);
        let right = processExpr(log.right);
        if (shouldWrapOperand(log.operator, left, true)) {
          left = IR.grouping(left, left.loc);
        }
        if (shouldWrapOperand(log.operator, right, false)) {
          right = IR.grouping(right, right.loc);
        }
        if (left === log.left && right === log.right) return e;
        return IR.logical(log.operator, left, right, log.loc);
      }

      case "AssignmentExpression": {
        const assign = e as IRAssignmentExpression;
        const newLeft = processExpr(assign.left);
        let right = processExpr(assign.right);
        if (shouldWrapOperand(assign.operator, right, false)) {
          right = IR.grouping(right, right.loc);
        }
        if (newLeft === assign.left && right === assign.right) return e;
        return IR.assign(assign.operator, newLeft as typeof assign.left, right, assign.loc);
      }

      case "ConditionalExpression": {
        const cond = e as IRConditionalExpression;
        let test = processExpr(cond.test);
        let cons = processExpr(cond.consequent);
        let alt = processExpr(cond.alternate);
        if (shouldWrapInConditional(test)) {
          test = IR.grouping(test, test.loc);
        }
        if (shouldWrapInConditional(cons)) {
          cons = IR.grouping(cons, cons.loc);
        }
        if (shouldWrapInConditional(alt)) {
          alt = IR.grouping(alt, alt.loc);
        }
        if (test === cond.test && cons === cond.consequent && alt === cond.alternate) return e;
        return IR.conditional(test, cons, alt, cond.loc);
      }

      case "BTIsTrue": {
        const bt = e as IRBTIsTrue;
        const newVal = processExpr(bt.value);
        const wrapped = newVal.kind === "AssignmentExpression" ? IR.grouping(newVal, newVal.loc) : newVal;
        if (wrapped === bt.value) return e;
        return IR.btIsTrue(wrapped, bt.loc);
      }

      case "BTIsFunction": {
        const bt = e as IRBTIsFunction;
        const newVal = processExpr(bt.value);
        const wrapped = newVal.kind === "AssignmentExpression" ? IR.grouping(newVal, newVal.loc) : newVal;
        if (wrapped === bt.value) return e;
        return IR.btIsFunction(wrapped, bt.loc);
      }

      default:
        return null; // mapExpression handles recursion for other expression kinds
    }
  });
}

// ============================================================================
// Statement traversal (processes expressions inside all statement types)
// ============================================================================

/**
 * Обрабатывает список statements, parenthesizing expressions в каждом.
 */
function processBody(stmts: IRStatement[]): IRStatement[] {
  let changed = false;
  const result: IRStatement[] = [];
  for (const stmt of stmts) {
    const newStmt = processStmt(stmt);
    if (newStmt !== stmt) changed = true;
    result.push(newStmt);
  }
  return changed ? result : stmts;
}

/**
 * Обрабатывает один statement: parenthesizes все expression-slots,
 * рекурсивно заходит в statement children.
 */
function processStmt(stmt: IRStatement): IRStatement {
  switch (stmt.kind) {
    case "ExpressionStatement": {
      const s = stmt as IRExpressionStatement;
      const e = processExpr(s.expression);
      return e === s.expression ? stmt : IR.exprStmt(e, s.loc);
    }

    case "VariableDeclaration": {
      const s = stmt as IRVariableDeclaration;
      if (!s.init) return stmt;
      const e = processExpr(s.init);
      return e === s.init ? stmt : IR.varDecl(s.name, e, s.loc, s.isCaptured, s.envRef, s.hoistOnly);
    }

    case "ReturnStatement": {
      const s = stmt as IRReturnStatement;
      if (!s.argument) return stmt;
      const e = processExpr(s.argument);
      return e === s.argument ? stmt : IR.return(e, s.loc);
    }

    case "ThrowStatement": {
      const s = stmt as IRThrowStatement;
      const e = processExpr(s.argument);
      return e === s.argument ? stmt : IR.throw(e, s.loc);
    }

    case "IfStatement": {
      const s = stmt as IRIfStatement;
      const newTest = processExpr(s.test);
      const newCons = processStmtBody(s.consequent);
      const newAlt = s.alternate ? processStmtBody(s.alternate) : s.alternate;
      if (newTest === s.test && newCons === s.consequent && newAlt === s.alternate) return stmt;
      return IR.if(newTest, newCons, newAlt, s.loc);
    }

    case "WhileStatement": {
      const s = stmt as IRWhileStatement;
      const newTest = processExpr(s.test);
      const newBody = processStmtBody(s.body);
      if (newTest === s.test && newBody === s.body) return stmt;
      return IR.while(newTest, newBody, s.loc);
    }

    case "DoWhileStatement": {
      const s = stmt as IRDoWhileStatement;
      const newBody = processStmtBody(s.body);
      const newTest = processExpr(s.test);
      if (newBody === s.body && newTest === s.test) return stmt;
      return IR.doWhile(newBody, newTest, s.loc);
    }

    case "ForStatement": {
      const s = stmt as IRForStatement;
      let newInit: IRVariableDeclaration | IRExpression | null = s.init;
      if (s.init) {
        if (s.init.kind === "VariableDeclaration") {
          const vd = s.init as IRVariableDeclaration;
          if (vd.init) {
            const e = processExpr(vd.init);
            if (e !== vd.init) {
              newInit = IR.varDecl(vd.name, e, vd.loc, vd.isCaptured, vd.envRef, vd.hoistOnly);
            }
          }
        } else {
          newInit = processExpr(s.init as IRExpression);
        }
      }
      const newTest = s.test ? processExpr(s.test) : s.test;
      const newUpdate = s.update ? processExpr(s.update) : s.update;
      const newBody = processStmtBody(s.body);
      if (newInit === s.init && newTest === s.test && newUpdate === s.update && newBody === s.body) {
        return stmt;
      }
      return IR.for(newInit, newTest, newUpdate, newBody, s.loc);
    }

    case "ForInStatement": {
      const s = stmt as IRForInStatement;
      const newRight = processExpr(s.right);
      const newBody = processStmtBody(s.body);
      if (newRight === s.right && newBody === s.body) return stmt;
      return IR.forIn(s.left, newRight, newBody, s.loc);
    }

    case "SwitchStatement": {
      const s = stmt as IRSwitchStatement;
      const newDisc = processExpr(s.discriminant);
      let casesChanged = false;
      const newCases = s.cases.map((c) => {
        const newTest = c.test ? processExpr(c.test) : c.test;
        const newCons = processBody(c.consequent);
        if (newTest !== c.test || newCons !== c.consequent) {
          casesChanged = true;
          return IR.case(newTest, newCons);
        }
        return c;
      });
      if (newDisc === s.discriminant && !casesChanged) return stmt;
      return IR.switch(newDisc, casesChanged ? newCases : s.cases, s.loc);
    }

    case "TryStatement": {
      const s = stmt as IRTryStatement;
      const newBlock = processBlock(s.block);
      const newHandler = s.handler
        ? (() => {
            const newBody = processBlock(s.handler!.body);
            return newBody === s.handler!.body ? s.handler! : IR.catch(s.handler!.param, newBody);
          })()
        : null;
      const newFinalizer = s.finalizer ? processBlock(s.finalizer) : s.finalizer;
      if (newBlock === s.block && newHandler === s.handler && newFinalizer === s.finalizer) {
        return stmt;
      }
      return IR.try(newBlock, newHandler, newFinalizer, s.loc);
    }

    case "FunctionDeclaration": {
      const s = stmt as IRFunctionDeclaration;
      const newBody = processBody(s.body);
      let paramsChanged = false;
      const newParams = s.originalParams.map((p) => {
        if (!p.defaultValue) return p;
        const e = processExpr(p.defaultValue);
        if (e === p.defaultValue) return p;
        paramsChanged = true;
        return { ...p, defaultValue: e };
      });
      if (newBody === s.body && !paramsChanged) return stmt;
      return IR.functionDecl(s.name, paramsChanged ? newParams : s.originalParams, newBody, s.loc, s.plainSignature);
    }

    case "BlockStatement": {
      const s = stmt as IRBlockStatement;
      const newBody = processBody(s.body);
      return newBody === s.body ? stmt : IR.block(newBody, s.loc);
    }

    case "EnvDeclaration":
      return stmt;

    case "EnvAssign": {
      const s = stmt as IREnvAssign;
      const e = processExpr(s.value);
      return e === s.value ? stmt : IR.envAssign(s.envName, s.key, e, s.loc);
    }

    case "BreakStatement":
    case "ContinueStatement":
    case "EmptyStatement":
      return stmt;

    case "CaseClause":
      // Handled in SwitchStatement above
      return stmt;

    default:
      return assertNever(stmt as never);
  }
}

/** Processes a statement that may be a block or a single statement (loop body etc.) */
function processStmtBody(stmt: IRStatement): IRStatement {
  if (stmt.kind === "BlockStatement") {
    return processBlock(stmt as IRBlockStatement);
  }
  return processStmt(stmt);
}

/** Processes a BlockStatement preserving the wrapper */
function processBlock(block: IRBlockStatement): IRBlockStatement {
  const newBody = processBody(block.body);
  return newBody === block.body ? block : IR.block(newBody, block.loc);
}

// ============================================================================
// Pass definition
// ============================================================================

/**
 * Parenthesize pass — расставляет скобки для корректной работы BS парсера.
 *
 * Должен выполняться после try-finally-desugar (который может порождать
 * выражения, требующие parenthesization).
 */
export const parenthesizePass: IRPass = {
  name: "parenthesize",
  dependsOn: ["try-finally-desugar"],
  run(program: IRProgram, _ctx: PassContext): IRProgram {
    const newBody = processBody(program.body);
    return newBody === program.body ? program : { ...program, body: newBody };
  },
};
