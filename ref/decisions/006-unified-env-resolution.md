# 006. Унификация env-chain resolution и per-call env

**Date:** 2026-02-26  
**Status:** Accepted

## Context

При транспиляции TypeScript → BorisScript функции с замыканиями используют `__env` chain — цепочку объектов `{ __parent: outerEnv }` для доступа к captured переменным. В процессе тестирования реального кода (модуль `routes.ts` с Trie-маршрутизатором) были обнаружены три взаимосвязанных бага в механизме env resolution:

### Баг 1: Shared-state (отсутствие per-call env)

Функции с `hasCaptured` создавали env-объект **один раз** при инициализации модуля:

```javascript
var createTrieNode_env = { __parent: __env };
```

При каждом вызове функция переиспользовала тот же env-объект — захваченные переменные перезаписывались:

```javascript
// Второй вызов перезаписывал переменные первого
createTrieNode_env.node = {};  // потеря предыдущего node
```

### Баг 2: __codelibrary depth

В module mode каждая функция получает доступ к `__codelibrary` через env chain. Для вычисления глубины использовалась отдельная функция `getCodelibraryDepth()`, которая считала только `block` scopes с `hasCaptured`. После введения per-call env **function** scopes тоже создают env-объект, но `getCodelibraryDepth` их не учитывала — глубина вычислялась неправильно:

```javascript
// Ожидалось: __env.__parent.__parent.__codelibrary
// Генерировалось: __fn0_env.__codelibrary  (undefined!)
```

### Баг 3: Depth в visitCallExpression

`visitCallExpression` содержал short-circuit для вызовов через identifier — формировал обращение к env напрямую как `IR.dot(IR.id(ctx.currentEnvRef), funcName)`, минуя проверку `isCaptured` и вычисление depth через `getEnvDepth`. Для captured функций, вызываемых из вложенного scope, глубина была неправильной:

```javascript
// Ожидалось: bt.callFunction(__fn0_env.__parent.createTrieNode, [...])
// Генерировалось: bt.callFunction(__fn0_env.createTrieNode, [...])  (undefined!)
```

### Дублирование кода

Код построения env chain (`__env.__parent.__parent...`) был продублирован в 6+ местах: captured params, captured vars, import module access, helper env access, codelibrary depth, function registration. Каждое место вычисляло depth и строило chain самостоятельно — это создавало класс багов "забыли вычислить/обновить depth".

## Decision

### 1. Per-call env для всех типов функций

Функции с `hasCaptured` теперь создают env-объект **внутри тела функции** при каждом вызове:

```javascript
function createTrieNode(__env, __this, __args) {
    var __fn0_env = { __parent: __env };  // новый env при каждом вызове
    // ...
    __fn0_env.node = {};  // каждый вызов имеет изолированный env
}
```

Паттерн применяется ко всем типам: function declarations, function expressions, arrow functions, methods.

Дескриптор ссылается на текущий env напрямую (без отдельного per-function env), а per-call env (`__fn0_env`) используется для доступа к captured переменным внутри тела.

> **Update 2026-03-01:** Per-function registration env (`funcName_env = { __parent: __env }`) полностью удалён.
> Ранее он создавался для дескриптора, но был бесполезен — дескриптор теперь ссылается на `ctx.currentEnvRef` напрямую.
> `effectiveEnvRef` в `buildFunction` стал обязательным параметром; `bindings.envName()` удалён.
> Legacy IR-ноды `IRFunctionDescriptor` и `IREnvRegisterFunction` также удалены.

### 2. Модуль env-resolution.ts

Создан модуль `src/lowering/env-resolution.ts` с унифицированными хелперами:

| Функция | Назначение |
|---------|-----------|
| `buildEnvChainBase(envRef, depth)` | Строит IR цепочку `__env.__parent.__parent...` заданной глубины |
| `buildEnvChainAccess(envRef, depth, property)` | Строит `envChain.property` — цепочка + доступ к свойству |
| `resolveEnvAccess(targetScope, property, ctx)` | Унифицированный доступ к captured переменной: определяет closureEnv vs currentEnvRef, вычисляет depth через `getEnvDepth`, строит IR |
| `resolveModuleLevelAccess(property, ctx)` | Shorthand для доступа к module-scope переменным (import vars, helpers) |
| `getModuleEnvDepth(ctx)` | Глубина от текущего scope до module scope (для `__codelibrary`) |

### 3. Единый getEnvDepth

Удалена отдельная `getCodelibraryDepth()`. Все вычисления глубины теперь проходят через единственную функцию `getEnvDepth(fromScope, toScope)` в scope analyzer, которая корректно считает все типы scopes (block + function) с `hasCaptured`.

### 4. Исправление visitCallExpression

В `visitCallExpression` добавлена проверка `isCaptured` для callee-идентификаторов. Captured функции теперь разрешаются через `resolveEnvAccess()` с правильным вычислением depth, вместо хардкода `IR.dot(IR.id(ctx.currentEnvRef), funcName)`.

## Consequences

### Плюсы

- **Корректность:** Все три бага depth resolution исправлены — env chain всегда указывает на правильный scope
- **Изоляция вызовов:** Каждый вызов функции получает собственный env — рекурсия и повторные вызовы работают корректно
- **Единый код:** 6+ мест построения env chain заменены на `resolveEnvAccess()` — один code path для всех паттернов
- **Устойчивость к регрессиям:** Новые паттерны доступа к env (если появятся) будут использовать те же хелперы
- **Тестовое покрытие:** 3 новых теста: `per-call-env`, `codelibrary-module`, `module-func-calls`

### Минусы

- **Больше кода в output:** Каждый вызов функции с замыканиями создаёт новый объект `{ __parent: __env }` — минимальный overhead
- ~~**Два env-объекта для функций с hasCaptured:** registration env (`funcName_env`) и per-call env (`__fnN_env`) — небольшое усложнение ментальной модели~~ (Устранено: registration env удалён, остался только per-call env)

### Затронутые файлы

| Файл | Изменение |
|------|-----------|
| `lowering/env-resolution.ts` | **НОВЫЙ** — унифицированные хелперы |
| `lowering/expressions.ts` | Рефакторинг: все env access через `resolveEnvAccess`; fix `visitCallExpression` |
| `lowering/statements.ts` | Per-call env в `visitFunctionDeclaration`; `getModuleEnvDepth` для codelibrary |
| `lowering/function-builder.ts` | `registrationEnvRef` param; `buildEnvChainAccess` для `__codelibrary` |
| `analyzer/scope-analyzer.ts` | Удалена `getCodelibraryDepth`; safety check в `getEnvDepth` |
| `analyzer/index.ts` | Удалён экспорт `getCodelibraryDepth` |

## Alternatives Considered

### 1. Расширить getCodelibraryDepth вместо удаления

Можно было добавить в `getCodelibraryDepth` проверку function scopes с per-call env. Отвергнуто — наличие двух функций вычисления depth (`getEnvDepth` и `getCodelibraryDepth`) создаёт путаницу и дублирование логики. Единый `getEnvDepth` проще и надёжнее.

### 2. Создавать per-call env для ВСЕХ функций

Можно было создавать per-call env для всех функций, не только для тех, у которых `hasCaptured`. Отвергнуто — это добавляло бы overhead для функций без замыканий. `hasCaptured` — точный маркер необходимости.

### 3. Помечать visitCallExpression callee через отдельный visitor pass

Вместо проверки `isCaptured` в `visitCallExpression` можно было добавить дополнительный pass в scope analyzer, помечающий callee expression'ы. Отвергнуто — избыточно, `isCaptured` уже содержит нужную информацию.
