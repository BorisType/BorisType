/**
 * Function Builder - унифицированное создание функций с desc паттерном
 *
 * Все функции в BorisScript имеют структуру:
 * 1. function name(__env, __this, __args) { ... } - hoisted
 * 2. var name_desc = { "@descriptor": "function", callable, env, obj }
 * 3. __env.name = name_desc - регистрация в окружении
 *
 * Дескриптор ссылается на текущий env (ctx.currentEnvRef) напрямую —
 * отдельный per-function env НЕ создаётся. Per-call env (если нужен)
 * создаётся внутри тела функции при каждом вызове.
 *
 * @module lowering/function-builder
 */

import {
  IR,
  type IRFunctionDeclaration,
  type IRFunctionParam,
  type IRStatement,
  type IRObjectProperty,
  type IRExpression,
  type SourceLocation,
} from "../ir/index.ts";
import type { VariableInfo } from "../analyzer/index.ts";
import type { BindingManager } from "./binding.ts";
import { buildEnvChainAccess } from "./env-resolution.ts";

// ============================================================================
// Types
// ============================================================================

/**
 * Результат сборки функции
 */
export interface FunctionBuildResult {
  /** Имя функции */
  name: string;
  /** Имя descriptor переменной */
  descName: string;
  /** IR объявление функции (для hoisting) */
  funcDecl: IRFunctionDeclaration;
  /** Statements для setup (desc, registration) */
  setupStatements: IRStatement[];
}

/**
 * Опции для сборки функции
 */
export interface FunctionBuildOptions {
  /** Имя функции (если не указано — генерируется) */
  name?: string;
  /** Prefix для генерации имени (если name не указан) */
  namePrefix?: string;
  /** Параметры функции */
  params: IRFunctionParam[];
  /** Тело функции */
  body: IRStatement[];
  /** Captured переменные */
  capturedVars: CapturedVarInfo[];
  /** Менеджер генерации имён */
  bindings: BindingManager;
  /** Source location */
  loc?: SourceLocation;
  /** Регистрировать ли в __env (если false — не генерирует __env.name = ...) */
  registerInEnv?: boolean;
  /** Имя для регистрации в __env (по умолчанию = name) */
  envRegistrationName?: string;
  /** Env для дескриптора — текущий env контекста (ctx.currentEnvRef) */
  effectiveEnvRef: string;
  /** Module mode: ref/lib вместо callable в дескрипторе */
  useRefFormat?: boolean;
  /** Module mode: добавить __module.exports[exportAs] = desc после registration */
  exportAs?: string;
  /** Module mode: глубина до root __env для lib (0 = __env.__codelibrary, 1 = __env.__parent.__codelibrary, ...) */
  codelibraryDepth?: number;
  /**
   * Имя переменной env для регистрации дескриптора (по умолчанию: "__env").
   * Используется вместо захардкоженного "__env" при per-call env,
   * чтобы регистрация шла в правильный env объект.
   */
  registrationEnvRef?: string;
}

/**
 * Информация о captured переменной
 */
export interface CapturedVarInfo {
  /** Имя переменной (оригинальное) */
  name: string;
  /** Тип переменной */
  kind: VariableInfo["kind"];
  /** Переименованное имя (если было shadowing) */
  renamedTo?: string;
}

// ============================================================================
// Builder
// ============================================================================

/**
 * Собирает функцию с desc паттерном
 *
 * @example
 * ```typescript
 * const result = buildFunction({
 *   name: "myFunc",
 *   params: [IR.param("a"), IR.param("b")],
 *   body: [...statements],
 *   capturedVars: [{ name: "x", kind: "const" }],
 *   effectiveEnvRef: "__env",
 *   bindings,
 * });
 *
 * // result.funcDecl → function myFunc(__env, __this, __args) { ... }
 * // result.setupStatements → [var myFunc_desc = {...}, __env.myFunc = myFunc_desc]
 * ```
 */
export function buildFunction(options: FunctionBuildOptions): FunctionBuildResult {
  const {
    params,
    body,
    bindings,
    loc,
    registerInEnv = true,
    effectiveEnvRef,
    useRefFormat = false,
    exportAs,
    codelibraryDepth = 0,
    registrationEnvRef = "__env",
  } = options;

  // Генерируем или используем переданное имя
  const name = options.name ?? bindings.create(options.namePrefix ?? "func");
  // Дескриптор ссылается на effectiveEnvRef напрямую — отдельный env не создаётся
  const envName = effectiveEnvRef;
  const descName = bindings.descName(name);
  const envRegistrationName = options.envRegistrationName ?? name;

  // 1. Создаём IR функцию
  const funcDecl = IR.functionDecl(name, params, body, loc);

  // 2. Генерируем setup statements
  const setupStatements: IRStatement[] = [];

  // var name_desc = { "@descriptor": "function", ... }
  const descProps: IRObjectProperty[] = [
    IR.prop("@descriptor", IR.string("function")),
    IR.prop("obj", IR.id("undefined")),
    IR.prop("env", IR.id(envName)),
  ];
  if (useRefFormat) {
    descProps.push(IR.prop("ref", IR.string(name)));
    // lib: __codelibrary на root __env, доступ через цепочку __parent по глубине
    descProps.push(IR.prop("lib", buildEnvChainAccess(envName, codelibraryDepth, "__codelibrary")));
  } else {
    descProps.push(IR.prop("callable", IR.id(name)));
  }
  const descObj = IR.object(descProps);
  setupStatements.push(IR.varDecl(descName, descObj));

  // env.name = name_desc (опционально)
  if (registerInEnv) {
    setupStatements.push(
      IR.exprStmt(
        IR.assign("=", IR.dot(IR.id(registrationEnvRef), envRegistrationName), IR.id(descName)),
      ),
    );
  }

  // Module mode: __module.exports.exportAs = desc (сразу после registration)
  if (exportAs) {
    setupStatements.push(
      IR.exprStmt(
        IR.assign("=", IR.dot(IR.dot(IR.id("__module"), "exports"), exportAs), IR.id(descName)),
      ),
    );
  }

  return {
    name,
    descName,
    funcDecl,
    setupStatements,
  };
}

/**
 * Генерирует statement для присвоения obj в descriptor
 * Используется для методов объектов после создания объекта
 *
 * @example
 * ```typescript
 * // descName.obj = objVarName
 * const stmt = assignDescriptorObj("myMethod_desc", "__obj0");
 * ```
 */
export function assignDescriptorObj(descName: string, objVarName: string): IRStatement {
  return IR.exprStmt(IR.assign("=", IR.dot(IR.id(descName), "obj"), IR.id(objVarName)));
}

/**
 * Возвращает ссылку на функцию в __env
 *
 * @example
 * ```typescript
 * // __env.myFunc
 * const ref = getEnvFunctionRef("myFunc");
 * ```
 */
export function getEnvFunctionRef(
  name: string,
  loc?: SourceLocation,
  envRef = "__env",
): IRExpression {
  return IR.dot(IR.id(envRef), name, loc);
}
