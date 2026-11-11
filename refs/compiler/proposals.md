# Реализованные идеи и отложенные предложения

Статус сверки source: 2026-11-11. Это смысловой итог старых `ref/proposals/`,
IR algorithm notes и gen reviews, а не backlog разрешённых compiler features.
Bare — активное направление; script/module ABI и зависимые proposals **on hold**
до [решения памяти](../decisions/2026-11-05-script-module-memory-freeze.md).
[Findings](findings.md) отделяют наличие механизма от семантической корректности.

## Computed keys и parameter patterns

**Не реализованы; диагностически отклоняются.** `PropertyAssignment` с computed
key даёт BT90010 в [literals](../../packages/bt-ir/src/lowering/expressions/literals.ts).
Destructured parameters дают BT90011 в обоих путях
[function-helpers](../../packages/bt-ir/src/lowering/function-helpers.ts) и
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

## Native boolean logical optimization

**Не принято как default; unscheduled, script/module on hold.** Идея 2026-03-09:
если оба TS типа boolean, оставить native `&&`/`||` вместо temp + bt.isTrue ternary.
Экономятся generated scalar, helper call и output bytes. Но type assertions,
`any`, неточная external declaration и `JSON.parse` могут дать string/0/null в
runtime. JS возвращает operand value; native BS может потребовать effective
boolean и бросить exception. TS type не является доказательством runtime value.

Историческое утверждение review «rejected» относится к небезопасному default,
не к измеренному запрету всех вариантов. Предлагались experimental
`nativeBooleanLogical` compiler option/CLI flag, conservative boolean-only
(non-union) check и отдельная runtime validation. Эти интерфейсы **не существуют**
в production API. `satisfies` не преобразует runtime значение, как и `as`.
Перед пересмотром нужны реальные size/timing measurements и semantic boundary;
`??` — nullish, не boolean optimization. Bare уже использует native operators
в своём ограниченном subset; это не основание менять frozen script/module.

## Нативные методы объектов

**Непринятое исследовательское предложение**, не спецификация Datex API.
Явные `GetProperty/GetOptProperty/SetProperty/AddProperty/HasProperty` могли бы
проходить как обычный method call, заменяться bt helpers, оставаться native или
иметь hybrid dispatch. Цена wrapper path — дополнительные calls; helper alias
может менять missing/null behavior и собственный override; native bypass не
добавляет null guards. Hybrid GetOpt → optional helper, Get → required read,
Has → presence helper, Add → отдельная операция требует различать presence и
undefined, XML/host/ordinary object semantics.

[Calls](../../packages/bt-ir/src/lowering/expressions/calls.ts) уже имеют
XML/internal/type-driven native bypass, поэтому старое «все эти вызовы всегда
обёрнуты» неверно. [Spread helpers](../../packages/bt-ir/src/lowering/spread-helpers.ts)
используют native property operations; одинаковое имя не доказывает эквивалентность
операций. Для выбора нужны конкретные Datex articles + declaration revision и
bounded runtime evidence. В этой миграции они не проверялись; список API —
исторические вопросы, не подтверждённые сигнатуры.

## Классы и прототипы

**Базовый механизм реализован в script/module; общая JS class semantics не
реализована, развитие frozen.** [Class lowering](../../packages/bt-ir/src/lowering/statements/declarations.ts)
строит hoisted method/constructor functions, prototype object и constructor
descriptor с `.proto`, регистрируя class binding через env. `extends` связывает
prototype `__proto`, `super()`/`super.method()` используют callWithThis, чтобы
передать текущий receiver вместо descriptor.obj. Callable resolution должна
учитывать captured scope и renamed binding.

[Runtime semantic](../../packages/builtin-runtime/src/semantic.ts): createInstance
создаёт `{__proto: ctor.proto}`, вызывает constructor descriptor и возвращает
instance; native ctor fallback пока игнорирует args. Prototype lookup идёт по
`__proto`, found function descriptor копируется с `.obj = instance` (Variant A).
Кеш Variant B уменьшил бы повторные copies, но усложняет invalidation/identity и
может усилить receiver cycles; он не принят. Ordinary function/env allocation
оптимизируется только при доказанной lifetime/capture корректности.

Старый proposal приводил 13 prototype/class fixtures (basic/no-ctor/multi-instance/
property-init, inherit/override/chain/super и data/method-binding/proto-chain/
own-over-proto/missing): [tests/src](../../tests/src/). Это historical JS coverage,
не доказательство derived constructor forwarding/field order, constructor return,
static/accessor/private/computed members, `instanceof`, abstract/type erasure,
lexical arrow this, shared method identity или C memory acceptance. R16 фиксирует
implicit derived ctor failure; полный member/modifier audit ещё открыт. Не
переносить старые описания field-before-body на все derived constructors.

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
