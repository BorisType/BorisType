/**
 * Statement emitters — emitStatement dispatcher and all statement emitters
 *
 * @module emitter/emit-statements
 */

import type {
  IRStatement,
  IRFunctionDeclaration,
  IRVariableDeclaration,
  IRReturnStatement,
  IRIfStatement,
  IRForStatement,
  IRForInStatement,
  IRWhileStatement,
  IRDoWhileStatement,
  IRSwitchStatement,
  IRTryStatement,
  IRBlockStatement,
  IREnvDeclaration,
  IREnvAssign,
} from "../ir/index.ts";
import type { EmitContext } from "./emit-helpers.ts";
import { getIndent, increaseIndent } from "./emit-helpers.ts";
import { emitExpression, emitObjectExpression } from "./emit-expressions.ts";

/**
 * Генерирует код statement
 */
export function emitStatement(stmt: IRStatement, ctx: EmitContext): string {
  const pad = getIndent(ctx);

  switch (stmt.kind) {
    case "FunctionDeclaration":
      return emitFunction(stmt, ctx);

    case "VariableDeclaration":
      return emitVarDecl(stmt, ctx);

    case "ReturnStatement":
      return emitReturn(stmt, ctx);

    case "ExpressionStatement":
      return `${pad}${emitExpression(stmt.expression, ctx)};`;

    case "IfStatement":
      return emitIf(stmt, ctx);

    case "ForStatement":
      return emitFor(stmt, ctx);

    case "ForInStatement":
      return emitForIn(stmt, ctx);

    case "WhileStatement":
      return emitWhile(stmt, ctx);

    case "DoWhileStatement":
      return emitDoWhile(stmt, ctx);

    case "SwitchStatement":
      return emitSwitch(stmt, ctx);

    case "TryStatement":
      return emitTry(stmt, ctx);

    case "ThrowStatement":
      return `${pad}throw ${emitExpression(stmt.argument, ctx)};`;

    case "BreakStatement":
      return stmt.label ? `${pad}break ${stmt.label};` : `${pad}break;`;

    case "ContinueStatement":
      return stmt.label ? `${pad}continue ${stmt.label};` : `${pad}continue;`;

    case "BlockStatement":
      return emitBlock(stmt, ctx);

    case "EmptyStatement":
      return `${pad};`;

    case "EnvDeclaration":
      return emitEnvDecl(stmt, ctx);

    case "EnvAssign":
      return emitEnvAssign(stmt, ctx);

    default:
      return `${pad}/* Unknown statement: ${(stmt as any).kind} */`;
  }
}

// =========================================================================
// Statement Emitters
// =========================================================================

/**
 * Генерирует код функции с hoisting переменных и вложенных функций.
 *
 * После hoist pass функции и переменные уже расположены
 * в правильном порядке в body. Emitter вставляет только
 * извлечение параметров из __args (для BT-сигнатуры).
 */
export function emitFunction(fn: IRFunctionDeclaration, ctx: EmitContext): string {
  const pad = getIndent(ctx);
  const innerCtx = increaseIndent(ctx);
  const innerPad = getIndent(innerCtx);
  const lines: string[] = [];

  const isPlain = fn.plainSignature === true;

  // Сигнатура: BT или plain (ObjectUnion и др.)
  if (isPlain) {
    const paramList = fn.originalParams.map((p) => p.name).join(", ");
    lines.push(`${pad}function ${fn.name}(${paramList}) {`);

    // Plain mode: тело уже содержит hoisted vars и statements
    for (const stmt of fn.body) {
      lines.push(emitStatement(stmt, innerCtx));
    }
  } else {
    lines.push(`${pad}function ${fn.name}(__env, __this, __args) {`);

    // 1. Emit leading FunctionDeclarations (hoisted to top by pass)
    let bodyIdx = 0;
    for (; bodyIdx < fn.body.length && fn.body[bodyIdx].kind === "FunctionDeclaration"; bodyIdx++) {
      lines.push(emitStatement(fn.body[bodyIdx], innerCtx));
    }

    // 2. Извлечение параметров из __args
    fn.originalParams.forEach((param, index) => {
      // Captured-параметры назначаются в __env, обычные — в локальные var
      const target = param.isCaptured ? `__env.${param.name}` : `var ${param.name}`;
      if (param.rest) {
        lines.push(`${innerPad}${target} = bt.Array.slice(__args, ${index});`);
      } else if (param.defaultValue) {
        const defaultExpr = emitExpression(param.defaultValue, innerCtx);
        lines.push(
          `${innerPad}${target} = __args.length > ${index} ? __args[${index}] : ${defaultExpr};`,
        );
      } else {
        lines.push(
          `${innerPad}${target} = __args.length > ${index} ? __args[${index}] : undefined;`,
        );
      }
    });

    // 3. Emit remaining body (hoisted vars + assignments + statements)
    for (; bodyIdx < fn.body.length; bodyIdx++) {
      lines.push(emitStatement(fn.body[bodyIdx], innerCtx));
    }
  }

  lines.push(`${pad}}`);

  return lines.join("\n");
}

/**
 * Генерирует код объявления переменной
 */
function emitVarDecl(decl: IRVariableDeclaration, ctx: EmitContext): string {
  const pad = getIndent(ctx);

  if (decl.init) {
    // Для объектов нужно многострочное форматирование
    if (decl.init.kind === "ObjectExpression") {
      return `${pad}var ${decl.name} = ${emitObjectExpression(decl.init, ctx)};`;
    }
    return `${pad}var ${decl.name} = ${emitExpression(decl.init, ctx)};`;
  }

  return `${pad}var ${decl.name};`;
}

/**
 * Генерирует код return
 */
function emitReturn(ret: IRReturnStatement, ctx: EmitContext): string {
  const pad = getIndent(ctx);

  if (ret.argument) {
    return `${pad}return ${emitExpression(ret.argument, ctx)};`;
  }

  return `${pad}return;`;
}

/**
 * Генерирует код if
 */
function emitIf(ifStmt: IRIfStatement, ctx: EmitContext): string {
  const pad = getIndent(ctx);
  const lines: string[] = [];

  lines.push(
    `${pad}if (${emitExpression(ifStmt.test, ctx)}) ${emitStatementOrBlock(ifStmt.consequent, ctx)}`,
  );

  if (ifStmt.alternate) {
    if (ifStmt.alternate.kind === "IfStatement") {
      // else if
      const elseIfCode = emitIf(ifStmt.alternate, ctx).trimStart();
      lines.push(`${pad}else ${elseIfCode}`);
    } else {
      lines.push(`${pad}else ${emitStatementOrBlock(ifStmt.alternate, ctx)}`);
    }
  }

  return lines.join("\n");
}

/**
 * Генерирует код for
 */
function emitFor(forStmt: IRForStatement, ctx: EmitContext): string {
  const pad = getIndent(ctx);

  const init = forStmt.init
    ? forStmt.init.kind === "VariableDeclaration"
      ? `var ${forStmt.init.name} = ${forStmt.init.init ? emitExpression(forStmt.init.init, ctx) : "undefined"}`
      : emitExpression(forStmt.init, ctx)
    : "";

  const test = forStmt.test ? emitExpression(forStmt.test, ctx) : "";
  const update = forStmt.update ? emitExpression(forStmt.update, ctx) : "";

  return `${pad}for (${init}; ${test}; ${update}) ${emitStatementOrBlock(forStmt.body, ctx)}`;
}

/**
 * Генерирует код for-in
 */
function emitForIn(forStmt: IRForInStatement, ctx: EmitContext): string {
  const pad = getIndent(ctx);

  const left =
    forStmt.left.kind === "VariableDeclaration"
      ? `var ${forStmt.left.name}`
      : emitExpression(forStmt.left, ctx);

  return `${pad}for (${left} in ${emitExpression(forStmt.right, ctx)}) ${emitStatementOrBlock(forStmt.body, ctx)}`;
}

/**
 * Генерирует код while
 */
function emitWhile(whileStmt: IRWhileStatement, ctx: EmitContext): string {
  const pad = getIndent(ctx);
  return `${pad}while (${emitExpression(whileStmt.test, ctx)}) ${emitStatementOrBlock(whileStmt.body, ctx)}`;
}

/**
 * Генерирует код do-while
 */
function emitDoWhile(doWhileStmt: IRDoWhileStatement, ctx: EmitContext): string {
  const pad = getIndent(ctx);
  return `${pad}do ${emitStatementOrBlock(doWhileStmt.body, ctx)} while (${emitExpression(doWhileStmt.test, ctx)});`;
}

/**
 * Генерирует код switch
 */
function emitSwitch(switchStmt: IRSwitchStatement, ctx: EmitContext): string {
  const pad = getIndent(ctx);
  const innerCtx = increaseIndent(ctx);
  const innerPad = getIndent(innerCtx);
  const caseCtx = increaseIndent(innerCtx);
  const lines: string[] = [];

  lines.push(`${pad}switch (${emitExpression(switchStmt.discriminant, ctx)}) {`);

  for (const caseClause of switchStmt.cases) {
    if (caseClause.test) {
      lines.push(`${innerPad}case ${emitExpression(caseClause.test, innerCtx)}:`);
    } else {
      lines.push(`${innerPad}default:`);
    }

    for (const stmt of caseClause.consequent) {
      lines.push(emitStatement(stmt, caseCtx));
    }
  }

  lines.push(`${pad}}`);

  return lines.join("\n");
}

/**
 * Генерирует код try
 */
function emitTry(tryStmt: IRTryStatement, ctx: EmitContext): string {
  const pad = getIndent(ctx);
  const lines: string[] = [];

  lines.push(`${pad}try ${emitBlock(tryStmt.block, ctx)}`);

  if (tryStmt.handler) {
    const param = tryStmt.handler.param ? `(${tryStmt.handler.param})` : "";
    lines.push(`${pad}catch ${param} ${emitBlock(tryStmt.handler.body, ctx)}`);
  }

  if (tryStmt.finalizer) {
    lines.push(`${pad}finally ${emitBlock(tryStmt.finalizer, ctx)}`);
  }

  return lines.join("\n");
}

/**
 * Генерирует код блока
 */
export function emitBlock(block: IRBlockStatement, ctx: EmitContext): string {
  const pad = getIndent(ctx);
  const innerCtx = increaseIndent(ctx);
  const lines: string[] = [];

  lines.push("{");

  for (const stmt of block.body) {
    lines.push(emitStatement(stmt, innerCtx));
  }

  lines.push(`${pad}}`);

  return lines.join("\n");
}

/**
 * Генерирует statement или блок (для if/for/while)
 */
export function emitStatementOrBlock(stmt: IRStatement, ctx: EmitContext): string {
  if (stmt.kind === "BlockStatement") {
    return emitBlock(stmt, ctx);
  }

  // Оборачиваем в блок для консистентности
  const innerCtx = increaseIndent(ctx);
  return `{\n${emitStatement(stmt, innerCtx)}\n${getIndent(ctx)}}`;
}

// =========================================================================
// Environment Emitters
// =========================================================================

/**
 * Генерирует код env declaration
 */
function emitEnvDecl(decl: IREnvDeclaration, ctx: EmitContext): string {
  const pad = getIndent(ctx);

  if (decl.parentEnv) {
    return `${pad}var ${decl.name} = { __parent: ${decl.parentEnv} };`;
  }

  return `${pad}var ${decl.name} = {};`;
}

/**
 * Генерирует код env assign
 */
function emitEnvAssign(assign: IREnvAssign, ctx: EmitContext): string {
  const pad = getIndent(ctx);
  return `${pad}${assign.envName}.${assign.key} = ${emitExpression(assign.value, ctx)};`;
}
