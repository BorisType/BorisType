/**
 * IR Node Types - определения всех нод промежуточного представления
 *
 * IR (Intermediate Representation) — промежуточное представление кода
 * между TypeScript AST и выходным BorisScript.
 *
 * Ключевые принципы:
 * 1. IR уже не содержит конструкций, отсутствующих в BorisScript
 *    (let/const, arrow functions, destructuring, etc.)
 * 2. Каждая нода минимальна и самодостаточна
 * 3. Все ноды иммутабельны
 *
 * @module ir/nodes
 */

// ============================================================================
// Source Location (для source maps)
// ============================================================================

/**
 * Позиция в исходном коде
 */
export interface SourcePosition {
  /** Номер строки (1-based) */
  line: number;
  /** Номер колонки (0-based) */
  column: number;
}

/**
 * Диапазон в исходном коде
 */
export interface SourceLocation {
  /** Начало диапазона */
  start: SourcePosition;
  /** Конец диапазона */
  end: SourcePosition;
  /** Путь к исходному файлу */
  source?: string;
}

// ============================================================================
// Base Types
// ============================================================================

/**
 * Базовый интерфейс для всех IR нод
 */
export interface IRNodeBase {
  /** Тип ноды (discriminant) */
  kind: string;
  /** Позиция в исходном коде (опционально) */
  loc?: SourceLocation;
}

/**
 * Объединение всех типов нод
 */
export type IRNode = IRProgram | IRStatement | IRExpression;

/**
 * Объединение всех statement нод
 */
export type IRStatement =
  | IRFunctionDeclaration
  | IRVariableDeclaration
  | IRReturnStatement
  | IRExpressionStatement
  | IRIfStatement
  | IRForStatement
  | IRForInStatement
  | IRWhileStatement
  | IRDoWhileStatement
  | IRSwitchStatement
  | IRCaseClause
  | IRTryStatement
  | IRThrowStatement
  | IRBreakStatement
  | IRContinueStatement
  | IRBlockStatement
  | IREmptyStatement
  // Environment
  | IREnvDeclaration
  | IREnvAssign;

/**
 * Объединение всех expression нод
 */
export type IRExpression =
  | IRIdentifier
  | IRLiteral
  | IRBinaryExpression
  | IRUnaryExpression
  | IRConditionalExpression
  | IRLogicalExpression
  | IRCallExpression
  | IRMemberExpression
  | IRArrayExpression
  | IRObjectExpression
  | IRAssignmentExpression
  | IRUpdateExpression
  | IRSequenceExpression
  // Special
  | IRArgsAccess
  | IREnvAccess
  | IRPolyfillCall
  | IRRuntimeCall
  // BT runtime calls
  | IRBTGetProperty
  | IRBTSetProperty
  | IRBTCallFunction
  | IRBTIsFunction
  | IRGroupingExpression;

// ============================================================================
// Program
// ============================================================================

/**
 * Корневая нода программы
 */
export interface IRProgram extends IRNodeBase {
  kind: "Program";
  /** Тело программы (statements верхнего уровня) */
  body: IRStatement[];
  /** Имя исходного файла */
  sourceFile?: string;
  /**
   * Если true, эмиттер не выполняет hoisting функций и переменных.
   * Используется в bare-режиме для 1:1 трансляции.
   */
  noHoist?: boolean;
}

// ============================================================================
// Statements
// ============================================================================

/**
 * Объявление функции
 *
 * В BorisScript все функции имеют сигнатуру:
 * `function name(__env, __this, __args) { ... }`
 */
export interface IRFunctionDeclaration extends IRNodeBase {
  kind: "FunctionDeclaration";
  /** Имя функции */
  name: string;
  /** Оригинальные имена параметров (для извлечения из __args) */
  originalParams: IRFunctionParam[];
  /** Тело функции */
  body: IRStatement[];
  /** Является ли функция generator (не поддерживается в BS) */
  generator?: false;
  /** Является ли функция async (не поддерживается в BS) */
  async?: false;
  /** Plain-сигнатура: function name(p1, p2) без __env/__this/__args (для ObjectUnion и др.) */
  plainSignature?: boolean;
}

/**
 * Параметр функции
 */
export interface IRFunctionParam {
  /** Имя параметра */
  name: string;
  /** Значение по умолчанию */
  defaultValue?: IRExpression;
  /** Rest параметр (...args) */
  rest?: boolean;
  /** Параметр используется в замыкании и должен быть в __env */
  isCaptured?: boolean;
}

/**
 * Объявление переменной
 *
 * В BorisScript только `var` — все let/const преобразуются.
 */
export interface IRVariableDeclaration extends IRNodeBase {
  kind: "VariableDeclaration";
  /** Имя переменной */
  name: string;
  /** Инициализатор (может быть null для `var x;`) */
  init: IRExpression | null;
  /** Является ли переменная captured (используется в замыканиях) */
  isCaptured?: boolean;
  /** Env для captured: __env, __block0_env и т.д. */
  envRef?: string;
  /** Только hoist (var x;), без присваивания при emit */
  hoistOnly?: boolean;
}

/**
 * Return statement
 */
export interface IRReturnStatement extends IRNodeBase {
  kind: "ReturnStatement";
  /** Возвращаемое значение */
  argument: IRExpression | null;
}

/**
 * Expression statement
 */
export interface IRExpressionStatement extends IRNodeBase {
  kind: "ExpressionStatement";
  /** Выражение */
  expression: IRExpression;
}

/**
 * If statement
 */
export interface IRIfStatement extends IRNodeBase {
  kind: "IfStatement";
  /** Условие */
  test: IRExpression;
  /** Then branch */
  consequent: IRStatement;
  /** Else branch */
  alternate: IRStatement | null;
}

/**
 * Classic for loop
 */
export interface IRForStatement extends IRNodeBase {
  kind: "ForStatement";
  /** Инициализатор (var i = 0) */
  init: IRVariableDeclaration | IRExpression | null;
  /** Условие (i < n) */
  test: IRExpression | null;
  /** Обновление (i++) */
  update: IRExpression | null;
  /** Тело цикла */
  body: IRStatement;
}

/**
 * For-in loop
 *
 * В BorisScript только for-in, for-of преобразуется.
 */
export interface IRForInStatement extends IRNodeBase {
  kind: "ForInStatement";
  /** Переменная итерации */
  left: IRVariableDeclaration | IRIdentifier;
  /** Объект для итерации */
  right: IRExpression;
  /** Тело цикла */
  body: IRStatement;
}

/**
 * While loop
 */
export interface IRWhileStatement extends IRNodeBase {
  kind: "WhileStatement";
  /** Условие */
  test: IRExpression;
  /** Тело */
  body: IRStatement;
}

/**
 * Do-while loop
 */
export interface IRDoWhileStatement extends IRNodeBase {
  kind: "DoWhileStatement";
  /** Условие */
  test: IRExpression;
  /** Тело */
  body: IRStatement;
}

/**
 * Switch statement
 */
export interface IRSwitchStatement extends IRNodeBase {
  kind: "SwitchStatement";
  /** Выражение для switch */
  discriminant: IRExpression;
  /** Case clauses */
  cases: IRCaseClause[];
}

/**
 * Case clause в switch
 */
export interface IRCaseClause extends IRNodeBase {
  kind: "CaseClause";
  /** Test expression (null для default) */
  test: IRExpression | null;
  /** Тело case */
  consequent: IRStatement[];
}

/**
 * Try-catch-finally
 */
export interface IRTryStatement extends IRNodeBase {
  kind: "TryStatement";
  /** Try block */
  block: IRBlockStatement;
  /** Catch clause */
  handler: IRCatchClause | null;
  /** Finally block */
  finalizer: IRBlockStatement | null;
}

/**
 * Catch clause
 */
export interface IRCatchClause extends IRNodeBase {
  kind: "CatchClause";
  /** Имя параметра catch (e) */
  param: string | null;
  /** Тело catch */
  body: IRBlockStatement;
}

/**
 * Throw statement
 */
export interface IRThrowStatement extends IRNodeBase {
  kind: "ThrowStatement";
  /** Выбрасываемое значение */
  argument: IRExpression;
}

/**
 * Break statement
 */
export interface IRBreakStatement extends IRNodeBase {
  kind: "BreakStatement";
  /** Label (опционально) */
  label?: string;
}

/**
 * Continue statement
 */
export interface IRContinueStatement extends IRNodeBase {
  kind: "ContinueStatement";
  /** Label (опционально) */
  label?: string;
}

/**
 * Block statement
 */
export interface IRBlockStatement extends IRNodeBase {
  kind: "BlockStatement";
  /** Тело блока */
  body: IRStatement[];
}

/**
 * Empty statement (;)
 */
export interface IREmptyStatement extends IRNodeBase {
  kind: "EmptyStatement";
}

// ============================================================================
// Expressions
// ============================================================================

/**
 * Identifier
 */
export interface IRIdentifier extends IRNodeBase {
  kind: "Identifier";
  /** Имя идентификатора */
  name: string;
}

/**
 * Literal (string, number, boolean, null)
 */
export interface IRLiteral extends IRNodeBase {
  kind: "Literal";
  /** Значение литерала */
  value: string | number | boolean | null;
  /** Raw представление (для emit) */
  raw: string;
}

/**
 * Binary expression (a + b, a === b, etc.)
 */
export interface IRBinaryExpression extends IRNodeBase {
  kind: "BinaryExpression";
  /** Оператор */
  operator: BinaryOperator;
  /** Левый операнд */
  left: IRExpression;
  /** Правый операнд */
  right: IRExpression;
}

export type BinaryOperator =
  | "+"
  | "-"
  | "*"
  | "/"
  | "%"
  | "=="
  | "!="
  | "==="
  | "!=="
  | "<"
  | "<="
  | ">"
  | ">="
  | "<<"
  | ">>"
  | ">>>"
  | "&"
  | "|"
  | "^"
  | "in"
  | "instanceof";

/**
 * Unary expression (!a, -a, typeof a, etc.)
 */
export interface IRUnaryExpression extends IRNodeBase {
  kind: "UnaryExpression";
  /** Оператор */
  operator: UnaryOperator;
  /** Операнд */
  argument: IRExpression;
  /** Prefix (true) или postfix (false) */
  prefix: boolean;
}

export type UnaryOperator = "-" | "+" | "!" | "~" | "typeof" | "void" | "delete";

/**
 * Conditional expression (a ? b : c)
 */
export interface IRConditionalExpression extends IRNodeBase {
  kind: "ConditionalExpression";
  /** Условие */
  test: IRExpression;
  /** Then expression */
  consequent: IRExpression;
  /** Else expression */
  alternate: IRExpression;
}

/**
 * Logical expression (a && b, a || b)
 */
export interface IRLogicalExpression extends IRNodeBase {
  kind: "LogicalExpression";
  /** Оператор */
  operator: "&&" | "||";
  /** Левый операнд */
  left: IRExpression;
  /** Правый операнд */
  right: IRExpression;
}

/**
 * Call expression
 */
export interface IRCallExpression extends IRNodeBase {
  kind: "CallExpression";
  /** Вызываемое выражение */
  callee: IRExpression;
  /** Аргументы */
  arguments: IRExpression[];
}

/**
 * Member expression (a.b или a[b])
 */
export interface IRMemberExpression extends IRNodeBase {
  kind: "MemberExpression";
  /** Объект */
  object: IRExpression;
  /** Свойство */
  property: IRExpression;
  /** Computed access (a[b]) vs dot access (a.b) */
  computed: boolean;
}

/**
 * Array expression ([a, b, c])
 */
export interface IRArrayExpression extends IRNodeBase {
  kind: "ArrayExpression";
  /** Элементы массива */
  elements: (IRExpression | null)[]; // null для holes: [1,,3]
}

/**
 * Object expression ({a: 1, b: 2})
 */
export interface IRObjectExpression extends IRNodeBase {
  kind: "ObjectExpression";
  /** Свойства объекта */
  properties: IRObjectProperty[];
}

/**
 * Object property
 */
export interface IRObjectProperty extends IRNodeBase {
  kind: "ObjectProperty";
  /** Ключ (строка или identifier) */
  key: string;
  /** Значение */
  value: IRExpression;
  /** Computed key (для [expr]: value) */
  computed?: boolean;
}

/**
 * Assignment expression (a = b, a += b, etc.)
 */
export interface IRAssignmentExpression extends IRNodeBase {
  kind: "AssignmentExpression";
  /** Оператор */
  operator: AssignmentOperator;
  /** Левая часть (lvalue) */
  left: IRIdentifier | IRMemberExpression | IREnvAccess;
  /** Правая часть */
  right: IRExpression;
}

export type AssignmentOperator =
  | "="
  | "+="
  | "-="
  | "*="
  | "/="
  | "%="
  | "<<="
  | ">>="
  | ">>>="
  | "&="
  | "|="
  | "^=";

/**
 * Update expression (++a, a++, --a, a--)
 */
export interface IRUpdateExpression extends IRNodeBase {
  kind: "UpdateExpression";
  /** Оператор */
  operator: "++" | "--";
  /** Операнд */
  argument: IRIdentifier | IRMemberExpression;
  /** Prefix (++a) или postfix (a++) */
  prefix: boolean;
}

/**
 * Sequence expression (a, b, c)
 */
export interface IRSequenceExpression extends IRNodeBase {
  kind: "SequenceExpression";
  /** Выражения */
  expressions: IRExpression[];
}

// ============================================================================
// Special Expressions (BorisScript-specific)
// ============================================================================

/**
 * Доступ к аргументам функции через __args
 *
 * Генерируется для параметров функции.
 * В emit превращается в `var param = __args[index]` в начале функции.
 */
export interface IRArgsAccess extends IRNodeBase {
  kind: "ArgsAccess";
  /** Индекс аргумента */
  index: number;
  /** Оригинальное имя параметра */
  originalName: string;
}

/**
 * Доступ к переменной через environment chain
 *
 * Для замыканий генерируется доступ через __env.__parent...
 */
export interface IREnvAccess extends IRNodeBase {
  kind: "EnvAccess";
  /** Глубина в parent chain (0 = текущий env) */
  depth: number;
  /** Имя переменной */
  key: string;
}

/**
 * Вызов polyfill функции
 *
 * Для преобразования array.map(), string.toLowerCase() и т.д.
 */
export interface IRPolyfillCall extends IRNodeBase {
  kind: "PolyfillCall";
  /** Тип полифила: "array", "string", "number", "object" */
  polyfillType: string;
  /** Имя метода */
  method: string;
  /** Target объект (первый аргумент) */
  target: IRExpression;
  /** Остальные аргументы */
  arguments: IRExpression[];
}

/**
 * Вызов runtime функции
 *
 * Для внутренних функций: __bt.array.concat, __bt.object.assign, etc.
 */
export interface IRRuntimeCall extends IRNodeBase {
  kind: "RuntimeCall";
  /** Namespace: "array", "object", etc. */
  namespace: string;
  /** Имя функции */
  method: string;
  /** Аргументы */
  arguments: IRExpression[];
}

// ============================================================================
// Environment Statements (для замыканий)
// ============================================================================

/**
 * Объявление environment объекта
 *
 * `var __module_env = {}` или `var fn__env = { __parent: __module_env }`
 */
export interface IREnvDeclaration extends IRNodeBase {
  kind: "EnvDeclaration";
  /** Имя env переменной */
  name: string;
  /** Имя родительского env (null для module scope) */
  parentEnv: string | null;
}

/**
 * Присвоение значения в env
 *
 * `__module_env.x = 42`
 */
export interface IREnvAssign extends IRNodeBase {
  kind: "EnvAssign";
  /** Имя env */
  envName: string;
  /** Ключ */
  key: string;
  /** Значение */
  value: IRExpression;
}

// ============================================================================
// BT Runtime Calls
// ============================================================================

/**
 * Получение свойства через bt.getProperty
 *
 * `bt.getProperty(obj, "prop")` или `bt.getProperty(arr, index)`
 */
export interface IRBTGetProperty extends IRNodeBase {
  kind: "BTGetProperty";
  /** Объект или массив */
  object: IRExpression;
  /** Имя свойства (строка) или индекс (выражение) */
  property: IRExpression;
}

/**
 * Установка свойства через bt.setProperty
 *
 * `bt.setProperty(obj, "prop", value)`
 */
export interface IRBTSetProperty extends IRNodeBase {
  kind: "BTSetProperty";
  /** Объект или массив */
  object: IRExpression;
  /** Имя свойства (строка) или индекс (выражение) */
  property: IRExpression;
  /** Значение */
  value: IRExpression;
}

/**
 * Вызов функции через bt.callFunction
 *
 * `bt.callFunction(func, [args])`
 */
export interface IRBTCallFunction extends IRNodeBase {
  kind: "BTCallFunction";
  /** Функция (дескриптор или идентификатор) */
  callee: IRExpression;
  /** Аргументы */
  arguments: IRExpression[];
}

/**
 * Проверка является ли значение функцией через bt.isFunction
 *
 * `bt.isFunction(value)`
 */
export interface IRBTIsFunction extends IRNodeBase {
  kind: "BTIsFunction";
  /** Проверяемое значение */
  value: IRExpression;
}

/**
 * Grouping expression (x) — явные скобки из исходного кода
 * MDN precedence 18. Сохраняет порядок вычисления в BorisScript.
 */
export interface IRGroupingExpression extends IRNodeBase {
  kind: "GroupingExpression";
  /** Выражение в скобках */
  expression: IRExpression;
}
