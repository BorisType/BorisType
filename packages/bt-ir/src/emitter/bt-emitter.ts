/**
 * BT Emitter - генерация BorisScript кода из IR
 *
 * @module emitter
 */

import type {
  IRProgram,
  IRStatement,
  IRExpression,
  IRFunctionDeclaration,
  IRVariableDeclaration,
  IRReturnStatement,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  IRExpressionStatement,
  IRIfStatement,
  IRForStatement,
  IRForInStatement,
  IRWhileStatement,
  IRDoWhileStatement,
  IRSwitchStatement,
  IRTryStatement,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  IRThrowStatement,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  IRBreakStatement,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  IRContinueStatement,
  IRBlockStatement,
  IRObjectExpression,
  IREnvDeclaration,
  IREnvAssign,
  IREnvAccess,
  IRPolyfillCall,
  IRRuntimeCall,
  IRBinaryExpression,
  IRUnaryExpression,
  IRLogicalExpression,
  IRConditionalExpression,
  IRAssignmentExpression,
  IRUpdateExpression,
  IRArrayExpression,
} from "../ir/index.ts";

/**
 * Опции генерации кода
 */
export interface EmitOptions {
  /** Размер отступа (по умолчанию 4 пробела) */
  indentSize?: number;
  /** Использовать табы вместо пробелов */
  useTabs?: boolean;
  /** Генерировать source map */
  sourceMap?: boolean;
}

/**
 * Результат генерации кода
 */
export interface EmitResult {
  /** Сгенерированный код */
  code: string;
  /** Source map (если запрошен) */
  map?: string;
}

/**
 * Контекст генерации
 */
interface EmitContext {
  /** Текущий отступ */
  indent: number;
  /** Строка отступа */
  indentStr: string;
  /** Опции */
  options: Required<EmitOptions>;
  /**
   * Если true, не хоистить функции и переменные — эмитить как есть.
   * Используется в bare-режиме.
   */
  noHoist?: boolean;
  /** Source map builder */
  // TODO: add source map support
}

/**
 * Исключения из стандартного bt.polyfill.type.method(target, args).
 * direct: прямой вызов target.method(args) — push, split
 * builtin: встроенная BS функция — ArrayUnion
 * rename: polyfill метод с другим именем — with → _with
 */
type PolyfillEmitRule =
  | { kind: "direct"; emit: (target: string, args: string[]) => string }
  | { kind: "builtin"; fn: string }
  | { kind: "rename"; polyfillMethod: string };

/**
 * BT polyfill методы требуют точное количество аргументов.
 * argCount — всего аргументов (target + params). undefined = переменная арность.
 * restAsArray — последний параметр собирает rest в массив (splice, unshift, toSpliced).
 */
type PolyfillArgSpec = {
  rule?: PolyfillEmitRule;
  argCount?: number;
  restAsArray?: boolean;
};

const POLYFILL_SPEC: Record<string, Record<string, PolyfillArgSpec>> = {
  Array: {
    at: { argCount: 2 },
    copyWithin: { argCount: 4 },
    entries: { argCount: 1 },
    fill: { argCount: 4 },
    flat: { argCount: 2 },
    includes: { argCount: 3 },
    indexOf: { argCount: 3 },
    join: { argCount: 2 },
    keys: { argCount: 1 },
    lastIndexOf: { argCount: 3 },
    pop: { argCount: 1 },
    push: { rule: { kind: "direct", emit: (t, a) => `${t}.push(${a.join(", ")})` } },
    reverse: { argCount: 1 },
    shift: { argCount: 1 },
    slice: { argCount: 3 },
    splice: { argCount: 4, restAsArray: true },
    toReversed: { argCount: 1 },
    toSpliced: { argCount: 4, restAsArray: true },
    unshift: { argCount: 2, restAsArray: true },
    values: { argCount: 1 },
    with: { rule: { kind: "rename", polyfillMethod: "_with" }, argCount: 3 },
    concat: { rule: { kind: "builtin", fn: "ArrayUnion" } },
  },
  String: {
    at: { argCount: 2 },
    substr: { argCount: 3 },
    trim: { argCount: 1 },
    trimEnd: { argCount: 1 },
    trimStart: { argCount: 1 },
    // split: { rule: { kind: "direct", emit: (t, a) => `${t}.split(${a.join(", ")})` } },
  },
};

/**
 * Генерирует BorisScript код из IR программы
 */
export function emit(program: IRProgram, options: EmitOptions = {}): EmitResult {
  const ctx: EmitContext = {
    indent: 0,
    indentStr: "",
    options: {
      indentSize: options.indentSize ?? 4,
      useTabs: options.useTabs ?? false,
      sourceMap: options.sourceMap ?? false,
    },
    noHoist: program.noHoist,
  };

  const code = emitProgram(program, ctx);

  return { code };
}

/**
 * Генерирует код программы с hoisting переменных
 * Порядок:
 * - Обычный режим: 1) функции, 2) объявления переменных, 3) остальной код
 * - Bare-режим: statements в исходном порядке без hoisting на top-level.
 *   Hoisting переменных выполняется только внутри функций.
 */
function emitProgram(program: IRProgram, ctx: EmitContext): string {
  const lines: string[] = [];

  // Bare mode: top-level — 1:1, без hoisting.
  // Переменные хоистятся только внутри функций (в emitFunction).
  if (ctx.noHoist) {
    for (const stmt of program.body) {
      lines.push(emitStatement(stmt, ctx));
    }
    return lines.join("\n");
  }

  // Разделяем функции и остальные statements
  const functions: IRStatement[] = [];
  const otherStmts: IRStatement[] = [];

  for (const stmt of program.body) {
    if (stmt.kind === "FunctionDeclaration") {
      functions.push(stmt);
    } else {
      otherStmts.push(stmt);
    }
  }

  // 1. Выводим функции
  for (const fn of functions) {
    lines.push(emitStatement(fn, ctx));
  }

  // 2. Собираем и выводим объявления переменных
  const varNames = collectVariableNames(otherStmts);
  for (const name of varNames) {
    lines.push(`var ${name};`);
  }

  // 3. Выводим остальной код (с заменой var на присваивания)
  for (const stmt of otherStmts) {
    lines.push(emitStatementHoisted(stmt, ctx));
  }

  return lines.join("\n");
}

/**
 * Генерирует код statement
 */
function emitStatement(stmt: IRStatement, ctx: EmitContext): string {
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
 * В bare-режиме (ctx.noHoist):
 * - Хоистятся только переменные
 * - Вложенные функции остаются на своих местах
 *
 * В обычном режиме:
 * - Хоистятся и функции, и переменные
 */
function emitFunction(fn: IRFunctionDeclaration, ctx: EmitContext): string {
  const pad = getIndent(ctx);
  const innerCtx = increaseIndent(ctx);
  const innerPad = getIndent(innerCtx);
  const lines: string[] = [];

  const isPlain = fn.plainSignature === true;

  // Сигнатура: BT или plain (ObjectUnion и др.)
  if (isPlain) {
    const paramList = fn.originalParams.map(p => p.name).join(", ");
    lines.push(`${pad}function ${fn.name}(${paramList}) {`);
  } else {
    lines.push(`${pad}function ${fn.name}(__env, __this, __args) {`);
  }

  // Имена параметров (уже объявлены)
  const paramNames = new Set(fn.originalParams.map(p => p.name));

  // Bare mode: хоистим только переменные, всё остальное по порядку
  if (ctx.noHoist && isPlain) {
    const bodyVars = collectVariableNames(fn.body);
    for (const name of bodyVars) {
      if (!paramNames.has(name)) {
        lines.push(`${innerPad}var ${name};`);
      }
    }
    for (const stmt of fn.body) {
      lines.push(emitStatementHoisted(stmt, innerCtx));
    }
    lines.push(`${pad}}`);
    return lines.join("\n");
  }

  // Обычный режим: разделяем body на функции и остальные statements
  const nestedFunctions: IRFunctionDeclaration[] = [];
  const otherStatements: IRStatement[] = [];
  for (const stmt of fn.body) {
    if (stmt.kind === "FunctionDeclaration") {
      nestedFunctions.push(stmt);
    } else {
      otherStatements.push(stmt);
    }
  }

  // 1. Вложенные функции (hoisted наверх)
  for (const nestedFn of nestedFunctions) {
    lines.push(emitFunction(nestedFn, innerCtx));
  }

  // 2. Извлечение параметров из __args (только для BT-сигнатуры)
  if (!isPlain) {
    fn.originalParams.forEach((param, index) => {
      // Captured-параметры назначаются в __env, обычные — в локальные var
      const target = param.isCaptured ? `__env.${param.name}` : `var ${param.name}`;
      if (param.rest) {
        lines.push(
          `${innerPad}${target} = bt.Array.slice(__args, ${index});`
        );
      } else if (param.defaultValue) {
        const defaultExpr = emitExpression(param.defaultValue, innerCtx);
        lines.push(
          `${innerPad}${target} = __args.length > ${index} ? __args[${index}] : ${defaultExpr};`
        );
      } else {
        lines.push(
          `${innerPad}${target} = __args.length > ${index} ? __args[${index}] : undefined;`
        );
      }
    });
  }

  // 3. Собираем переменные из тела (кроме имён параметров)
  const bodyVars = collectVariableNames(otherStatements);
  for (const name of bodyVars) {
    if (!paramNames.has(name)) {
      lines.push(`${innerPad}var ${name};`);
    }
  }

  // 4. Остальное тело функции с hoisting
  for (const stmt of otherStatements) {
    lines.push(emitStatementHoisted(stmt, innerCtx));
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

  lines.push(`${pad}if (${emitExpression(ifStmt.test, ctx)}) ${emitStatementOrBlock(ifStmt.consequent, ctx)}`);

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

  const left = forStmt.left.kind === "VariableDeclaration"
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
function emitBlock(block: IRBlockStatement, ctx: EmitContext): string {
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
function emitStatementOrBlock(stmt: IRStatement, ctx: EmitContext): string {
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

// =========================================================================
// Expression Emitters
// =========================================================================

/**
 * Генерирует код выражения
 */
function emitExpression(expr: IRExpression, ctx: EmitContext): string {
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
      return `(${expr.expressions.map(e => emitExpression(e, ctx)).join(", ")})`;

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
  const args = expr.arguments.map(a => emitExpression(a, ctx)).join(", ");
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
  const elements = expr.elements.map(e => (e ? emitExpression(e, ctx) : "")).join(", ");
  return `[${elements}]`;
}

/**
 * Генерирует код object expression
 */
function emitObjectExpression(obj: IRObjectExpression, ctx: EmitContext): string {
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
    const key = prop.computed
      ? `[${prop.key}]`
      : `"${prop.key}"`;
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
    expr.left.kind === "EnvAccess"
      ? emitEnvAccess(expr.left)
      : emitExpression(expr.left, ctx);
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
function emitEnvAccess(access: IREnvAccess): string {
  let result = "__env";
  for (let i = 0; i < access.depth; i++) {
    result += ".__parent";
  }
  return `${result}.${access.key}`;
}

/**
 * Генерирует код polyfill call.
 * BT полифиллы требуют точное количество аргументов — дополняем undefined при необходимости.
 */
function emitPolyfillCall(call: IRPolyfillCall, ctx: EmitContext): string {
  const target = emitExpression(call.target, ctx);
  let args = call.arguments.map((a) => emitExpression(a, ctx));
  const spec = POLYFILL_SPEC[call.polyfillType]?.[call.method];

  // Pad args to exact count (BT polyfill semantics)
  if (spec?.argCount !== undefined) {
    const needed = spec.argCount - 1; // target + method params
    while (args.length < needed) {
      args = [...args, "undefined"];
    }
  }

  const argsStr = args.length > 0 ? `, ${args.join(", ")}` : "";

  const rule = spec?.rule;

  if (rule) {
    switch (rule.kind) {
      case "direct":
        return rule.emit(target, args);
      case "builtin":
        return `${rule.fn}(${target}${argsStr})`;
      case "rename":
        return `bt.polyfill.${call.polyfillType}.${rule.polyfillMethod}(${target}${argsStr})`;
    }
  }

  return `bt.polyfill.${call.polyfillType}.${call.method}(${target}${argsStr})`;
}

/**
 * Генерирует код runtime call
 */
function emitRuntimeCall(call: IRRuntimeCall, ctx: EmitContext): string {
  const args = call.arguments.map(a => emitExpression(a, ctx)).join(", ");
  return `bt.${call.namespace}.${call.method}(${args})`;
}

/**
 * Генерирует код bt.getProperty(obj, prop)
 */
function emitBTGetProperty(expr: import("../ir/index.js").IRBTGetProperty, ctx: EmitContext): string {
  const obj = emitExpression(expr.object, ctx);
  const prop = emitExpression(expr.property, ctx);
  return `bt.getProperty(${obj}, ${prop})`;
}

/**
 * Генерирует код bt.setProperty(obj, prop, value)
 */
function emitBTSetProperty(expr: import("../ir/index.js").IRBTSetProperty, ctx: EmitContext): string {
  const obj = emitExpression(expr.object, ctx);
  const prop = emitExpression(expr.property, ctx);
  const value = emitExpression(expr.value, ctx);
  return `bt.setProperty(${obj}, ${prop}, ${value})`;
}

/**
 * Генерирует код bt.callFunction(func, [args])
 */
function emitBTCallFunction(expr: import("../ir/index.js").IRBTCallFunction, ctx: EmitContext): string {
  const callee = emitExpression(expr.callee, ctx);
  const args = expr.arguments.map(a => emitExpression(a, ctx)).join(", ");
  return `bt.callFunction(${callee}, [${args}])`;
}

/**
 * Генерирует код bt.isFunction(value)
 */
function emitBTIsFunction(expr: import("../ir/index.js").IRBTIsFunction, ctx: EmitContext): string {
  const value = emitExpression(expr.value, ctx);
  return `bt.isFunction(${value})`;
}

// =========================================================================
// Helpers
// =========================================================================

/**
 * Возвращает строку отступа
 */
function getIndent(ctx: EmitContext): string {
  const char = ctx.options.useTabs ? "\t" : " ".repeat(ctx.options.indentSize);
  return char.repeat(ctx.indent);
}

/**
 * Возвращает новый контекст с увеличенным отступом
 */
function increaseIndent(ctx: EmitContext): EmitContext {
  return { ...ctx, indent: ctx.indent + 1 };
}
// =========================================================================
// Variable Hoisting
// =========================================================================

/**
 * Собирает все уникальные имена переменных из statements (рекурсивно)
 * Не заходит внутрь функций (у них своя область видимости)
 */
function collectVariableNames(statements: IRStatement[]): Set<string> {
  const vars = new Set<string>();

  function visit(stmt: IRStatement): void {
    switch (stmt.kind) {
      case "VariableDeclaration":
        // Пропускаем captured переменные - они живут в __env
        if (!stmt.isCaptured) {
          vars.add(stmt.name);
        }
        break;

      case "BlockStatement":
        stmt.body.forEach(visit);
        break;

      case "IfStatement":
        visit(stmt.consequent);
        if (stmt.alternate) visit(stmt.alternate);
        break;

      case "ForStatement":
        if (stmt.init && stmt.init.kind === "VariableDeclaration") {
          if (!stmt.init.isCaptured) {
            vars.add(stmt.init.name);
          }
        }
        visit(stmt.body);
        break;

      case "ForInStatement":
        if (stmt.left.kind === "VariableDeclaration") {
          if (!stmt.left.isCaptured) {
            vars.add(stmt.left.name);
          }
        }
        visit(stmt.body);
        break;

      case "WhileStatement":
      case "DoWhileStatement":
        visit(stmt.body);
        break;

      case "SwitchStatement":
        for (const c of stmt.cases) {
          c.consequent.forEach(visit);
        }
        break;

      case "TryStatement":
        visit(stmt.block);
        if (stmt.handler) {
          // Не добавляем catch-параметр в hoisted vars:
          // catch(err) — параметр локален для catch-блока,
          // var err; в начале функции затенит его и сделает undefined.
          visit(stmt.handler.body);
        }
        if (stmt.finalizer) visit(stmt.finalizer);
        break;

      // FunctionDeclaration - не заходим внутрь
      // Остальные statements не содержат переменных
    }
  }

  statements.forEach(visit);
  return vars;
}

/**
 * Генерирует statement, заменяя var declarations на assignments
 */
function emitStatementHoisted(stmt: IRStatement, ctx: EmitContext): string {
  const pad = getIndent(ctx);

  // Для VariableDeclaration - только присваивание (hoistOnly только в collectVariableNames)
  if (stmt.kind === "VariableDeclaration") {
    if (stmt.hoistOnly) return ""; // не эмитим присваивание, только var в hoisting
    // Для captured переменных - присваивание в env (__env или __block0_env)
    const target = stmt.isCaptured
      ? `${stmt.envRef ?? "__env"}.${stmt.name}`
      : stmt.name;

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

  lines.push(`${pad}if (${emitExpression(ifStmt.test, ctx)}) ${emitStatementOrBlockHoisted(ifStmt.consequent, ctx)}`);

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
  const left = forInStmt.left.kind === "VariableDeclaration"
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

/**
 * Проверяет является ли строка валидным JS идентификатором
 */
function _isValidIdentifier(str: string): boolean {
  return /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(str);
}
