/**
 * Scope Analyzer - анализ областей видимости и захваченных переменных
 *
 * Определяет какие переменные используются во вложенных scopes (captured)
 * и строит дерево scopes для генерации __env chain.
 *
 * @module analyzer
 */

import * as ts from "typescript";
import { BindingManager } from "../lowering/binding.ts";

/**
 * Информация о переменной
 */
export interface VariableInfo {
  /** Имя переменной */
  name: string;
  /** Тип объявления */
  kind: "const" | "let" | "var" | "function" | "parameter" | "import";
  /** Scope где объявлена переменная */
  declarationScope: Scope;
  /** Используется ли во вложенных scopes (требует __env) */
  isCaptured: boolean;
  /** Scopes где используется эта переменная */
  usedInScopes: Set<Scope>;
  /** Переименованное имя (если shadowing) */
  renamedTo?: string;
}

/**
 * Область видимости
 */
export interface Scope {
  /** Уникальный id scope */
  id: number;
  /** Тип scope */
  type: "module" | "function" | "block";
  /** Имя (для функций) */
  name?: string;
  /** Родительский scope */
  parent: Scope | null;
  /** Дочерние scopes */
  children: Scope[];
  /** Переменные объявленные в этом scope */
  variables: Map<string, VariableInfo>;
  /** Соответствующая TS нода */
  node: ts.Node;
  /** Глубина вложенности функций (для генерации __env.__parent chain) */
  depth: number;
  /** Есть ли captured переменные в этом scope */
  hasCaptured: boolean;
}

/**
 * Результат анализа
 */
export interface ScopeAnalysisResult {
  /** Корневой scope (module) */
  moduleScope: Scope;
  /** Все scopes по id */
  scopesById: Map<number, Scope>;
  /** Карта: TS Node -> Scope */
  nodeToScope: Map<ts.Node, Scope>;
  /** Все captured переменные */
  capturedVariables: VariableInfo[];
  /** Менеджер генерации имён (shared с visitor) */
  bindings: BindingManager;
}

let scopeIdCounter = 0;
let currentBindings: BindingManager;

/**
 * Анализирует scopes в исходном файле
 * @param sourceFile - TypeScript source file
 * @param bindings - Менеджер генерации имён (опциональный, создаётся если не передан)
 */
export function analyzeScopes(
  sourceFile: ts.SourceFile,
  bindings: BindingManager = new BindingManager(),
): ScopeAnalysisResult {
  scopeIdCounter = 0;
  currentBindings = bindings;

  const moduleScope: Scope = {
    id: scopeIdCounter++,
    type: "module",
    name: "__module",
    parent: null,
    children: [],
    variables: new Map(),
    node: sourceFile,
    depth: 0,
    hasCaptured: false,
  };

  const scopesById = new Map<number, Scope>();
  const nodeToScope = new Map<ts.Node, Scope>();
  const allVariables: VariableInfo[] = [];

  scopesById.set(moduleScope.id, moduleScope);
  nodeToScope.set(sourceFile, moduleScope);

  // Pass 1: Собираем все scopes и объявления переменных
  collectScopesAndDeclarations(sourceFile, moduleScope, scopesById, nodeToScope, allVariables);

  // Pass 1.5: Разрешаем конфликты между var (hoisted) и let/const (block-scoped)
  // var hoists на function/module level, let/const остаются в block scope
  // Если есть var X и let X в том же function/module — переименовываем let
  resolveVarLetConflicts(moduleScope, allVariables);

  // Регистрируем все имена из исходного кода в BindingManager
  // чтобы избежать коллизий при генерации временных переменных
  // Включаем и оригинальные имена, и переименованные
  const sourceNames = allVariables.flatMap((v) => (v.renamedTo ? [v.name, v.renamedTo] : [v.name]));
  bindings.registerSourceNames(sourceNames);

  // Pass 2: Анализируем использования и помечаем captured
  analyzeUsages(sourceFile, moduleScope, nodeToScope);

  // Помечаем scopes которые содержат captured переменные
  const capturedVariables: VariableInfo[] = [];
  for (const varInfo of allVariables) {
    if (varInfo.isCaptured) {
      capturedVariables.push(varInfo);
      varInfo.declarationScope.hasCaptured = true;
    }
  }

  // Pass 3: Пересчитываем depth с учётом hasCaptured
  // depth увеличивается только при переходе к scope с hasCaptured
  recalculateDepth(moduleScope, 0);

  return { moduleScope, scopesById, nodeToScope, capturedVariables, bindings };
}

/**
 * Пересчитывает depth для всех scopes
 * depth увеличивается только при переходе к scope с hasCaptured
 * (scopes которые создают свой __env)
 */
function recalculateDepth(scope: Scope, currentDepth: number): void {
  scope.depth = currentDepth;

  for (const child of scope.children) {
    // Только scopes с hasCaptured создают свой __env
    if (child.hasCaptured) {
      recalculateDepth(child, currentDepth + 1);
    } else {
      recalculateDepth(child, currentDepth);
    }
  }
}

// TODO: зачем у нас тут _allVariables вообще?
/**
 * Разрешает конфликты между var (hoisted) и let/const (block-scoped)
 *
 * В BorisScript нет block scope — все переменные становятся var.
 * Если в одном function/module scope есть:
 * - var X (hoisted на function/module level)
 * - let X или const X в block scope
 *
 * То let/const должен быть переименован чтобы избежать конфликта.
 */
function resolveVarLetConflicts(moduleScope: Scope, _allVariables: VariableInfo[]): void {
  // Для каждого function/module scope собираем все var имена
  const functionScopes = collectFunctionScopes(moduleScope);

  for (const funcScope of functionScopes) {
    // Собираем все var имена в этом function scope (включая hoisted из blocks)
    const varNames = new Set<string>();
    collectVarNames(funcScope, varNames);

    // Проверяем все let/const в block scopes внутри этой функции
    renameConflictingLetConst(funcScope, varNames);
  }
}

/**
 * Собирает все function/module scopes (не block scopes)
 */
function collectFunctionScopes(scope: Scope): Scope[] {
  const result: Scope[] = [scope];

  for (const child of scope.children) {
    if (child.type === "function") {
      result.push(...collectFunctionScopes(child));
    } else {
      // block scope — ищем функции внутри
      result.push(...collectFunctionScopes(child));
    }
  }

  return result.filter((s) => s.type === "function" || s.type === "module");
}

/**
 * Собирает все var имена в scope и его children (var hoists)
 */
function collectVarNames(scope: Scope, varNames: Set<string>): void {
  for (const varInfo of scope.variables.values()) {
    if (varInfo.kind === "var") {
      varNames.add(varInfo.name);
    }
  }

  for (const child of scope.children) {
    // var hoists из block scopes, но не из function scopes
    if (child.type === "block") {
      collectVarNames(child, varNames);
    }
  }
}

/**
 * Переименовывает let/const которые конфликтуют с var
 */
function renameConflictingLetConst(scope: Scope, varNames: Set<string>): void {
  for (const varInfo of scope.variables.values()) {
    if ((varInfo.kind === "const" || varInfo.kind === "let") && !varInfo.renamedTo) {
      if (varNames.has(varInfo.name)) {
        // Конфликт! Переименовываем let/const
        varInfo.renamedTo = currentBindings.shadow(varInfo.name);
      }
    }
  }

  for (const child of scope.children) {
    // Рекурсивно проверяем children (кроме function — у них свой scope)
    if (child.type !== "function") {
      renameConflictingLetConst(child, varNames);
    }
  }
}

/**
 * Pass 1: Собираем scopes и объявления
 */
function collectScopesAndDeclarations(
  node: ts.Node,
  currentScope: Scope,
  scopesById: Map<number, Scope>,
  nodeToScope: Map<ts.Node, Scope>,
  allVariables: VariableInfo[],
): void {
  // Function создаёт новый scope
  if (
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isConstructorDeclaration(node)
  ) {
    const funcName = getFunctionName(node);
    const funcScope: Scope = {
      id: scopeIdCounter++,
      type: "function",
      name: funcName,
      parent: currentScope,
      children: [],
      variables: new Map(),
      node,
      depth: currentScope.depth + 1,
      hasCaptured: false,
    };

    currentScope.children.push(funcScope);
    scopesById.set(funcScope.id, funcScope);
    nodeToScope.set(node, funcScope);

    // Регистрируем функцию как переменную в родительском scope (для FunctionDeclaration)
    if (ts.isFunctionDeclaration(node) && funcName) {
      registerVariable(currentScope, funcName, "function", allVariables);
    }

    // Параметры функции - в scope функции
    if ("parameters" in node) {
      for (const param of node.parameters) {
        if (ts.isIdentifier(param.name)) {
          registerVariable(funcScope, param.name.text, "parameter", allVariables);
        }
        // TODO: деструктуризация параметров
      }
    }

    // Рекурсивно обрабатываем тело функции
    if ("body" in node && node.body) {
      ts.forEachChild(node.body, (child) =>
        collectScopesAndDeclarations(child, funcScope, scopesById, nodeToScope, allVariables),
      );
    }
    return;
  }

  // Block statement (if body, while body, etc.) создаёт block scope для let/const
  // Исключаем тела функций — они уже обработаны выше
  if (ts.isBlock(node) && !isFunctionBody(node)) {
    const blockScope: Scope = {
      id: scopeIdCounter++,
      type: "block",
      name: `__block_${scopeIdCounter}`,
      parent: currentScope,
      children: [],
      variables: new Map(),
      node,
      depth: currentScope.depth,
      hasCaptured: false,
    };

    currentScope.children.push(blockScope);
    scopesById.set(blockScope.id, blockScope);
    nodeToScope.set(node, blockScope);

    // Рекурсивно обрабатываем содержимое блока
    ts.forEachChild(node, (child) =>
      collectScopesAndDeclarations(child, blockScope, scopesById, nodeToScope, allVariables),
    );
    return;
  }

  // Variable declarations
  // var → hoistится в function/module scope
  // let/const → остаётся в текущем scope (block scoping)
  if (ts.isVariableStatement(node)) {
    const declList = node.declarationList;
    const kind = getVarKind(declList);

    for (const decl of declList.declarations) {
      if (ts.isIdentifier(decl.name)) {
        // var hoistится, let/const остаётся в текущем scope
        const targetScope = kind === "var" ? findFunctionOrModuleScope(currentScope) : currentScope;
        registerVariable(targetScope, decl.name.text, kind, allVariables);
      } else if (ts.isArrayBindingPattern(decl.name) || ts.isObjectBindingPattern(decl.name)) {
        const targetScope = kind === "var" ? findFunctionOrModuleScope(currentScope) : currentScope;
        for (const element of decl.name.elements) {
          if (ts.isBindingElement(element) && ts.isIdentifier(element.name)) {
            registerVariable(targetScope, element.name.text, kind, allVariables);
          }
        }
      }
    }
  }

  // For statement может объявлять переменную
  if (
    ts.isForStatement(node) &&
    node.initializer &&
    ts.isVariableDeclarationList(node.initializer)
  ) {
    const kind = getVarKind(node.initializer);
    for (const decl of node.initializer.declarations) {
      if (ts.isIdentifier(decl.name)) {
        // var hoistится, let/const остаётся в текущем scope
        const targetScope = kind === "var" ? findFunctionOrModuleScope(currentScope) : currentScope;
        registerVariable(targetScope, decl.name.text, kind, allVariables);
      }
    }
  }

  // For-of/for-in statement создаёт block scope для тела цикла
  // let/const item создаётся заново на каждой итерации
  if (
    (ts.isForOfStatement(node) || ts.isForInStatement(node)) &&
    ts.isVariableDeclarationList(node.initializer)
  ) {
    const kind = getVarKind(node.initializer);

    if (kind === "var") {
      // var hoistится в function scope
      for (const decl of node.initializer.declarations) {
        if (ts.isIdentifier(decl.name)) {
          const targetScope = findFunctionOrModuleScope(currentScope);
          registerVariable(targetScope, decl.name.text, kind, allVariables);
        }
      }
    } else {
      // let/const создаёт block scope для per-iteration semantics
      const loopBodyScope: Scope = {
        id: scopeIdCounter++,
        type: "block",
        name: `__loop_${scopeIdCounter}`,
        parent: currentScope,
        children: [],
        variables: new Map(),
        node: node.statement, // Тело цикла
        depth: currentScope.depth, // Block не увеличивает depth изначально
        hasCaptured: false,
      };

      currentScope.children.push(loopBodyScope);
      scopesById.set(loopBodyScope.id, loopBodyScope);
      nodeToScope.set(node.statement, loopBodyScope);

      // Регистрируем let/const переменную в block scope
      for (const decl of node.initializer.declarations) {
        if (ts.isIdentifier(decl.name)) {
          registerVariable(loopBodyScope, decl.name.text, kind, allVariables);
        }
      }

      // Рекурсивно обрабатываем тело цикла в его scope
      ts.forEachChild(node.statement, (child) =>
        collectScopesAndDeclarations(child, loopBodyScope, scopesById, nodeToScope, allVariables),
      );
      return; // Не обрабатываем дальше, уже обработали тело цикла
    }
  }

  // Catch clause параметр — НЕ регистрируем как var.
  // Параметр catch(err) является локальным для catch-блока,
  // hoisting в function scope приводит к тому, что var err; затеняет catch-параметр.
  // BorisScript нативно поддерживает catch(err), поэтому hoisting не нужен.

  // ClassDeclaration — регистрируем имя класса как функцию (конструктор) в текущем scope
  // Аналогично FunctionDeclaration: конструктор регистрируется в __env,
  // доступ из других функций идёт через __env цепочку
  if (ts.isClassDeclaration(node) && node.name) {
    const targetScope = findFunctionOrModuleScope(currentScope);
    registerVariable(targetScope, node.name.text, "function", allVariables);
  }

  // Import declarations — регистрируем импортированные имена в module scope (кроме type-only)
  if (ts.isImportDeclaration(node)) {
    const moduleSpecifier = node.moduleSpecifier;
    if (!ts.isStringLiteral(moduleSpecifier)) {
      ts.forEachChild(node, (child) =>
        collectScopesAndDeclarations(child, currentScope, scopesById, nodeToScope, allVariables),
      );
      return;
    }

    const targetScope = findFunctionOrModuleScope(currentScope);
    if (node.importClause) {
      // import X from "Y" — default import
      if (node.importClause.name && !node.importClause.isTypeOnly) {
        registerVariable(targetScope, node.importClause.name.text, "import", allVariables);
      }
      // import { a, b as c } or import type { X }
      if (node.importClause.namedBindings && ts.isNamedImports(node.importClause.namedBindings)) {
        for (const element of node.importClause.namedBindings.elements) {
          if (!element.isTypeOnly) {
            const localName = element.name.text;
            registerVariable(targetScope, localName, "import", allVariables);
          }
        }
      }
      // import * as ns from "Y"
      if (
        node.importClause.namedBindings &&
        ts.isNamespaceImport(node.importClause.namedBindings)
      ) {
        registerVariable(
          targetScope,
          node.importClause.namedBindings.name.text,
          "import",
          allVariables,
        );
      }
    }
    return;
  }

  // Рекурсивно обходим детей
  ts.forEachChild(node, (child) =>
    collectScopesAndDeclarations(child, currentScope, scopesById, nodeToScope, allVariables),
  );
}

/**
 * Pass 2: Анализируем использования переменных
 */
function analyzeUsages(node: ts.Node, currentScope: Scope, nodeToScope: Map<ts.Node, Scope>): void {
  // Обновляем текущий scope если нода создаёт новый
  // НО: block scopes (для циклов с let/const) НЕ меняют scope для usages
  // Block scope нужен только для loop variable
  const nodeScope = nodeToScope.get(node);
  if (nodeScope && nodeScope !== currentScope && nodeScope.type !== "block") {
    currentScope = nodeScope;
  }

  // Identifier usage
  if (ts.isIdentifier(node)) {
    // Пропускаем объявления, property names и т.д.
    if (!isVariableUsage(node)) {
      return;
    }

    const name = node.text;
    const varInfo = resolveVariable(name, currentScope);

    if (varInfo) {
      varInfo.usedInScopes.add(currentScope);

      // Если используется в scope отличном от объявления - captured
      if (varInfo.declarationScope !== currentScope) {
        // Проверяем что currentScope вложен в declarationScope
        if (isScopeNestedIn(currentScope, varInfo.declarationScope)) {
          varInfo.isCaptured = true;
        }
      }
    }
  }

  ts.forEachChild(node, (child) => analyzeUsages(child, currentScope, nodeToScope));
}

// =========================================================================
// Helper functions
// =========================================================================

function getFunctionName(node: ts.Node): string | undefined {
  if (ts.isFunctionDeclaration(node) && node.name) {
    return node.name.text;
  }
  if (ts.isMethodDeclaration(node) && ts.isIdentifier(node.name)) {
    return node.name.text;
  }
  if (ts.isFunctionExpression(node) && node.name) {
    return node.name.text;
  }
  return undefined;
}

function getVarKind(declList: ts.VariableDeclarationList): "const" | "let" | "var" {
  if (declList.flags & ts.NodeFlags.Const) return "const";
  if (declList.flags & ts.NodeFlags.Let) return "let";
  return "var";
}

function findFunctionOrModuleScope(scope: Scope): Scope {
  let current: Scope | null = scope;
  while (current) {
    if (current.type === "function" || current.type === "module") {
      return current;
    }
    current = current.parent;
  }
  return scope; // fallback
}

function registerVariable(
  scope: Scope,
  name: string,
  kind: VariableInfo["kind"],
  allVariables: VariableInfo[],
): VariableInfo {
  // Если переменная уже есть в этом scope - возвращаем её (дедупликация)
  const existing = scope.variables.get(name);
  if (existing) {
    return existing;
  }

  // Проверяем shadowing — есть ли переменная с таким именем в parent scopes
  // Для let/const в block scope нужно переименовать если есть shadowing
  let renamedTo: string | undefined;
  if (kind === "const" || kind === "let") {
    const shadowedVar = findVariableInParentScopes(name, scope.parent);
    if (shadowedVar) {
      // Генерируем уникальное имя через BindingManager
      renamedTo = currentBindings.shadow(name);
    }
  }

  const varInfo: VariableInfo = {
    name,
    kind,
    declarationScope: scope,
    isCaptured: false,
    usedInScopes: new Set(),
    renamedTo,
  };

  scope.variables.set(name, varInfo);
  allVariables.push(varInfo);
  return varInfo;
}

/**
 * Ищет переменную в parent scopes (не в текущем)
 */
function findVariableInParentScopes(name: string, fromScope: Scope | null): VariableInfo | null {
  let current = fromScope;
  while (current) {
    const varInfo = current.variables.get(name);
    if (varInfo) {
      return varInfo;
    }
    current = current.parent;
  }
  return null;
}

function resolveVariable(name: string, fromScope: Scope): VariableInfo | null {
  // Ищем переменную вверх по цепочке scopes
  let current: Scope | null = fromScope;
  while (current) {
    const varInfo = current.variables.get(name);
    if (varInfo) {
      return varInfo;
    }
    current = current.parent;
  }
  return null;
}

/**
 * Проверяет, является ли Block телом функции
 */
function isFunctionBody(node: ts.Block): boolean {
  const parent = node.parent;
  return (
    ts.isFunctionDeclaration(parent) ||
    ts.isFunctionExpression(parent) ||
    ts.isArrowFunction(parent) ||
    ts.isMethodDeclaration(parent) ||
    ts.isConstructorDeclaration(parent) ||
    ts.isGetAccessorDeclaration(parent) ||
    ts.isSetAccessorDeclaration(parent)
  );
}

function isScopeNestedIn(inner: Scope, outer: Scope): boolean {
  let current: Scope | null = inner.parent;
  while (current) {
    if (current === outer) return true;
    current = current.parent;
  }
  return false;
}

function isVariableUsage(node: ts.Identifier): boolean {
  const parent = node.parent;

  // Не считаем использованием:
  // - Имя в объявлении переменной
  if (ts.isVariableDeclaration(parent) && parent.name === node) return false;
  // - Имя функции в объявлении
  if (ts.isFunctionDeclaration(parent) && parent.name === node) return false;
  // - Имя параметра
  if (ts.isParameter(parent) && parent.name === node) return false;
  // - Property name в object literal
  if (ts.isPropertyAssignment(parent) && parent.name === node) return false;
  // - Shorthand property (но значение - использование)
  if (ts.isShorthandPropertyAssignment(parent) && parent.name === node) {
    // В shorthand `{ a }` - 'a' используется как значение
    return true;
  }
  // - Method name
  if (ts.isMethodDeclaration(parent) && parent.name === node) return false;
  // - Property access .name
  if (ts.isPropertyAccessExpression(parent) && parent.name === node) return false;
  // - Import/export specifiers
  if (ts.isImportSpecifier(parent) || ts.isExportSpecifier(parent)) return false;
  // - Type references
  if (ts.isTypeReferenceNode(parent)) return false;
  // - Labeled statement
  if (ts.isLabeledStatement(parent) && parent.label === node) return false;
  // - Break/continue label
  if ((ts.isBreakStatement(parent) || ts.isContinueStatement(parent)) && parent.label === node)
    return false;

  return true;
}

// =========================================================================
// Debug utilities
// =========================================================================

/**
 * Выводит дерево scopes в консоль (для отладки)
 */
export function printScopeTree(scope: Scope, indent = 0): void {
  const pad = "  ".repeat(indent);
  const vars = Array.from(scope.variables.values());
  const capturedVars = vars.filter((v) => v.isCaptured).map((v) => `${v.name}*`);
  const normalVars = vars.filter((v) => !v.isCaptured).map((v) => v.name);

  console.log(`${pad}[${scope.type}] ${scope.name || ""} (depth=${scope.depth})`);
  if (normalVars.length) console.log(`${pad}  vars: ${normalVars.join(", ")}`);
  if (capturedVars.length) console.log(`${pad}  CAPTURED: ${capturedVars.join(", ")}`);

  for (const child of scope.children) {
    printScopeTree(child, indent + 1);
  }
}

/**
 * Вычисляет глубину __env chain между двумя scopes
 * Используется для генерации __env.__parent.__parent...
 *
 * Считает только scopes с hasCaptured (которые создают свой __env)
 *
 * fromScope должен быть потомком toScope (или равен ему).
 * Если toScope не найден в цепочке parent, возвращает 0
 * (защита от некорректного вызова).
 */
export function getEnvDepth(fromScope: Scope, toScope: Scope): number {
  let depth = 0;
  let current: Scope | null = fromScope;

  while (current && current !== toScope) {
    // Считаем только scopes которые создают свой __env
    if (current.hasCaptured) {
      depth++;
    }
    current = current.parent;
  }

  // Защита: toScope не найден в parent chain — некорректный вызов
  if (!current) {
    return 0;
  }

  return depth;
}
