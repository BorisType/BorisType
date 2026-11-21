# Реализованные идеи и отложенные предложения

Статус сверки source: 2026-11-11. Это смысловой итог старых `ref/proposals/`,
IR algorithm notes и gen reviews, а не backlog разрешённых compiler features.
Материалы по прежним режимам сохранены в
[архивном обзоре](https://github.com/BorisType/BorisType/blob/7a0b6a26a004f480f76fad9d534fedcde9f8aea7/refs/compiler/proposals.md).

## Computed keys и parameter patterns

**Не реализованы; диагностически отклоняются.** `PropertyAssignment` с computed
key даёт BT90010 в [literals](../../packages/bt-ir/src/lowering/expressions/literals.ts).
Destructured parameters дают BT90011 в обоих путях
[function-helpers](https://github.com/BorisType/BorisType/blob/7a0b6a26a004f480f76fad9d534fedcde9f8aea7/packages/bt-ir/src/lowering/function-helpers.ts) и
[bare-visitors](../../packages/bt-ir/src/lowering/bare-visitors.ts).
Это исправление silent drop/skip, а не поддержка фичи.

Computed key можно представить temp object + ordered assignments, но старый
sketch `var obj={other:1}; obj[key]=value` переставляет initialization, если
`[key]:value` шёл первым. Нужно сохранить source key/value order, однократную
оценку и throws, spread/method combinations. IR `key: string` само по себе
недостаточно; выбор richer IR против lowering в writes требует effect model.

Для `f({a,b,c=10})` предлагали generated `__p0` и body prelude property reads с
undefined-default. Это лишь sketch: parameter initialization происходит до body,
reads/defaults должны быть ordered/once, captured names зарегистрированы analyzer.
Nested object/array patterns, rest, omitted/explicit undefined и bare bootstrap
имеют отдельные boundaries. E-01/R29 уже показывает, почему простой body prelude
не является общим решением. Historical estimates 1 hour diagnostic / 2–3 days
implementation не были измеренными затратами и не являются текущей оценкой.

## Break/continue через finalizers

**Реализовано другой моделью; старый proposal superseded.** Первоначально
предлагалось добавить type 3/4 к throw-sentinel try-finally state machine.
Это не устраняло перехват return пользовательским catch, losing return-expression
throw, lexical catch shadowing и target identity. Принята единая
[structured completion](control-flow.md) с native exception bridges и shared
bindings, реализована в [abrupt pass](../../packages/bt-ir/src/passes/abrupt-completion-desugar.ts).
BT90012 остаётся reserved; старое ограничение не является текущим контрактом.
Catch patterns/Annex B labelled functions по-прежнему BT90016/90017.

## Целевые операции и совместимость

Безопасность прямого вызова метода зависит от типа, возможностей платформы
и допущений для конкретного выражения. Отдельному предложению по оптимизации
нужны наблюдения по эффектам, аргументам и целевому runtime.

## Declaration emit

**Реализован compiler mechanism, integration gaps явно сохраняются.** Один
TS Program + `emitDeclarationOnly/noEmitOnError` выбран вместо второго Program,
custom writeFile фильтра и subprocess tsc. Причины и actual paths —
[pipeline](pipeline.md). Старые watch/linking/multi-package checkboxes не являются
completed tests; отдельной новой проверки их здесь нет. Source maps BS output
по-прежнему unscheduled; declarationMap — другой механизм TypeScript.

## Типы, verifier, walker и optimizer

**Unscheduled, до конкретного use case.** Варианты type-aware passes:

| Вариант                               | Цена и ограничение                                                                     |
| ------------------------------------- | -------------------------------------------------------------------------------------- |
| `ts.Type` на IR                       | Больше IR, ts.Type не сериализуется напрямую; rewrites должны поддерживать annotations |
| optional TypeChecker в PassContext    | Меньше migration; снова связь passes с TS API, harder pure-IR tests                    |
| TypeAnnotator + serializable typeHint | Отделяет consumer, но нужен устойчивый IR→TS mapping/identity и политика invalidation  |
| Контекст лишь отдельным passes        | Локальный diff, неодинаковый API и dependency handling                                 |

Исторические sketches оценивали 1–2 дня context и 3–5 дней annotator, без
выполнения. Наличие optional SourceFile в современном PassContext не означает
TypeChecker/type annotation support. Parent/scope WalkContext, unified statement+
expression mapper, debug verifier, builder validation, DCE/constant folding/inline
expansion и custom flag combinations остаются конкретными design options;
[аудит](findings.md) не объявляет их необходимыми для каждого изменения.

## Синхронизация platform objects

**Unscheduled CLI/runtime proposal 2026-04-01**, не существующий `btc objects` API.
Идея: `objects pull` получает изменённые HCM XML objects, фильтрует types,
интерактивно закрепляет за package и сохраняет `objects/<type>/<id>.xml`.
Per-package-only выбран вместо global shared layer: независимые репозитории
не конфликтуют; общий пакет можно создать обычным образом. XML сохраняет
platform format; JSON добавлял бы преобразование. Вставка отсутствующего ID была
исторической гипотезой, её platform безопасность здесь не подтверждалась.

Планировал `.btc/objects-cache.json` (lastSync/index, ignored), fallback к дате
последнего commit, обновление existing ID на месте, выбор package для нового.
Commit timestamp не является доказательством полноты remote changes, а локальный
cache не решает concurrent edits. Первая итерация не требовала linking optimization.
Позже `collectObjects` копировал бы XML в dist и `.objectmap.json`, обычный
uploadDist переносил bytes, runtime init loader делал бы upsert без отдельного
pushObjects. Watch/incremental push — следующий этап, не реализованная гарантия.

Открыты types первого subset, stable ID/ownership, conflict/diff/deletion policy,
replay/retry, schema validation, cache fallback, atomicity и side effects upsert,
manual push и runtime memory/lifetime. Эти вопросы не разрешаются документационным
переносом и не дают авторизации обращаться к серверу. Текущее CLI направление
ищи в [CLI refs](../cli/README.md).
