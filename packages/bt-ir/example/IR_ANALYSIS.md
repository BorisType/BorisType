# Анализ IR: вспомогательные переменные, const/let→var, scopes, захват

## Текущая архитектура

### Pipeline

```
TS Source → Scope Analyzer → IR Lowering → BT Emitter → BS Output
```

### Ключевые компоненты

| Компонент          | Роль                                                                              |
| ------------------ | --------------------------------------------------------------------------------- |
| **Scope Analyzer** | Строит дерево scopes, определяет captured переменные, разрешает var/let конфликты |
| **BindingManager** | Генерация уникальных имён (`__item0`, `a__0`, `__tmp0`)                           |
| **Lowering**       | TS AST → IR с учётом scope, captured, renamed                                     |
| **Emitter**        | IR → BS с hoisting, env chain                                                     |

---

## 1. Создание вспомогательных переменных

### Где создаются

- **For-of loop variable**: `ctx.bindings.create(itemVar)` → `__item0`, `__item1`…
- **For-of array**: `ctx.bindings.create("arr")` → `__arr0` (если выражение не простое)
- **Arrow functions**: `bindings.create("arrow")` → `__arrow0`
- **Object methods**: `bindings.create("obj")` → `__obj0`
- **Shadowed vars**: `bindings.shadow(name)` → `a__0`, `a__1`

### Регистрация source names

```typescript
// scope-analyzer.ts, после resolveVarLetConflicts
const sourceNames = allVariables.flatMap((v) => (v.renamedTo ? [v.name, v.renamedTo] : [v.name]));
bindings.registerSourceNames(sourceNames);
```

**Порядок важен**: `registerSourceNames` вызывается после анализа, но `create()` в lowering вызывается позже. Коллизий быть не должно.

### Потенциальные проблемы

1. **Порядок вызовов `create`**: если в разных ветках lowering вызывается `create("item")` до того, как scope-analyzer зарегистрировал `__item` из исходника (3.ts, 4.ts) — возможна коллизия. Сейчас `registerSourceNames` вызывается до lowering, так что имена из кода уже заняты.

2. **`create(itemVar).slice(2)`** в `visitForOfStatement`: при `itemVar = "item"` получаем `"item"`, затем `create("item")` → `"__item0"`. Суффикс `0` может пересечься с `__item0` из исходника (3.ts). BindingManager проверяет `isNameTaken`, так что должен выдать `__item1` и т.д. — логика корректна.

---

## 2. const/let → var, переименование (shadowing)

### Два источника переименования

1. **Shadowing (block scope)**  
   `registerVariable` в scope-analyzer: если `let/const x` во вложенном блоке перекрывает `x` из родителя → `renamedTo = bindings.shadow("x")` → `x__0`.

2. **Конфликт var/let**  
   `resolveVarLetConflicts`: если в том же function/module scope есть `var x` и `let/const x` в блоке → переименовывается `let/const` → `x__0`.

### Использование в lowering

- `visitVariableStatement`: `actualName = varInfo?.renamedTo ?? varName`
- `visitIdentifier`: `actualName = varInfo.renamedTo ?? name`
- `visitForOfStatement`: `actualName = varInfo?.renamedTo ?? itemVar`
- `buildFunction` (env): `actualName = renamedTo ?? varName`

### Проблемы

1. **For-of с `var`**: переменная цикла (`var item`) объявляется в function/module scope, а не в scope тела цикла. В `visitForOfStatement`:

   ```typescript
   const loopBodyScope = ctx.scopeAnalysis.nodeToScope.get(node.statement);
   const varInfo = loopBodyScope?.variables.get(itemVar);
   ```

   Для `var` `loopBodyScope.variables` не содержит переменную цикла → `varInfo === undefined` → `isCaptured` всегда false.

2. **Следствие**: для `for (var item1 of arr)` с замыканием, использующим `item1`, не генерируется `__env.item1 = __item10`, а только `item1 = __item10`. Замыкание ожидает `__env.__parent.item1`, но `item1` — обычная var, не в `__env` → неверное поведение.

---

## 3. Scopes

### Типы scopes

- **module**: корень
- **function**: функции, методы, arrow
- **block**: `{}`, тело for-of с let/const

### Особенности

- **var** hoist’ится в function/module scope
- **let/const** остаётся в текущем (block) scope
- Для for-of с let/const создаётся отдельный block scope для тела цикла

### Проблема с `analyzeUsages` и block scope

```typescript
// scope-analyzer.ts
const nodeScope = nodeToScope.get(node);
if (nodeScope && nodeScope !== currentScope && nodeScope.type !== "block") {
  currentScope = nodeScope;
}
```

При обходе блока `currentScope` не переключается на block scope. Идентификаторы внутри блока анализируются в scope родителя. Для `let/const` в block это может исказить привязку переменной и учёт captured.

---

## 4. Захват переменных (captured)

### Условие captured

```typescript
if (varInfo.declarationScope !== currentScope) {
  if (isScopeNestedIn(currentScope, varInfo.declarationScope)) {
    varInfo.isCaptured = true;
  }
}
```

Переменная считается captured, если используется в scope, вложенном в scope объявления.

### `collectCapturedVarsForArrow`

```typescript
if (!capturedVar.usedInScopes.has(funcScope)) continue;
if (isScopeInsideOrEqual(capturedVar.declarationScope, funcScope)) continue;
```

**Ошибка**: проверяется только `usedInScopes.has(funcScope)`. Если переменная используется во вложенной функции (не в самой `funcScope`), она не попадёт в captured для `funcScope`.

Пример:

```typescript
function outer() {
  const x = 1;
  function inner() {
    function middle() {
      return x; // x используется в middle
    }
  }
}
```

`usedInScopes` содержит scope `middle`, но не `inner`. При сборе captured для `inner` переменная `x` пропускается, хотя `inner` должна захватывать `x` для `middle`.

**Исправление**: учитывать использование во вложенных scopes:

```typescript
const usedInFuncOrNested = Array.from(capturedVar.usedInScopes).some(
  (scope) => scope === funcScope || isScopeNestedIn(scope, funcScope),
);
if (!usedInFuncOrNested) continue;
```

---

## 5. Depth для EnvAccess

### Текущая логика

```typescript
// expressions.ts
const depth = varInfo.kind === "var" ? 1 : 0;
return IR.envAccess(depth, actualName, ...);
```

- **const/let**: depth=0, значение копируется в env замыкания
- **var**: depth=1, доступ через `__env.__parent`

### Проблема

Для `var` depth захардкожен как 1. При нескольких уровнях вложенности (module → outer → inner) нужен больший depth.

Пример:

```typescript
var x = 1;
function a() {
  function b() {
    return x; // нужен __env.__parent.__parent.x
  }
}
```

Здесь нужен depth=2, а не 1.

**Исправление**: вычислять depth через `getEnvDepth(ctx.currentScope, varInfo.declarationScope)` для `var`.

---

## 6. For-of: var vs let/const

### Текущее поведение

| Тип       | Scope переменной   | loopBodyScope.variables | isCaptured   | Генерация                                       |
| --------- | ------------------ | ----------------------- | ------------ | ----------------------------------------------- |
| let/const | block (тело цикла) | есть                    | корректно    | `__env.item = __itemN` или `var item = __itemN` |
| var       | function/module    | нет                     | всегда false | всегда `var item = __itemN`                     |

### Что нужно

Для `var` в for-of при captured нужно искать переменную в function/module scope:

```typescript
const loopBodyScope = ctx.scopeAnalysis.nodeToScope.get(node.statement);
const enclosingScope = loopBodyScope ?? ctx.currentScope;
// Ищем переменную в scope цикла и в родителях
let varInfo = resolveVariableInScope(itemVar, enclosingScope);
// Или: для var — искать в findFunctionOrModuleScope
if (!varInfo && loopBodyScope) {
  varInfo = resolveVariableInScope(itemVar, findFunctionOrModuleScope(loopBodyScope));
}
```

---

## 7. Оптимизации

### 7.1. Избыточные \_\_env при отсутствии captured

Сейчас `hasCaptured` помечаются scopes с captured. Можно не создавать env для функций без captured (кроме нужных для регистрации в `__env`).

### 7.2. Копирование const/let в env

Для const/let копируется значение в env замыкания. Если переменная только читается и не меняется, копия достаточна. Если переприсваивается — нужна запись обратно в родительский env (уже поддерживается через `IR.envAccess` и assignment).

### 7.3. var и \_\_env

Для `var` в module scope при captured нужно гарантировать, что значение хранится в `__env`, а не только в обычной var. Сейчас для module-level var это не обеспечивается.

### 7.4. Дедупликация captured

`collectCapturedVarsForArrow` может возвращать дубликаты при нескольких вложенных замыканиях. Стоит дедуплицировать по `(name, renamedTo)`.

---

## 8. Сводка проблем

| #   | Проблема                                                                                                                           | Серьёзность | Где                     |
| --- | ---------------------------------------------------------------------------------------------------------------------------------- | ----------- | ----------------------- |
| 1   | For-of с `var` и captured: `varInfo` не находится в loopBodyScope                                                                  | Высокая     | statements.ts           |
| 2   | `collectCapturedVarsForArrow` не учитывает использование во вложенных функциях                                                     | Высокая     | helpers.ts              |
| 3   | Depth для `var` захардкожен как 1                                                                                                  | Средняя     | expressions.ts          |
| 4   | Module-level var при captured не попадает в `__env`                                                                                | Высокая     | visitor, statements     |
| 5   | Block scope в `analyzeUsages` может влиять на привязку переменных                                                                  | Низкая      | scope-analyzer.ts       |
| 6   | Коллизия shadow: если в scope уже есть явная переменная `a__0`, а `shadow("a")` тоже даёт `a__0` — перезапись и неверная семантика | Средняя     | scope-analyzer, binding |

---

## 9. Сценарии для проверки

1. **Вложенные замыкания** (outer → inner → middle, captured в middle)
2. **For-of с var и замыканием** (2.ts)
3. **Многоуровневый var** (var в module, использование в функции 2 уровня)
4. **Смешанный var/let в одном scope** (3.ts, 4.ts — уже покрыто)
5. **Параллельные циклы с одинаковым именем** (`for (const x of a) ... for (const x of b)`)
6. **Рекурсивные замыкания** (функция захватывает сама себя через env)
7. **Явное имя в стиле shadow** (`const a__0 = 100` и `const a = 10` во вложенном блоке — 2.ts)
