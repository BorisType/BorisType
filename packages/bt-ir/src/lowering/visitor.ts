/**
 * TS Visitor - преобразование TypeScript AST в IR
 *
 * Entry point модуля lowering. Координирует обход TypeScript AST и генерацию IR.
 * 
 * Структура модуля (после рефакторинга):
 * - visitor.ts — entry point, VisitorContext, transformToIR
 * - statements.ts — visitors для statements
 * - expressions.ts — visitors для expressions  
 * - helpers.ts — вспомогательные функции (операторы, scope, location)
 * - function-builder.ts — построение env/desc паттерна для функций
 * - binding.ts — менеджер генерации уникальных имён
 *
 * @module lowering/visitor
 */

import * as ts from "typescript";
import * as path from "node:path";
import {
  IR,
  type IRProgram,
  type IRStatement,
  type IRFunctionDeclaration,
} from "../ir/index.ts";
import {
  type ScopeAnalysisResult,
  type Scope,
} from "../analyzer/index.ts";
import { BindingManager } from "./binding.ts";
import { findSymbolByName } from "./helpers.ts";
import { visitStatement } from "./statements.ts";
import { createObjectUnionFunction } from "./spread-helpers.ts";

// ============================================================================
// Types
// ============================================================================

/**
 * Режим транспиляции
 * - bare: минимальный, без bt.getProperty, без polyfill (runtime, botest)
 * - script: eval-скрипт, env/desc, bt.getProperty, polyfill (.test.ts, executable)
 * - module: надстройка над script, hoist, __init (codelibrary)
 */
export type CompileMode = "bare" | "script" | "module";

/**
 * Контекст visitor'а
 * 
 * Передаётся во все visitor функции и содержит:
 * - Информацию о текущем scope
 * - Карту параметров функции
 * - Pending statements для hoisting
 * - TypeChecker для определения типов
 */
export interface VisitorContext {
  /** Режим транспиляции */
  mode: CompileMode;
  /** Карта параметров текущей функции: имя → индекс */
  functionParams: Map<string, number>;
  /** Hoisted функции (будут вынесены наверх) */
  hoistedFunctions: IRFunctionDeclaration[];
  /** TypeScript TypeChecker */
  typeChecker: ts.TypeChecker;
  /** Исходный файл */
  sourceFile: ts.SourceFile;
  /** Менеджер генерации уникальных имён */
  bindings: BindingManager;
  /** Результат анализа scopes */
  scopeAnalysis: ScopeAnalysisResult;
  /** Текущий scope */
  currentScope: Scope;
  /** Pending statements — вставляются перед текущим statement */
  pendingStatements: IRStatement[];
  /** Текущий env для captured: __env, __block0_env и т.д. */
  currentEnvRef: string;
  /** Scope, которому принадлежит currentEnvRef (для depth) */
  currentEnvScope?: Scope;
  /** Scope env замыкания (при построении arrow/method) */
  closureEnvScope?: Scope;
  /** Символ XmlDocument (для проверки XML-типов, без bt.getProperty) */
  xmlDocumentSymbol?: ts.Symbol;
  /** Символ XmlElem (для проверки XML-типов, без bt.getProperty) */
  xmlElemSymbol?: ts.Symbol;
  /** Карта импортов: localName → { moduleVar, exportedName, isCaptured } для live binding */
  importBindings: Map<string, { moduleVar: string; exportedName: string; isCaptured: boolean }>;
  /** Ключ файла для script mode (packageName+version+relativePath) */
  fileKey?: string;
  /** Имя текущего .js файла для module mode (только basename) */
  currentFileJs?: string;
  /**
   * Общие флаги для helper функций.
   * Объект передаётся по ссылке во все дочерние VisitorContext,
   * чтобы флаги, установленные внутри вложенных функций,
   * были видны на верхнем уровне при генерации helpers.
   */
  helperFlags: HelperFlags;
  /**
   * Контекст класса для поддержки `super`.
   * Задаётся при lowering конструктора/методов класса с `extends`.
   *
   * При встрече `super(args)` → `bt.callWithThis(baseCtorDesc, __this, [args])`
   * При встрече `super.method(args)` → `bt.callWithThis(bt.getProperty(baseCtorDesc.proto, "method"), __this, [args])`
   */
  superContext?: {
    /** TS expression родительского класса из heritage clause.
     *  Визитится через visitExpression в контексте использования. */
    baseClassExpr: ts.Expression;
  };
}

/**
 * Флаги, определяющие нужны ли helper-функции.
 * Передаётся по ссылке через все вложенные VisitorContext.
 */
export interface HelperFlags {
  /** Используется import.meta */
  usesImportMeta: boolean;
  /** Используется AbsoluteUrl */
  usesAbsoluteUrl: boolean;
  /** Нужна ли функция ObjectUnion (для spread в объектах) */
  needsObjectUnion: boolean;
}

// ============================================================================
// Main entry point
// ============================================================================

/**
 * Преобразует TypeScript SourceFile в IR Program
 * 
 * Основная точка входа для lowering. Создаёт контекст и координирует
 * обход всех statements исходного файла.
 * 
 * @param sourceFile - TypeScript SourceFile для преобразования
 * @param typeChecker - TypeScript TypeChecker для определения типов
 * @param scopeAnalysis - Результат анализа scopes
 * @returns IR Program
 */
export interface TransformToIROptions {
  /** Режим транспиляции (default: script) */
  mode?: CompileMode;
  /** Ключ файла для script mode (packageName+version+relativePath) */
  fileKey?: string;
  /** Имя текущего .js файла для module mode (только basename) */
  currentFileJs?: string;
}

/**
 * @param options - Опции lowering (mode и т.д.)
 */
export function transformToIR(
  sourceFile: ts.SourceFile,
  typeChecker: ts.TypeChecker,
  scopeAnalysis: ScopeAnalysisResult,
  options: TransformToIROptions = {}
): IRProgram {
  const ctx: VisitorContext = {
    mode: options.mode ?? "script",
    functionParams: new Map(),
    hoistedFunctions: [],
    typeChecker,
    sourceFile,
    bindings: scopeAnalysis.bindings,
    scopeAnalysis,
    currentScope: scopeAnalysis.moduleScope,
    pendingStatements: [],
    currentEnvRef: "__env",
    currentEnvScope: scopeAnalysis.moduleScope,
    xmlDocumentSymbol: findSymbolByName(typeChecker, sourceFile, "XmlDocument"),
    xmlElemSymbol: findSymbolByName(typeChecker, sourceFile, "XmlElem"),
    importBindings: new Map(),
    fileKey: options.fileKey,
    currentFileJs: options.currentFileJs
      ?? ((options.mode ?? "script") === "module"
        ? path.basename(sourceFile.fileName).replace(/\.tsx?$/, ".js")
        : undefined),
    helperFlags: { usesImportMeta: false, usesAbsoluteUrl: false, needsObjectUnion: false },
  };

  const isModuleMode = ctx.mode === "module";
  const body: IRStatement[] = [];

  if (ctx.mode === "script") {
    // Script: __env = {} на top-level (bare не нуждается в __env)
    body.push(IR.envDecl("__env", null));
  }

  // Обрабатываем все statements
  for (const statement of sourceFile.statements) {
    const irNodes = visitStatement(statement, ctx);

    // Flush pending statements (от arrow функций и т.д.) ПЕРЕД результатом,
    // чтобы дескрипторы и __env-регистрации шли до их использования
    if (ctx.pendingStatements.length > 0) {
      body.push(...ctx.pendingStatements);
      ctx.pendingStatements.length = 0;
    }

    if (irNodes) {
      if (Array.isArray(irNodes)) {
        body.push(...irNodes);
      } else {
        body.push(irNodes);
      }
    }
  }

  // Flush remaining pending statements
  if (ctx.pendingStatements.length > 0) {
    body.push(...ctx.pendingStatements);
  }

  // Helper-функции (ObjectUnion при spread в объектах) — в самом начале
  const helperFunctions: IRStatement[] = ctx.helperFlags.needsObjectUnion ? [createObjectUnionFunction()] : [];

  // import.meta и AbsoluteUrl helpers: BT-функции, зарегистрированные в __env
  const helperSetupStatements: IRStatement[] = [];

  if (ctx.helperFlags.usesImportMeta && (ctx.mode === "script" || ctx.mode === "module")) {
    const fileRef =
      ctx.mode === "script" && ctx.fileKey
        ? IR.call(IR.dot(IR.id("bt"), "getFileUrl"), [IR.string(ctx.fileKey)])
        : ctx.mode === "module" && ctx.currentFileJs
          ? IR.call(IR.id("AbsoluteUrl"), [IR.string(ctx.currentFileJs)])
          : null;
    if (fileRef) {
      const metaHelpers: Array<{ name: string; returnExpr: import("../ir/index.ts").IRExpression }> = [
        { name: "__ImportMeta_dirPath", returnExpr: IR.call(IR.id("UrlToFilePath"), [IR.call(IR.id("UrlParent"), [fileRef])]) },
        { name: "__ImportMeta_dirUrl", returnExpr: IR.call(IR.id("UrlParent"), [fileRef]) },
        { name: "__ImportMeta_filePath", returnExpr: IR.call(IR.id("UrlToFilePath"), [fileRef]) },
        { name: "__ImportMeta_fileUrl", returnExpr: fileRef },
      ];
      for (const helper of metaHelpers) {
        // Функция: function __ImportMeta_X(__env, __this, __args) { return ...; }
        ctx.hoistedFunctions.push(
          IR.functionDecl(helper.name, [], [IR.return(helper.returnExpr)])
        );
        // Дескриптор + регистрация в __env
        const descName = `${helper.name}_desc`;
        const descProps = [
          IR.prop("@descriptor", IR.string("function")),
          IR.prop("obj", IR.id("undefined")),
          IR.prop("env", IR.id("__env")),
        ];
        if (isModuleMode) {
          descProps.push(IR.prop("ref", IR.string(helper.name)));
          descProps.push(IR.prop("lib", IR.dot(IR.id("__env"), "__codelibrary")));
        } else {
          descProps.push(IR.prop("callable", IR.id(helper.name)));
        }
        helperSetupStatements.push(
          IR.varDecl(descName, IR.object(descProps)),
          IR.exprStmt(IR.assign("=", IR.dot(IR.id("__env"), helper.name), IR.id(descName)))
        );
      }
    }
  }

  if (ctx.helperFlags.usesAbsoluteUrl && (ctx.mode === "script" || ctx.mode === "module")) {
    // __AbsoluteUrl: обычная BT-функция с параметрами url, baseUrl
    const whenUndefined =
      ctx.mode === "script"
        // Внутри __AbsoluteUrl: __env.__ImportMeta_dirUrl доступен через __env (он параметр)
        ? IR.call(IR.id("UrlAppendPath"), [
            IR.btCallFunction(IR.dot(IR.id("__env"), "__ImportMeta_dirUrl"), []),
            IR.id("url"),
          ])
        : IR.call(IR.id("AbsoluteUrl"), [IR.id("url")]);
    const whenDefined = IR.call(IR.id("AbsoluteUrl"), [IR.id("url"), IR.id("baseUrl")]);
    const ret = IR.return(
      IR.conditional(
        IR.binary("===", IR.id("baseUrl"), IR.id("undefined")),
        whenUndefined,
        whenDefined
      )
    );
    ctx.hoistedFunctions.push(
      IR.functionDecl("__AbsoluteUrl", [IR.param("url"), IR.param("baseUrl")], [ret])
    );
    // Дескриптор + регистрация
    const absDescProps = [
      IR.prop("@descriptor", IR.string("function")),
      IR.prop("obj", IR.id("undefined")),
      IR.prop("env", IR.id("__env")),
    ];
    if (isModuleMode) {
      absDescProps.push(IR.prop("ref", IR.string("__AbsoluteUrl")));
      absDescProps.push(IR.prop("lib", IR.dot(IR.id("__env"), "__codelibrary")));
    } else {
      absDescProps.push(IR.prop("callable", IR.id("__AbsoluteUrl")));
    }
    helperSetupStatements.push(
      IR.varDecl("__AbsoluteUrl_desc", IR.object(absDescProps)),
      IR.exprStmt(IR.assign("=", IR.dot(IR.id("__env"), "__AbsoluteUrl"), IR.id("__AbsoluteUrl_desc")))
    );
  }

  if (isModuleMode) {
    // Module: только функции на top-level, весь код в __init(__codelibrary, __module)
    const initBody: IRStatement[] = [
      IR.envDecl("__env", null),
      IR.envAssign("__env", "__codelibrary", IR.id("__codelibrary")),
      ...helperSetupStatements,
      ...body,
    ];
    const initFunc = IR.functionDecl(
      "__init",
      [IR.param("__codelibrary"), IR.param("__module")],
      initBody,
      undefined,
      true // plainSignature: __init(__codelibrary, __module)
    );
    return IR.program([...helperFunctions, ...ctx.hoistedFunctions, initFunc], sourceFile.fileName);
  }

  // Script mode: вставляем helperSetupStatements сразу после __env (index 0 = __env decl)
  if (helperSetupStatements.length > 0) {
    body.splice(1, 0, ...helperSetupStatements);
  }

  const isBare = ctx.mode === "bare";
  return IR.program([...helperFunctions, ...ctx.hoistedFunctions, ...body], sourceFile.fileName, isBare);
}

// ============================================================================
// Re-exports for convenience
// ============================================================================

export { visitStatement, visitStatementList, visitBlock } from "./statements.ts";
export { visitExpression, visitIdentifier } from "./expressions.ts";
export {
  getLoc,
  getPolyfillType,
  isInternalAccess,
  isXmlRelatedType,
  findSymbolByName,
  isBuiltinFunction,
  isAssignmentOperator,
  getAssignmentOperator,
  getUnaryOperator,
  resolveVariableInScope,
  isScopeInsideOrEqual,
  getAllScopes,
  getCapturedVariablesInScope,
  collectCapturedVarsForArrow,
} from "./helpers.ts";
