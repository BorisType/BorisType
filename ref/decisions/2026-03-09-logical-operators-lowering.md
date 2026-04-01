# 009. Lowering логических операторов (||, &&, ??) через ternary

**Date:** 2026-03-09  
**Status:** Accepted

## Context

В BorisScript операторы `||` и `&&` работают **только с boolean значениями** — они не возвращают
значения операндов (как в JS), а выполняют чисто логическое сравнение. Оператор `??` вообще
не существует в BS.

В JavaScript:

```javascript
"hello" || "default"; // → "hello" (возвращает первый truthy)
0 && "result"; // → 0 (возвращает первый falsy)
null ?? "fallback"; // → "fallback" (возвращает right если left nullish)
```

В BorisScript:

```javascript
"hello" || "default"; // Ошибка: "Value is not effective boolean"
0 && "result"; // Ошибка: "Value is not effective boolean"
null ?? "fallback"; // Синтаксическая ошибка: ?? не существует
```

Это критическое несовместимость, так как паттерны `value || default`, `obj && obj.prop`,
`value ?? fallback` — одни из самых частых в TypeScript-коде.

## Decision

### Lowering через ternary expression

Все три оператора преобразуются в conditional (ternary) expression с inline assignment.

#### `||` (logical OR)

```
a || b  →  bt.isTrue((__lo = a)) ? __lo : b
```

- `var __lo;` — объявление через `pendingStatements` (hoisted)
- `(__lo = a)` — inline assignment внутри `bt.isTrue()` (не в pendingStatements!)
- `bt.isTrue()` — runtime-функция приведения к boolean
- Если left truthy → возвращает left; иначе → вычисляет и возвращает right (short-circuit)

#### `&&` (logical AND)

```
a && b  →  bt.isTrue((__la = a)) ? b : __la
```

- Инвертированная версия `||`: consequent и alternate поменяны местами
- Если left truthy → вычисляет и возвращает right; иначе → возвращает left (short-circuit)

#### `??` (nullish coalescing)

```
a ?? b  →  (__nc = a) == null || __nc == undefined ? b : __nc
```

- Не использует `bt.isTrue()` — проверяет только null/undefined
- Паттерн null-check идентичен optional chaining (`createOptionalCheck`)
- `||` в условии — IR-уровневый, эмитится как нативный BS `||` с boolean операндами (безопасно)
- Ключевое отличие от `||`: `0`, `""`, `false` — не nullish, возвращаются как left

### Inline assignment

Критически важно: assignment `(__lo = a)` выполняется **inline** внутри условия ternary,
а не через `pendingStatements`. Только объявление `var __lo;` идёт в pendingStatements
(оно hoisted в BS).

Причина: `pendingStatements` сбрасываются на уровне statement-list. В конструкциях
`if (a || b)`, `while (a && b)`, `for (; a ?? b;)` pending statements оказались бы
внутри тела конструкции, а не перед условием.

### Bare mode

| Оператор | Bare mode                                                                        |
| -------- | -------------------------------------------------------------------------------- |
| `\|\|`   | Нативный `\|\|` (runtime использует `\|\|` напрямую)                             |
| `&&`     | Нативный `&&` (аналогично)                                                       |
| `??`     | `__invalid__` + warning (BS не имеет `??`, null-check инфраструктура недоступна) |

Bare mode используется для компиляции runtime (`packages/builtin-runtime`), где `bt.isTrue()`
сама содержит `||` — lowering вызвал бы бесконечную рекурсию.

### IR-представление

Для `bt.isTrue()` введён IR-узел `IRBTIsTrue`:

```typescript
interface IRBTIsTrue extends IRNodeBase {
  kind: "BTIsTrue";
  value: IRExpression;
}
```

Для `??` новые IR-узлы не потребовались — используются существующие `IR.binary("==")`,
`IR.logical("||")`, `IR.conditional()`.

### Temp variable naming

| Оператор | Prefix | Пример  |
| -------- | ------ | ------- |
| `\|\|`   | `lo`   | `__lo0` |
| `&&`     | `la`   | `__la0` |
| `??`     | `nc`   | `__nc0` |

## Consequences

### Плюсы

- Полная JS-совместимость: value return + short-circuit + chaining
- Работает во всех контекстах: if/while/for/ternary/negation/expression
- Минимальные изменения: один файл lowering + один IR-узел
- Переиспользует существующую инфраструктуру (bt.isTrue, optional chaining pattern)

### Минусы

- Увеличивает размер output-кода (ternary verbose vs нативный `||`)
- Каждый `||`/`&&` создаёт temporary variable (может влиять на читаемость output)
- `bt.isTrue()` вызывается для каждого `||`/`&&` даже если операнды уже boolean

### Риски

- Вложенные `a || b || c` создают цепочку ternary — потенциально проблемы с парсером BS
  (решается через `maybeExtract` expression extraction)

## Alternatives Considered

### 1. Runtime polyfill `bt.logicalOr(a, b)`

```javascript
a || b  →  bt.logicalOr(a, b)
```

**Отклонено:** нарушает short-circuit — `b` всегда вычисляется при передаче как аргумент.

### 2. Lambda-обёртка для short-circuit

```javascript
a || b  →  bt.logicalOr(a, function() { return b; })
```

**Отклонено:** избыточная сложность, создание функции на каждый `||`, проблемы с env/desc
паттерном функций в BS.

### 3. Boolean-wrapping операндов

```javascript
a || b  →  Boolean(a) || Boolean(b)
```

**Отклонено:** теряет value return семантику (всегда возвращает boolean).
