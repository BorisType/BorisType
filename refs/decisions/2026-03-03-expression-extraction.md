# ADR 008: Extraction выражений для ограничений BS parser

Дата решения: 2026-03-03. Статус: историческое основание действующего механизма;
его общая семантическая корректность не подтверждена.

## Проблема и выбор

При встраивании conditional, полученного из `a?.b?.c`, в конкатенацию наблюдался
неверный разбор: suffix попадал в alternate ternary вместо общей конкатенации.
Историческое описание «BS всегда вычисляет строго слева направо» было слишком
общим: конкретный parser counterexample не устанавливает универсальную таблицу
приоритетов для двух реализаций runtime.

Выбран `maybeExtract`: conditional заменяется временным идентификатором, а его
вычисление добавляется в `pendingStatements`:

```javascript
var __oc;
__oc = complexConditional;
var result = "PREFIX " + __oc + " SUFFIX";
```

Простое выражение возвращается без extraction. `isUnsafeInlineExpression` проверяет
conditional на верхнем уровне; это эвристика для формы output, не анализ эффектов.
Текущие helpers — [dispatch.ts](../../packages/bt-ir/src/lowering/expressions/dispatch.ts).

В optional chain temp промежуточного receiver переиспользуется через
`extractOptionalChainTempName`, `createOptionalCheck` и `chainOptionalAccess`:
это сокращает число temp, но не отменяет необходимость проверять однократность
вычислений и границы короткого замыкания.

## Альтернативы

- Скобки без extraction: исторически отклонены из-за parser/access форм, включая
  `(expr).key`. Это не доказательство невозможности всех скобочных вариантов.
  Поздние inline/shape prototypes сохраняются как отдельные кандидаты.
  В raw JS probe grouped ternary совпал в шести contexts; grouped member access
  и dynamic case были отклонены. Это не C acceptance.
- Полное преобразование в последовательность statements требует учитывать эффекты
  и каждый control-flow context; больший рефакторинг не был выбран в марте.
- Исправление только template literals оставляло тот же риск в binary expressions,
  логических операторах, аргументах и значениях литералов.

## Ограничения и проверка

Extraction использовался в перечисленных контекстах, но старое обещание «корректно
во всех контекстах» снято. Перенос pending effects может нарушать short-circuit,
порядок receiver/arguments, условные ветви и повторное вычисление loop condition.
Var declaration и effectful assignment имеют разные требования к месту исполнения.
Дополнительные statements и temp также увеличивают стоимость output.

[Checkpoint выражений](../research/compiler-semantics/expression-evaluation.md)
содержит 48 сравнений: 10 PASS и 38 exact XFAIL. Prototypes не являются исправлением
production lowering. [Findings](../compiler/findings.md) и
[pipeline](../compiler/pipeline.md) задают текущий маршрут исследования;
развитие script/module остаётся замороженным.
