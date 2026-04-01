# 008. Expression Extraction для ограничений парсера BorisScript

**Date:** 2026-03-03  
**Status:** Accepted

## Context

Парсер BorisScript (BS) обрабатывает операторы **строго слева направо** без приоритетов.
Это означает, что сложные выражения (conditional/ternary), инлайненные внутри бинарных
операций, парсятся некорректно.

Конкретная проблема: optional chaining (`a?.b?.c`) транспилируется в nested conditional
expression (`(__tmp = ...) == null || __tmp == undefined ? undefined : ...`).
Если такое conditional используется как операнд `+`, `===`, `||` и т.д., BS-парсер
«захватывает» внешний оператор внутрь ternary:

```
// Ожидаемая семантика:
"PREFIX " + <ternary_result> + " SUFFIX"

// BS парсит как:
"PREFIX " + (<test_часть_ternary>) ? undefined : <alternate> + " SUFFIX"
//                                                ^^^^^^^^^^^^^^^^
//                        " SUFFIX" склеивается с alternate вместо общей конкатенации
```

Дополнительно: каждый `?.` в цепочке (`a?.b?.c?.d`) создавал отдельную временную
переменную (`__tmp0`, `__tmp1`, `__tmp2`), хотя промежуточные значения перезаписываются
последовательно и одной переменной достаточно.

## Decision

### 1. Expression Extraction (`maybeExtract`)

Ввели утилиту `maybeExtract(expr, ctx)` в `lowering/expressions.ts`:

- Если выражение — `ConditionalExpression` (результат optional chaining, ternary, ?? и т.д.),
  выносим его во временную переменную через `pendingStatements`:
  ```
  var __oc;
  __oc = <complex_expression>;
  // Далее используем __oc как безопасный идентификатор
  ```
- Для простых выражений — возвращаем как есть (zero-cost)

Критерий «небезопасности» (`isUnsafeInlineExpression`): верхний уровень выражения
является `ConditionalExpression`. Может быть расширен в будущем.

### 2. Места применения

`maybeExtract` применяется во всех контекстах, где inline conditional может сломать парсер:

| Контекст                                     | Почему опасно                   |
| -------------------------------------------- | ------------------------------- | --- | --- | --- | ------------------------------------ | --- | --- |
| Template literal spans                       | Ternary внутри `+` конкатенации |
| Binary operators (`+`, `-`, `===`, ...)      | `?:` перехватывает операнд      |
| Logical operators (`&&`, `                   |                                 | `)  | `   |     | `в null-check конфликтует с внешним` |     | `   |
| Conditional expression (condition, branches) | Вложенный ternary `? : ?:`      |
| Array literal elements                       | `?:` коллизия с `,` парсером    |
| Object literal values                        | `?:` коллизия с парсером        |
| Call expression arguments                    | Превентивная мера               |

### 3. Оптимизация temp переменных optional chaining

При цепочке `a?.b?.c?.d` переиспользуем одну temp переменную (`__tmp0`) вместо
создания отдельной для каждого `?.` (`__tmp0`, `__tmp1`, `__tmp2`).

Реализовано через:

- `extractOptionalChainTempName()` — извлекает имя temp из existing conditional
- `createOptionalCheck(..., reuseTempName?)` — принимает имя для переиспользования
- `chainOptionalAccess()` — передаёт reuse name когда base уже optional chain result

## Consequences

### Pros

- Корректная работа optional chaining во всех expression-контекстах
- Уменьшение количества временных переменных (1 temp + 1 extraction вместо N temps)
- Общий механизм, расширяемый на новые паттерны
- Не влияет на простые выражения (zero-cost path)

### Cons

- Дополнительные statements для extraction (var decl + assignment)
- Немного больший размер output для сложных выражений
- `isUnsafeInlineExpression` проверяет только `ConditionalExpression` —
  может потребоваться расширение если появятся другие проблемные паттерны

## Alternatives Considered

1. **Только скобки вокруг ternary** — невозможно, т.к. BS запрещает `(expr).key`
   и left-to-right parsing всё равно ломает `(ternary) + suffix`
2. **Перестройка optional chaining в sequential statements** — слишком инвазивно,
   потребовало бы переписать весь visitor pattern
3. **Точечный фикс только для template literals** — не решает проблему для `+`, `===`,
   `||` и остальных контекстов
