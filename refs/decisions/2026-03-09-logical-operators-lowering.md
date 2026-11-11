# ADR 009: Значения логических операторов через conditional

Дата решения: 2026-03-09. Статус: подход script/module сохранён;
полная корректность во всех контекстах не подтверждена, развитие заморожено.

## Выбор

JS `a || b` и `a && b` возвращают операнд, `??` проверяет только nullish.
Нативные BS logical operators не дают общего JS value-return контракта;
`??` не является нативным BS оператором. Для script/module выбраны формы:

```javascript
// a || b
bt.isTrue((__lo = a)) ? __lo : b;
// a && b
bt.isTrue((__la = a)) ? b : __la;
// a ?? b
(__nc = a) == null || __nc == undefined ? b : __nc;
```

Это схемы lowering, не самостоятельная гарантия порядка эффектов. Объявление temp
идёт в pending statements, assignment left остаётся inline, чтобы условие могло
вычисляться при каждом проходе цикла. Для `bt.isTrue` используется `IRBTIsTrue`;
`??` составлен из binary/logical/conditional IR. Prefixes temp — `lo`, `la`, `nc`.

В bare `||` и `&&` остаются native; `??` даёт warning и `__invalid__`.
Runtime сам использует native logical operators: преобразовывать их через
`bt.isTrue` при сборке runtime означало бы рекурсивную зависимость от этого helper.
Актуальный пользовательский контракт — [режимы](../../docs/reference/compile-modes.md).

## Почему не helper с обычными аргументами

`bt.logicalOr(a, b)` заранее вычисляет `b`, нарушая short-circuit. Обёртка `b`
в lambda сохраняла бы ленивость ценой allocation и env/descriptor machinery.
Приведение обоих операндов к boolean теряет возвращаемое значение.
Conditional позволяет представить эти свойства без новой функции на каждый оператор.

## Цена и известная граница

Каждый lowered `||`/`&&` добавляет temp, conditional и вызов `bt.isTrue`, даже если
исходные значения boolean. Вложенные conditional требуют parser-safe emission.
Но [extraction](2026-03-03-expression-extraction.md) может вынести эффекты правого
операнда или ветви из требуемой области исполнения. Inline assignment left не
решает эту отдельную проблему.

Поэтому старые утверждения «полная JS-совместимость» и «все if/while/for контексты»
не являются результатом проверки. Контрпримеры и точные XFAIL находятся в
[исследовании выражений](../research/compiler-semantics/expression-evaluation.md).
[Memory freeze](2026-11-05-script-module-memory-freeze.md) сохраняет существующую
реализацию и регрессии, не разрешая продолжать env/descriptor development.
