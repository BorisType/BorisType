# 010. Десахаризация try-catch-finally через state machine

**Date:** 2026-03-11  
**Status:** Accepted

## Context

Нативный `finally` блок в BorisScript работает некорректно:

- **Среда 1**: `finally` выполняет тело `catch` повторно (вместо `finally` блока)
- **Среда 2**: `finally` выполняется **только** при ошибке в `try` (пропускается при нормальном завершении)

Обе реализации не соответствуют семантике JavaScript. Принято решение не полагаться на нативный
`finally` и полностью имитировать его через допустимые конструкции (только `try-catch`).

### Требования

1. `finally` блок должен выполняться **всегда** — и при нормальном завершении, и при ошибке, и при `return`
2. `return` в `try`/`catch` должен сохранять возвращаемое значение, выполнять `finally`, и затем возвращать значение
3. `return` в `finally` должен перезаписывать `return` из `try`/`catch` (JS-семантика)
4. `throw` в `try` без `catch` должен выполнить `finally` и затем пробросить ошибку
5. Ошибка в `catch` должна выполнить `finally` и затем пробросить новую ошибку
6. Обычный `try-catch` (без `finally`) должен работать как раньше — без изменений

## Decision

### State machine desugaring

При наличии `finally` блока, `visitTryStatement` в lowering генерирует десахаризованный IR
из существующих примитивов (`IR.varDecl`, `IR.try`, `IR.catch`, `IR.if`, `IR.throw`, `IR.return`).

Используются две переменные состояния:

| Переменная | Назначение                                          |
| ---------- | --------------------------------------------------- |
| `__fType`  | Тип завершения: 0 = normal, 1 = return, 2 = throw   |
| `__fVal`   | Значение завершения (return value или error object) |

Зарезервированы типы 3 (break) и 4 (continue) для будущей реализации.

### Паттерн A: try-finally (без catch)

```javascript
// Исходный TS:
try { T } finally { F }

// Генерируемый BS:
var __fType0 = 0;
var __fVal0;
try {
  T'  // тело try с трансформированными return
} catch (__fc0) {
  if (__fType0 !== 1) {
    __fType0 = 2;
    __fVal0 = __fc0;
  }
}
F   // finally body — инлайн (всегда выполняется)
if (__fType0 === 1) { return __fVal0; }
if (__fType0 === 2) { throw __fVal0; }
```

### Паттерн B: try-catch-finally

```javascript
// Исходный TS:
try { T } catch (e) { C } finally { F }

// Генерируемый BS:
var __fType0 = 0;
var __fVal0;
try {
  T'  // тело try с трансформированными return
} catch (__fc0) {
  if (__fType0 !== 1) {
    __fType0 = 2;
    __fVal0 = __fc0;
    try {
      var e = __fc0;
      __fType0 = 0;
      __fVal0 = undefined;
      C'  // тело catch с трансформированными return
    } catch (__fc1) {
      if (__fType0 !== 1) {
        __fType0 = 2;
        __fVal0 = __fc1;
      }
    }
  }
}
F   // finally body — инлайн
if (__fType0 === 1) { return __fVal0; }
if (__fType0 === 2) { throw __fVal0; }
```

### Return → throw sentinel

`return expr` внутри `try`/`catch` тел (при наличии finally) трансформируется в:

```javascript
__fType0 = 1;
__fVal0 = expr;
throw __fVal0;
```

`throw` используется для выхода из try-блока в outer catch. Outer catch проверяет `__fType`:

- `=== 1` → return sentinel, пропускаем user catch
- `!== 1` → реальная ошибка, обрабатываем

Трансформация `transformReturns*` рекурсивно обходит IR-дерево (if/while/for/switch/try/block).
**Не заходит** в `FunctionDeclaration` — return внутри вложенной функции принадлежит ей, не внешнему try.

### Return в finally

Не требует специальной обработки. `finally` body инлайнится **до** dispatch-блока,
поэтому `return` в finally выполняется как обычный return, перезаписывая предыдущий
completion type (корректная JS-семантика).

### Уникальные имена

Все сгенерированные имена (`__fType0`, `__fVal0`, `__fc0`, `__fc1`) создаются через
`ctx.bindings.create()` (BindingManager), что гарантирует уникальность даже при вложенных
try-finally конструкциях.

## Consequences

### Плюсы

- Полностью корректная семантика finally для normal/throw/return completion types
- Не зависит от поведения нативного finally в BorisScript
- Расширяемый паттерн (break/continue — добавление типов 3/4 в state machine)
- Без изменений IR-типов, emitter'ов, builders — всё из существующих примитивов
- Без `finally` — код проходит без изменений (нулевой overhead)

### Минусы

- Увеличение размера генерируемого кода при наличии finally (~6-10 строк overhead на каждый try-finally)
- Throw-sentinel подход: return в try выбрасывает exception, перехватываемый outer catch — теоретический
  overhead на throw/catch, но на практике незначительный для BorisScript

### Ограничения (не реализовано)

#### break/continue в try с finally

`break`/`continue` внутри `try` блока (при наличии finally) и при условии что они целят
в цикл **снаружи** try — сейчас **не трансформируются**. Код скомпилируется, но
`break` прервёт try-catch, пропустив инлайн-finally.

Сложность реализации: нужно отслеживать **глубину вложенности** циклов/switch при обходе.
`break` на глубине 0 (нет вложенных циклов/switch внутри try) должен трансформироваться
в sentinel, на глубине > 0 — оставаться как есть (целит во внутренний цикл).

Дополнительная сложность: `switch` увеличивает глубину для `break` (но не для `continue`),
а labeled break/continue требуют проверки, ссылается ли label на конструкцию снаружи try.

BorisScript **не поддерживает** labeled statements, что ограничивает возможные стратегии
трансформации (нельзя использовать labeled break для выхода из вложенных конструкций).

Добавлено ESLint-правило `no-break-in-try-finally` для предупреждения о таких случаях.

## Alternatives Considered

### 1. Boolean flags

`var __hadError = false` вместо числового `__fType`. Проще для базового случая,
но не расширяется на return/break/continue без добавления дополнительных переменных.
Отвергнуто в пользу единой state machine.

### 2. IR-pass (post-lowering transformation)

Трансформация IR после полного lowering вместо inline в `visitTryStatement`.
Потребовала бы инфраструктуру IR passes, которой в проекте нет. Lowering —
единственное место, где доступен TS AST для анализа структуры try/catch/finally.

### 3. Wrapper function

```javascript
var __fVal = (function () {
  try {
    T;
  } catch (e) {
    C;
  }
})();
F;
```

Оборачивание try-catch в IIFE для захвата return. Отвергнуто: создаёт новый scope,
меняет семантику `this`, `arguments`, не работает с `break`/`continue`.

### 4. Flag-based guarding (для return вместо throw-sentinel)

Вместо `throw __fVal` использовать `__fType = 1; __fVal = expr;` и обернуть
оставшийся код в `if (__fType === 0) { ... }`. Отвергнуто: требует глубокой
перестройки тела try-блока, сложнее при множественных return на разных уровнях вложенности.
