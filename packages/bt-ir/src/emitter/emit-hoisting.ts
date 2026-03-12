/**
 * Hoisting emitters — var hoisting variants of statement emitters
 *
 * В обычном (non-bare) режиме переменные и функции хоистятся наверх функции/программы.
 * Эти emitters заменяют `var x = ...` на `x = ...` и рекурсивно обходят вложенные блоки.
 *
 * @module emitter/emit-hoisting
 */

import type {
  IRStatement,
  IRBlockStatement,
  IRIfStatement,
  IRForStatement,
  IRForInStatement,
  IRWhileStatement,
  IRDoWhileStatement,
  IRSwitchStatement,
  IRTryStatement,
} from "../ir/index.ts";
import type { EmitContext } from "./emit-helpers.ts";
import { getIndent, increaseIndent } from "./emit-helpers.ts";
import { emitExpression, emitObjectExpression } from "./emit-expressions.ts";
import { emitStatement } from "./emit-statements.ts";

/**
 * Генерирует statement, заменяя var declarations на assignments
 */
export function emitStatementHoisted(stmt: IRStatement, ctx: EmitContext): string {
  const pad = getIndent(ctx);

  // Для VariableDeclaration - только присваивание (hoistOnly только в collectVariableNames)
  if (stmt.kind === "VariableDeclaration") {
    if (stmt.hoistOnly) return ""; // не эмитим присваивание, только var в hoisting
    // Для captured переменных - присваивание в env (__env или __block0_env)
    const target = stmt.isCaptured ? `${stmt.envRef ?? "__env"}.${stmt.name}` : stmt.name;

    if (stmt.init) {
      if (stmt.init.kind === "ObjectExpression") {
        return `${pad}${target} = ${emitObjectExpression(stmt.init, ctx)};`;
      }
      return `${pad}${target} = ${emitExpression(stmt.init, ctx)};`;
    }
    return `${pad}${target} = undefined;`;
  }

  // Для блоков - рекурсивно
  if (stmt.kind === "BlockStatement") {
    return emitBlockHoisted(stmt, ctx);
  }

  // Для if - обработать consequent и alternate
  if (stmt.kind === "IfStatement") {
    return emitIfHoisted(stmt, ctx);
  }

  // Для for - обработать init и body
  if (stmt.kind === "ForStatement") {
    return emitForHoisted(stmt, ctx);
  }

  // Для for-in - обработать left и body
  if (stmt.kind === "ForInStatement") {
    return emitForInHoisted(stmt, ctx);
  }

  // Для while/do-while - обработать body
  if (stmt.kind === "WhileStatement") {
    return emitWhileHoisted(stmt, ctx);
  }
  if (stmt.kind === "DoWhileStatement") {
    return emitDoWhileHoisted(stmt, ctx);
  }

  // Для switch - обработать cases
  if (stmt.kind === "SwitchStatement") {
    return emitSwitchHoisted(stmt, ctx);
  }

  // Для try - обработать все блоки
  if (stmt.kind === "TryStatement") {
    return emitTryHoisted(stmt, ctx);
  }

  // Остальные - без изменений
  return emitStatement(stmt, ctx);
}

function emitBlockHoisted(block: IRBlockStatement, ctx: EmitContext): string {
  const pad = getIndent(ctx);
  const innerCtx = increaseIndent(ctx);
  const lines: string[] = [];

  lines.push(`${pad}{`);
  for (const s of block.body) {
    lines.push(emitStatementHoisted(s, innerCtx));
  }
  lines.push(`${pad}}`);

  return lines.join("\n");
}

function emitIfHoisted(ifStmt: IRIfStatement, ctx: EmitContext): string {
  const pad = getIndent(ctx);
  const lines: string[] = [];

  lines.push(
    `${pad}if (${emitExpression(ifStmt.test, ctx)}) ${emitStatementOrBlockHoisted(ifStmt.consequent, ctx)}`,
  );

  if (ifStmt.alternate) {
    if (ifStmt.alternate.kind === "IfStatement") {
      const elseIfCode = emitIfHoisted(ifStmt.alternate, ctx).trimStart();
      lines.push(`${pad}else ${elseIfCode}`);
    } else {
      lines.push(`${pad}else ${emitStatementOrBlockHoisted(ifStmt.alternate, ctx)}`);
    }
  }

  return lines.join("\n");
}

function emitForHoisted(forStmt: IRForStatement, ctx: EmitContext): string {
  const pad = getIndent(ctx);

  // init - если это var decl, выводим только присваивание
  let init = "";
  if (forStmt.init) {
    if (forStmt.init.kind === "VariableDeclaration") {
      init = `${forStmt.init.name} = ${forStmt.init.init ? emitExpression(forStmt.init.init, ctx) : "undefined"}`;
    } else {
      init = emitExpression(forStmt.init, ctx);
    }
  }

  const test = forStmt.test ? emitExpression(forStmt.test, ctx) : "";
  const update = forStmt.update ? emitExpression(forStmt.update, ctx) : "";

  return `${pad}for (${init}; ${test}; ${update}) ${emitStatementOrBlockHoisted(forStmt.body, ctx)}`;
}

function emitForInHoisted(forInStmt: IRForInStatement, ctx: EmitContext): string {
  const pad = getIndent(ctx);

  // left - если это var decl, выводим только имя
  const left =
    forInStmt.left.kind === "VariableDeclaration"
      ? forInStmt.left.name
      : emitExpression(forInStmt.left, ctx);

  const right = emitExpression(forInStmt.right, ctx);

  return `${pad}for (${left} in ${right}) ${emitStatementOrBlockHoisted(forInStmt.body, ctx)}`;
}

function emitWhileHoisted(whileStmt: IRWhileStatement, ctx: EmitContext): string {
  const pad = getIndent(ctx);
  return `${pad}while (${emitExpression(whileStmt.test, ctx)}) ${emitStatementOrBlockHoisted(whileStmt.body, ctx)}`;
}

function emitDoWhileHoisted(doWhileStmt: IRDoWhileStatement, ctx: EmitContext): string {
  const pad = getIndent(ctx);
  return `${pad}do ${emitStatementOrBlockHoisted(doWhileStmt.body, ctx)} while (${emitExpression(doWhileStmt.test, ctx)});`;
}

function emitSwitchHoisted(switchStmt: IRSwitchStatement, ctx: EmitContext): string {
  const pad = getIndent(ctx);
  const innerCtx = increaseIndent(ctx);
  const casePad = getIndent(innerCtx);
  const caseBodyCtx = increaseIndent(innerCtx);
  const lines: string[] = [];

  lines.push(`${pad}switch (${emitExpression(switchStmt.discriminant, ctx)}) {`);

  for (const c of switchStmt.cases) {
    if (c.test) {
      lines.push(`${casePad}case ${emitExpression(c.test, innerCtx)}:`);
    } else {
      lines.push(`${casePad}default:`);
    }

    for (const s of c.consequent) {
      lines.push(emitStatementHoisted(s, caseBodyCtx));
    }
  }

  lines.push(`${pad}}`);
  return lines.join("\n");
}

function emitTryHoisted(tryStmt: IRTryStatement, ctx: EmitContext): string {
  const pad = getIndent(ctx);
  const innerCtx = increaseIndent(ctx);
  const lines: string[] = [];

  lines.push(`${pad}try {`);
  for (const s of tryStmt.block.body) {
    lines.push(emitStatementHoisted(s, innerCtx));
  }
  lines.push(`${pad}}`);

  if (tryStmt.handler) {
    const paramStr = tryStmt.handler.param ? `(${tryStmt.handler.param})` : "";
    lines.push(`${pad}catch ${paramStr} {`);
    for (const s of tryStmt.handler.body.body) {
      lines.push(emitStatementHoisted(s, innerCtx));
    }
    lines.push(`${pad}}`);
  }

  if (tryStmt.finalizer) {
    lines.push(`${pad}finally {`);
    for (const s of tryStmt.finalizer.body) {
      lines.push(emitStatementHoisted(s, innerCtx));
    }
    lines.push(`${pad}}`);
  }

  return lines.join("\n");
}

function emitStatementOrBlockHoisted(stmt: IRStatement, ctx: EmitContext): string {
  if (stmt.kind === "BlockStatement") {
    const innerCtx = increaseIndent(ctx);
    const lines: string[] = ["{"];

    for (const s of stmt.body) {
      lines.push(emitStatementHoisted(s, innerCtx));
    }

    lines.push(`${getIndent(ctx)}}`);
    return lines.join("\n");
  }

  return emitStatementHoisted(stmt, ctx);
}
