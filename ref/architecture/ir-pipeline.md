# Архитектура IR Pipeline

## Обзор

BT-IR — бэкенд транспиляции TypeScript → BorisScript на основе **промежуточного представления (IR)**, заменивший систему TypeScript трансформеров.

**Статус:** ✅ **Полностью реализован и интегрирован в btc**

## Преимущества IR над трансформерами

### Проблемы старых трансформеров

1. **Порядок зависимостей** — трансформеры зависели друг от друга, порядок был критичен
2. **Мутабельность AST** — TypeScript AST мутировался in-place, сложно отслеживать изменения
3. **Нет глобального state** — каждый трансформер работал изолированно
4. **Сложность отладки** — промежуточные состояния не видны
5. **Некорректная логика** — некоторые трансформеры имели баги из-за сложности

### Преимущества IR

1. **Декларативность** — IR явно описывает целевую семантику BorisScript
2. **Упрощённый код-генератор** — emitter работает с простой структурой
3. **Единый проход** — все трансформации в одном lowering visitor
4. **Легкая отладка** — IR можно инспектировать между этапами
5. **Оптимизация** — можно добавить IR → IR проходы (future)
6. **Source Maps** — проще генерировать маппинг позиций (planned)

---

## Pipeline Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        BT-IR Pipeline                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌───────────┐    ┌───────────┐    ┌───────────┐    ┌────────┐ │
│  │ TypeScript│    │   Scope   │    │    IR     │    │   BT   │ │
│  │  Parser   │───▶│ Analyzer  │───▶│ Lowering  │───▶│ Emitter│ │
│  │  (TS API) │    │           │    │           │    │        │ │
│  └───────────┘    └───────────┘    └───────────┘    └────────┘ │
│                                                                  │
│       ▲                 │                              │         │
│       │                 ▼                              ▼         │
│   TS Program       Scope Tree                    BorisScript    │
│   TypeChecker      Captured vars                                │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Компоненты

#### 1. Parser (TypeScript Frontend)

- Использует TypeScript Compiler API
- TypeChecker для типов (определение polyfills, type inference)
- Создаёт TS Program для watch mode совместимости
- **Не генерирует код** — только диагностика (`noEmit: true` в btc)

#### 2. Scope Analyzer

**Расположение:** `src/analyzer/`

**Функции:**

- Анализ областей видимости (scope tree)
- Определение **captured переменных** (замыкания)
- Построение `__env` chain для closures
- Определение каких переменных нужно поднять в env

**Алгоритм:**

1. **Pass 1:** Собираем все scopes и объявления переменных
2. **Pass 2:** Анализируем использования — если переменная используется во вложенном scope, она "captured"

**Результат:** `CapturedVarInfo[]` для каждого scope

#### 3. IR Lowering (TS AST → IR)

**Расположение:** `src/lowering/`

**Ключевые файлы:**

- `visitor.ts` — entry point, `transformToIR()`
- `statements.ts` — lowering для statements
- `expressions.ts` — lowering для expressions
- `helpers.ts` — scope, operators, polyfills
- `function-builder.ts` — desc паттерн для функций
- `env-resolution.ts` — унифицированные хелперы для доступа к \_\_env chain (см. [ADR-006](../decisions/006-unified-env-resolution.md))
- `binding.ts` — генерация уникальных имён

**Процесс:**

- Преобразование TypeScript AST в IR
- Использует данные scope analyzer
- Использует TypeChecker для определения polyfills
- **Все трансформации в одном проходе**
- Учитывает `CompileMode` (bare/script/module)

#### 4. BT Emitter (Backend)

**Расположение:** `src/emitter/`

**Функции:**

- Генерация текста BorisScript из IR
- Форматирование кода
- Source maps (planned)

**Особенность:** Простой — IR уже содержит всю нужную информацию

---

## IR Nodes

### Категории нод

```
IR
├── Program
├── Statements
│   ├── FunctionDeclaration
│   ├── VariableDeclaration
│   ├── ReturnStatement
│   ├── IfStatement
│   ├── ForStatement
│   ├── ForInStatement
│   ├── WhileStatement
│   ├── DoWhileStatement
│   ├── SwitchStatement
│   ├── TryStatement
│   ├── ThrowStatement
│   ├── BlockStatement
│   └── ExpressionStatement
│
├── Expressions
│   ├── Identifier
│   ├── Literal
│   ├── BinaryExpression
│   ├── UnaryExpression
│   ├── ConditionalExpression
│   ├── CallExpression
│   ├── MemberExpression
│   ├── ArrayExpression
│   ├── ObjectExpression
│   └── AssignmentExpression
│
├── Environment (closures)
│   ├── EnvDeclaration      # var __env = { __parent: parentEnv }
│   ├── EnvAssign           # __env.x = value
│   └── EnvAccess           # __env.__parent.x
│
├── Runtime (platform-specific)
│   ├── PolyfillCall        # __bt.polyfill.type.method(target, args)
│   ├── RuntimeCall         # bt.getProperty, bt.setProperty, bt.callFunction
│   └── ArgsAccess          # __args[i]
│
└── Module
    ├── RequireCall         # require("module")
    └── ExportBinding       # module.exports.x = x
```

### IR Builders

**Location:** `src/ir/builders.ts`

Фабричные функции для создания IR:

```typescript
IR.id("name"); // Identifier
IR.lit(value); // Literal
IR.call(callee, args); // CallExpression
IR.bin(op, left, right); // BinaryExpression
IR.member(obj, property); // MemberExpression
IR.func(name, params, body); // FunctionDeclaration
IR.ret(expr); // ReturnStatement
// ... и т.д.
```

**Принцип:** Не создавать IR ноды руками — использовать builders.

---

## Ключевые трансформации

### 1. Функции

#### 1.1 Единая сигнатура

**Все функции** → `function name(__env, __this, __args)`

```typescript
// TypeScript
function add(a: number, b: number): number {
  return a + b;
}

// BorisScript
function add(__env, __this, __args) {
  var a = __args.length > 0 ? __args[0] : undefined;
  var b = __args.length > 1 ? __args[1] : undefined;
  return a + b;
}
```

#### 1.2 desc паттерн

**Каждая функция** создаёт descriptor и регистрируется в env:

```javascript
var funcName_desc = {
  "@descriptor": "function",
  callable: funcName,
  env: __env, // ссылка на текущий env напрямую
  obj: undefined, // для методов — ссылка на объект
};
__env.funcName = funcName_desc;
```

Отдельный per-function env (`funcName_env = { __parent: __env }`) **не создаётся** —
дескриптор ссылается на текущий env контекста напрямую.

#### 1.2.1 Per-call env (функции с замыканиями)

Функции, содержащие captured переменные (`hasCaptured`), создают **per-call env** внутри тела функции при каждом вызове. Дескриптор ссылается на текущий env напрямую, а доступ к captured переменным идёт через per-call env:

```javascript
function createTrieNode(__env, __this, __args) {
  var __fn0_env = { __parent: __env }; // per-call env, создаётся при каждом вызове
  // captured переменные хранятся в __fn0_env
  __fn0_env.node = {};
}

// При инициализации (дескриптор ссылается на __env напрямую):
var createTrieNode_desc = { /*...*/ env: __env };
```

Это обеспечивает изоляцию между вызовами — рекурсия и повторные вызовы корректно работают с независимыми наборами captured переменных.

См. [ADR-006](../decisions/006-unified-env-resolution.md) для деталей.

#### 1.3 Arrow функции

Извлекаются в именованные `__arrowN`:

```typescript
// TypeScript
const multiply = (x, y) => x * y;

// BorisScript
function __arrow0(__env, __this, __args) {
  var x = __args[0];
  var y = __args[1];
  return x * y;
}
var __arrow0_desc;
var multiply;
__arrow0_desc = { /*...*/ env: __env };
multiply = __env.__arrow0;
```

#### 1.4 Методы объектов

Извлекаются в `methodName__methodN` с `obj` установкой:

```typescript
// TypeScript
const myObj = {
  sayHello() {
    alert("Hi");
  },
};

// BorisScript
function sayHello__method0(__env, __this, __args) {
  alert("Hi");
}
// ... env/desc setup ...
var __obj1 = { sayHello: __env.sayHello__method0 };
sayHello__method0_desc.obj = __obj1; // backlink
```

---

### 2. Переменные

#### 2.1 Variable Hoisting

Все `var`/`let`/`const` выносятся в начало функции/модуля:

```typescript
// TypeScript
const arr = [1, 2, 3];
for (let i of arr) {
  console.log(i);
}

// BorisScript
var arr;
var i;
arr = [1, 2, 3];
for (i in arr) {
  console.log(i);
}
```

**Порядок hoisting:**

1. Функции (declarations)
2. Переменные (declarations)
3. Остальной код (assignments)

#### 2.2 let/const → var

BorisScript поддерживает только `var`.

---

### 3. Циклы

#### 3.1 for-of → for-in

```typescript
// TypeScript
for (const item of arr) {
  console.log(item);
}

// BorisScript
var item;
for (item in arr) {
  console.log(item);
}
```

**Особенность:** В BorisScript `for-in` на массивах итерирует **по значениям**, не по индексам.

**Оптимизация:** Если итерируемое — простой identifier, используется напрямую. Иначе — временная переменная.

---

### 4. Выражения

#### 4.1 Template literals

`` `Hello ${name}` `` → `"Hello " + name`

#### 4.2 this → \_\_this

Параметр функции.

#### 4.3 Вызовы функций → bt.callFunction

```typescript
// TypeScript
greet("World");

// BorisScript (script/module mode)
bt.callFunction(__env.greet, ["World"]);
```

**Исключение:** Built-in функции (alert, prompt) вызываются напрямую.

#### 4.4 Property access → bt.getProperty

```typescript
// TypeScript
const value = config.setting;

// BorisScript (script/module mode)
var value = bt.getProperty(config, "setting");
```

**Исключение:** Доступ к `__env.*` и `__*` переменным НЕ оборачивается.

#### 4.5 Property set → bt.setProperty

```typescript
// TypeScript
config.setting = 42;

// BorisScript (script/module mode)
bt.setProperty(config, "setting", 42);
```

---

### 5. Polyfills

Метод вызовы → polyfill calls:

```typescript
// TypeScript
arr.map((x) => x * 2);

// BorisScript
__bt.polyfill.array.map(arr, __arrow0);
```

**Поддерживаемые категории:**

- **Array:** map, filter, reduce, find, forEach, includes, slice, ...
- **String:** split, trim, toLowerCase, substring, replace, ...
- **Number:** toFixed, toString, toPrecision, ...
- **Math:** используется напрямую (доступен в BorisScript)

---

### 6. Замыкания и \_\_env chain

#### 6.1 Scope Analysis

Определяет captured переменные:

```typescript
// TypeScript
const arr = [1, 2, 3];
for (let item of arr) {
  callbacks.push(() => alert(item)); // item is captured
}
```

**Результат:** `item` помечается как captured.

#### 6.2 Создание \_\_env

Scopes с captured переменными создают `__env`:

```javascript
var __env = {};
```

#### 6.3 Доступ к captured переменным

**Чтение:** `__env.varName` или `__env.__parent.varName`

```typescript
// TypeScript (arrow внутри for-of)
() => alert(item);

// BorisScript
function __arrow0(__env, __this, __args) {
  alert(__env.item); // читаем из __env
}
```

**Присваивание:** `__env.varName = value`

```javascript
for (__item0 in arr) {
  __env.item = __item0; // записываем в __env
  callbacks.push(__arrow0);
}
```

Все паттерны доступа к env chain (captured params/vars, import module vars, helper env, codelibrary) реализованы через унифицированные хелперы в `env-resolution.ts`:

- `resolveEnvAccess(targetScope, property, ctx)` — основной хелпер, определяет chain depth через `getEnvDepth` и строит `__env.__parent...property`
- `resolveModuleLevelAccess(property, ctx)` — shorthand для module-scope переменных
- `getModuleEnvDepth(ctx)` — depth до module scope (для `__codelibrary`)

См. [ADR-006](../decisions/006-unified-env-resolution.md).

#### 6.4 \_\_env hoisting

Captured переменные **НЕ** hoistятся как обычные `var` — они живут в `__env`.

---

## CompileMode Integration

IR lowering учитывает режим компиляции:

### bare mode

- **Цель:** Минимальный overhead
- **Property access:** Прямой `obj.prop`
- **Function calls:** Прямые вызовы (без bt.callFunction)
- **Polyfills:** Отключены
- **env/desc:** Не создаются

**Пример:**

```javascript
function add(a, b) {
  return a + b;
}
```

### script mode

- **Цель:** Полные features для eval-скриптов
- **Property access:** `bt.getProperty(obj, "prop")`
- **Property set:** `bt.setProperty(obj, "prop", value)`
- **Function calls:** `bt.callFunction(desc, args)`
- **Polyfills:** Включены
- **env/desc:** Создаются
- **NO \_\_init wrapper**

### module mode

- **Цель:** Codelibrary с изоляцией
- **Всё как в script mode** +
- **\_\_init wrapper:** `function __init(__env) { ... }`
- **Variable hoisting:** В начало \_\_init
- **Exports:** `__env.exports = { ... }`

**Пример:**

```javascript
function __init(__env) {
  function greet(__env, __this, __args) {
    /*...*/
  }
  // hoisted vars
  var name;

  // env/desc setup
  var greet_env = { __parent: __env };
  // ...

  // code
  name = "World";
  bt.callFunction(__env.greet, [name]);
}
```

---

## Структура пакета bt-ir

```
bt-ir/
├── package.json
├── tsconfig.json
├── README.md                 # API документация
├── src/
│   ├── index.ts              # Публичное API
│   ├── pipeline/
│   │   ├── index.ts          # Pipeline координатор
│   │   └── compile.ts        # compile/compileFile/compileSourceFile
│   ├── analyzer/
│   │   ├── index.ts
│   │   ├── scope.ts          # Scope analysis
│   │   ├── captured.ts       # Captured variables detection
│   │   └── types.ts          # Type helpers
│   ├── ir/
│   │   ├── index.ts
│   │   ├── nodes.ts          # IR type definitions
│   │   └── builders.ts       # Factory functions (IR.*)
│   ├── lowering/
│   │   ├── index.ts
│   │   ├── visitor.ts        # TS AST → IR (main visitor)
│   │   ├── statements.ts     # Statement lowering
│   │   ├── expressions.ts    # Expression lowering
│   │   ├── helpers.ts        # Scope, operators, polyfills
│   │   ├── function-builder.ts  # env/desc generation
│   │   ├── env-resolution.ts # Unified env chain access helpers
│   │   └── binding.ts        # Unique name generation
│   ├── emitter/
│   │   ├── index.ts
│   │   └── emit.ts           # IR → BorisScript text
│   └── polyfill-spec.ts      # Polyfill registry
├── example/                   # Example usage
│   ├── src/
│   │   └── index.ts
│   ├── tsconfig.json
│   └── build/
└── build/                     # Compiled output
    └── ...
```

---

## Integration with btc

btc использует bt-ir через `compileSourceFile()`:

```typescript
import { compileSourceFile } from "bt-ir";

// В BuildPipeline
for (const sourceFile of program.getSourceFiles()) {
  const result = compileSourceFile(sourceFile, program, {
    compileMode: resolveCompileMode(sourceFile, options),
    cwd: packagePath,
  });

  // result.outputs[0].code → writeFileSync
}
```

**TypeScript Program:**

- Создаётся в btc с `noEmit: true`
- Используется только для диагностики
- bt-ir получает готовый Program + SourceFile

---

## Source Maps (Planned)

### Стратегия

Каждая IR нода хранит `SourceLocation`:

```typescript
interface SourceLocation {
  start: { line: number; column: number };
  end: { line: number; column: number };
  source: string;
}

interface IRNodeBase {
  kind: string;
  loc?: SourceLocation;
}
```

Emitter генерирует source map используя эти позиции.

**Статус:** 🔲 Не реализовано

---

## Не реализовано (Future)

### Деструктуризация

- `const { a, b } = obj` → отдельные присваивания
- Статус: 🔲 Planned

### Spread оператор

- `[...arr]` → `__bt.array.concat([], arr)`
- `{ ...obj }` → `__bt.object.assign({}, obj)`
- Статус: 🔲 Planned

### Классы

- TypeScript classes → функции-конструкторы + прототипы
- Статус: 🔲 Future

### IR Optimizer

- Dead code elimination
- Constant folding
- Inline expansion
- Статус: 🔲 Future

---

## См. также

- [User Guide: Compile Modes](../../docs/reference/compile-modes.md)
- [Build Pipeline Architecture](build-pipeline.md)
- [BorisScript Constraints](../../docs/reference/borisscript-constraints.md)
- [bt-ir README](../../bt-ir/README.md)
