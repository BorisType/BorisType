# Реестр преобразований BT-IR

Документ описывает все преобразования, выполняемые компилятором при трансляции TypeScript → BorisScript.

---

## 1. Функции

### 1.1 Сигнатура функций

**Что:** Все функции преобразуются к единой сигнатуре `function name(__env, __this, __args)`

**Зачем:** BorisScript требует единообразную сигнатуру для поддержки замыканий и правильной передачи контекста.

**Пример:**

```typescript
// До
function add(a: number, b: number): number {
  return a + b;
}

// После
function add(__env, __this, __args) {
  var a = __args.length > 0 ? __args[0] : undefined;
  var b = __args.length > 1 ? __args[1] : undefined;
  return a + b;
}
```

### 1.2 Arrow функции → именованные функции + дескриптор

**Что:** Arrow функции извлекаются в отдельные именованные функции `__arrowN` с созданием env и desc

**Зачем:** BorisScript не поддерживает arrow функции. Нужны именованные функции для hoisting'а и дескрипторы для правильной работы замыканий.

**Пример:**

```typescript
// До
const multiply = (x, y) => x * y;

// После
function __arrow0(__env, __this, __args) {
  var x = __args.length > 0 ? __args[0] : undefined;
  var y = __args.length > 1 ? __args[1] : undefined;
  return x * y;
}
var __arrow0_env;
var __arrow0_desc;
var multiply;
var __env = {};
__arrow0_env = {
  __parent: __env,
};
__arrow0_desc = {
  "@descriptor": "function",
  callable: __arrow0,
  env: __arrow0_env,
  obj: undefined,
};
__env.__arrow0 = __arrow0_desc;
multiply = __env.__arrow0;
```

### 1.3 Методы объектов → именованные функции + дескриптор

**Что:** Методы объектных литералов извлекаются в функции с созданием env, desc и установкой obj

**Зачем:** В BorisScript методы должны быть объявлены как отдельные функции с дескрипторами для правильной работы this.

**Пример:**

```typescript
// До
function main() {
  return {
    value: 0,
    sayHello() {
      alert("Hello");
    },
  };
}

// После
function main(__env, __this, __args) {
  function sayHello__method0(__env, __this, __args) {
    alert("Hello");
  }
  var sayHello__method0_env;
  var sayHello__method0_desc;
  var __obj1;
  sayHello__method0_env = {
    __parent: __env,
  };
  sayHello__method0_desc = {
    "@descriptor": "function",
    callable: sayHello__method0,
    env: sayHello__method0_env,
    obj: undefined,
  };
  __env.sayHello__method0 = sayHello__method0_desc;
  __obj1 = {
    value: 0,
    sayHello: __env.sayHello__method0,
  };
  sayHello__method0_desc.obj = __obj1; // устанавливаем obj после создания объекта
  return __obj1;
}
```

### 1.4 Объявление функций → функция + дескриптор

**Что:** Объявления функций создают env, desc и регистрируются в \_\_env

**Зачем:** Все функции должны быть вызываемы через bt.callFunction с дескриптором.

**Пример:**

```typescript
// До
function greet(name) {
  alert("Hello " + name);
}

// После
function greet(__env, __this, __args) {
  var name = __args.length > 0 ? __args[0] : undefined;
  alert("Hello " + name);
}
var greet_env;
var greet_desc;
var __env = {};
greet_env = {
  __parent: __env,
};
greet_desc = {
  "@descriptor": "function",
  callable: greet,
  env: greet_env,
  obj: undefined,
};
__env.greet = greet_desc;
```

### 1.5 Per-call env для функций с замыканиями

**Статус:** ✅ Реализовано

**Что:** Функции, содержащие captured переменные (`hasCaptured`), создают per-call env внутри тела функции при каждом вызове.

**Зачем:** Без per-call env повторные вызовы / рекурсия перезаписывают captured переменные предыдущих вызовов (shared-state баг). Каждый вызов должен иметь изолированный env.

**Применяется ко:** function declarations, function expressions, arrow functions, methods — любые функции с `hasCaptured`.

**Пример:**

```typescript
// До
function createNode() {
  const node = {};
  return {
    getNode: () => node,
  };
}

// После
function createNode(__env, __this, __args) {
  var __fn0_env = { __parent: __env }; // per-call env
  function __arrow0(__env, __this, __args) {
    return __env.__parent.node; // доступ через __fn0_env
  }
  // ...
  __fn0_env.node = {};
  // ...
}

// registration env остаётся для дескриптора:
var createNode_env = { __parent: __env };
var createNode_desc = { /*...*/ env: createNode_env };
```

См. [ADR-006](ref/decisions/006-unified-env-resolution.md).

---

## 2. Переменные

### 2.1 Hoisting переменных

**Что:** Все объявления `var`/`let`/`const` выносятся в начало функции/файла. На месте оригинала — только присваивание.

**Зачем:** В BorisScript нельзя объявить переменную дважды (`var a = 5; var a = 6;` — ошибка). Hoisting гарантирует единственное объявление.

**Порядок:**

1. Функции
2. Объявления переменных (`var name;`)
3. Остальной код (присваивания и логика)

**Пример:**

```typescript
// До
const arr = [1, 2, 3];
for (var i of arr) {
  console.log(i);
}

// После
function ...
var arr;
var i;
arr = [1, 2, 3];
for (i in arr) {
    console.log(i);
}
```

### 2.2 let/const → var

**Что:** Все `let` и `const` преобразуются в `var`

**Зачем:** BorisScript поддерживает только `var`.

---

## 3. Циклы

### 3.1 for-of → for-in

**Что:** `for (const item of arr)` → `for (item in arr)`

**Зачем:** В BorisScript `for-in` на массивах работает как `for-of` в JS — итерирует по значениям, не по индексам.

**Оптимизация:** Если итерируемое выражение — простой идентификатор или параметр, используется напрямую. Иначе создаётся временная переменная.

**Пример:**

```typescript
// До
for (const item of arr) {
  console.log(item);
}

// После (arr — простой идентификатор)
for (item in arr) {
  console.log(item);
}

// После (сложное выражение)
var __arr0;
__arr0 = getItems();
for (item in __arr0) {
  console.log(item);
}
```

---

## 4. Выражения

### 4.1 Template literals → конкатенация

**Что:** `` `Hello ${name}` `` → `"Hello " + name`

**Зачем:** BorisScript не поддерживает template literals.

### 4.2 this → \_\_this

**Что:** Ключевое слово `this` заменяется на `__this`

**Зачем:** В сигнатуре функций контекст передаётся через параметр `__this`.

### 4.3 Вызовы функций → bt.callFunction

**Что:** Вызовы функций, объявленных в файле, оборачиваются в `bt.callFunction`

**Зачем:** В BorisScript для вызова функций через дескриптор нужен специальный вызов.

**Исключение:** Встроенные функции (alert, prompt и т.д.) вызываются напрямую.

**Captured callee resolution:** Если вызываемая функция является captured (объявлена в внешнем scope), доступ к ней разрешается через `resolveEnvAccess` с правильным вычислением depth.

**Пример:**

```typescript
// До
function greet() {
  alert("Hi");
}
greet();
alert("Done");

// После
function greet(__env, __this, __args) {
  alert("Hi");
}
// ... env/desc setup ...
bt.callFunction(__env.greet, []); // пользовательская функция
alert("Done"); // встроенная — напрямую
```

**Пример (captured callee из вложенного scope):**

```typescript
// До
function addRoute() {
  /*...*/
}
function processRoutes() {
  addRoute(); // captured — объявлена в модуле
}

// После (внутри processRoutes)
bt.callFunction(__fn0_env.__parent.addRoute, []); // depth через resolveEnvAccess
```

### 4.4 Вызовы методов → bt.callFunction + bt.getProperty

**Что:** Вызовы методов объектов оборачиваются в `bt.callFunction(bt.getProperty(...))`

**Зачем:** Сначала получаем метод как свойство, затем вызываем через дескриптор.

**Исключение:** Доступ к `__env.*` не оборачивается.

**Пример:**

```typescript
// До
myObj.sayHello();

// После
bt.callFunction(bt.getProperty(myObj, "sayHello"), []);
```

### 4.5 Доступ к свойствам → bt.getProperty

**Что:** `obj.prop` или `arr[i]` → `bt.getProperty(obj, "prop")` или `bt.getProperty(arr, i)`

**Зачем:** В BorisScript доступ к несуществующему свойству вызывает ошибку, а не возвращает undefined.

**Исключение:** Доступ к `__env.*` и `__*` переменным не оборачивается.

**Пример:**

```typescript
// До
const value = config.setting;
const first = arr[0];

// После
var value = bt.getProperty(config, "setting");
var first = bt.getProperty(arr, 0);
```

### 4.6 Установка свойств → bt.setProperty

**Что:** `obj.prop = value` → `bt.setProperty(obj, "prop", value)`

**Зачем:** Унификация доступа к свойствам через runtime.

**Исключение:** Установка в `__env.*` и `__*` переменные не оборачивается.

**Пример:**

```typescript
// До
config.setting = 42;

// После
bt.setProperty(config, "setting", 42);
```

---

## 5. Polyfills

### 5.1 Методы массивов

**Что:** `arr.map(fn)` → `__bt.polyfill.array.map(arr, fn)`

**Зачем:** Встроенные методы массивов в BorisScript ограничены. Polyfills реализуют недостающие.

**Поддерживаемые методы:**

- `map`, `filter`, `reduce`, `find`, `findIndex`
- `forEach`, `some`, `every`
- `includes`, `indexOf`, `lastIndexOf`
- `push`, `pop`, `shift`, `unshift`
- `slice`, `splice`, `concat`
- `join`, `reverse`, `sort`
- `flat`, `flatMap`

### 5.2 Методы чисел

**Что:** `num.toFixed(2)` → `__bt.polyfill.number.toFixed(num, 2)`

**Поддерживаемые методы:**

- `toFixed`, `toString`, `toPrecision`, `toExponential`

### 5.3 Методы строк

**Что:** `str.split(',')` → `__bt.polyfill.string.split(str, ',')`

**Поддерживаемые методы:**

- `split`, `trim`, `trimStart`, `trimEnd`
- `toLowerCase`, `toUpperCase`
- `substring`, `substr`, `slice`
- `charAt`, `charCodeAt`
- `includes`, `indexOf`, `lastIndexOf`
- `startsWith`, `endsWith`
- `replace`, `replaceAll`
- `repeat`, `padStart`, `padEnd`

---

## 6. Замыкания и \_\_env chain

### 6.1 Scope Analysis

**Статус:** ✅ Реализовано

**Что:** Анализ областей видимости для определения captured переменных.

**Как работает:**

1. Pass 1: Собираем все scopes и объявления переменных
2. Pass 2: Анализируем использования — если переменная используется во вложенном scope, она "captured"

**CLI:** `--debug-scopes` для вывода дерева scopes

### 6.2 Создание \_\_env объекта

**Статус:** ✅ Реализовано

**Что:** Scopes с captured переменными создают `__env` объект.

**Пример:**

```typescript
// TypeScript
const arr = [1, 2, 3];
for (var item of arr) {
  callableArray.push(() => alert(item));
}

// BorisScript (generated)
function __arrow0(__env, __this, __args) {
  alert(__env.item); // доступ через __env
}
var __env = {}; // создаётся в module scope
```

### 6.3 Доступ к captured переменным (чтение)

**Статус:** ✅ Реализовано

**Что:** Чтение captured переменных через `__env.varName` или `__env.__parent.varName`

**Depth calculation:** Единая функция `getEnvDepth` считает все scopes с `hasCaptured=true` (block + function scopes с per-call env). Все паттерны доступа реализованы через унифицированные хелперы из `env-resolution.ts`:

| Хелпер                     | Назначение                                                |
| -------------------------- | --------------------------------------------------------- |
| `resolveEnvAccess`         | Доступ к captured переменным/функциям с вычислением depth |
| `resolveModuleLevelAccess` | Shorthand для module-scope (imports, helpers)             |
| `getModuleEnvDepth`        | Depth до module scope (для `__codelibrary`)               |
| `buildEnvChainAccess`      | Low-level: env chain + property access                    |

### 6.4 Присваивание captured переменных

**Статус:** ✅ Реализовано (для for-in)

**Что:** Присваивание captured переменных идёт в `__env`

**Пример for-in:**

```typescript
// TypeScript
for (var item of arr) {
  callbacks.push(() => alert(item));
}

// BorisScript (generated)
for (__item0 in arr) {
  __env.item = __item0; // присваивание в __env
  callbacks.push(__arrow0);
}
```

### 6.5 \_\_env hoisting

**Статус:** ✅ Реализовано

**Что:** Captured переменные не hoistятся в обычные `var` — они живут в `__env`

**Пример:**

```javascript
// НЕ генерируется var item1; var item2;
var __item1; // только временные переменные
var __item3;
var __env = {};
```

---

## 7. Не реализовано (TODO)

### 7.1 Деструктуризация

**Статус:** 🔲 Не реализовано

**Что нужно:** `const { a, b } = obj` → отдельные присваивания

### 7.2 Spread оператор

**Статус:** 🔲 Не реализовано

**Что нужно:** `[...arr]` → `__bt.array.concat([], arr)`

### 7.3 Rest параметры

**Статус:** 🔲 Частично (в сигнатуре есть, но не полностью)

### 7.4 Классы

**Статус:** 🔲 Не реализовано

### 7.5 Source Maps

**Статус:** 🔲 Не реализовано

---

## Changelog

| Дата | Изменение |
|------|-----------|| 2026-02-26 | Per-call env для функций с `hasCaptured` (shared-state fix) |
| 2026-02-26 | Унифицированные хелперы env-resolution.ts (`resolveEnvAccess`, `resolveModuleLevelAccess`, `getModuleEnvDepth`) |
| 2026-02-26 | Единый `getEnvDepth` вместо отдельного `getCodelibraryDepth` |
| 2026-02-26 | Fix: `visitCallExpression` корректно вычисляет depth для captured callee || 2026-02-09 | Добавлен bt.callFunction для вызова пользовательских функций |
| 2026-02-09 | Добавлен bt.getProperty для доступа к свойствам объектов |
| 2026-02-09 | Добавлен bt.setProperty для установки свойств объектов |
| 2026-02-09 | Функции создают env/desc и регистрируются в **env |
| 2026-02-09 | Методы объектов создают env/desc с установкой obj |
| 2026-02-09 | Arrow функции создают env/desc |
| 2026-02-09 | Исправлено: captured переменные — только объявленные ВНЕ функции |
| 2026-02-08 | Добавлен scope analyzer с определением captured переменных |
| 2026-02-08 | Реализовано чтение captured через **env.varName |
| 2026-02-08 | Добавлена CLI опция --debug-scopes |
| 2026-02-08 | Создание \_\_env объекта в module/function scope |
| 2026-02-08 | Hoisting переменных |
| 2026-02-08 | Преобразование for-of → for-in |
