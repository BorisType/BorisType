> Исторический материал из `plans/ts-bs-semantics/research/01-expression-evaluation-results.md` (baseline `8ff2739`).
> Статусы, команды и утверждения ниже относятся к описанному этапу; актуальные входы — [refs](../../../README.md).

# E-01: порядок вычисления — первый исследовательский срез

Дополнение 2026-11-05: отчёт сохранён как завершённый research checkpoint.
Рекомендация ниже остаётся предварительной; развитие script/module отложено
до [стратегии памяти](../../../decisions/2026-11-05-script-module-memory-freeze.md).
[Текущий статус и повторные проверки](../results/2026-11-05-research-checkpoint.md).

Дата: 2026-10-08. Статус: **JS research выполнен; рекомендация предварительная,
C pending; production lowering не изменён**. Задачи: F-01 (частично), F-02,
F-04/F-05 (начальный срез), E-01. Findings: R01–R03, R28/R29.

Baseline: `324c588` (merge #32). Runtime identity и команды — в
[отчёте результатов](../results/2026-10-08-expression-baseline.md).
[Brief](01-expression-evaluation.md) остаётся историей исходных гипотез.

## Семантическая основа

Нормативный порядок задаёт ECMAScript, не наблюдаемый target:

- [Logical operators](https://tc39.es/ecma262/#sec-binary-logical-operators):
  GetValue(left), проверка, затем только выбранный right; возвращается operand value.
- [Conditional operator](https://tc39.es/ecma262/#sec-conditional-operator):
  condition, ToBoolean, ровно одна ветка.
- [ArgumentListEvaluation](https://tc39.es/ecma262/#sec-argument-lists-runtime-semantics-argumentlistevaluation)
  и [EvaluateCall](https://tc39.es/ecma262/#sec-evaluatecall): callee/reference,
  GetValue, затем аргументы по порядку. Проверка callable идёт после вычисления
  аргументов обычного call; nullish optional call пропускает аргументы.
- [Optional chains](https://tc39.es/ecma262/#sec-optional-chaining): nullish base
  пропускает дальнейшие key/args/access, не просто итоговый read.
- [Iteration statements](https://tc39.es/ecma262/#sec-iteration-statements):
  while test до body, do test после body, for init/test/body/update; continue
  направляется к правильной точке, после crossed finalizers.
- [IteratorBindingInitialization](https://tc39.es/ecma262/#sec-runtime-semantics-iteratorbindinginitialization):
  default выполняется при undefined, в parameter phase, до тела функции.

Numeric/ToPrimitive/host-object contract этим срезом не определяется.

## Воспроизводимый baseline

Постоянный каталог: [expression-cases.mjs](../../../../packages/bt-ir/test/semantic/expression-cases.mjs).
23 named cases, **48 mode comparisons: 38 точных известных miscompilations,
10 pass controls**. R01–R03 и дополнительные failures воспроизведены отдельно
в script и module с strict TS diagnostics. Module выполняется через codelibrary
`__init`, не как script. Два controls также проверяются в bare без captures.

| Cases                         | JS oracle             | Supplied BS JS actual |
| ----------------------------- | --------------------- | --------------------- |
| r01-and/or-skip               | `0\|false`, `0\|true` | `1\|false`, `1\|true` |
| r01-conditional/nullish-skip  | `0\|7`                | `1\|7`                |
| r02-argument-order            | `AB\|3`               | `BA\|3`               |
| r03-while / for-test          | `3\|2`                | `1\|5`                |
| do-test-frequency             | `3\|3`                | `1\|5`                |
| for-update-frequency          | `0U1U2U\|3`           | `U012\|3`             |
| early-value-before-mutation   | `9\|3`                | `9\|11`               |
| skipped-throw                 | `A`                   | `XC`                  |
| argument-throw-order          | `AXC`                 | `XC`                  |
| receiver-before-argument      | `RAB\|3`              | `BRA\|3`              |
| elseif-skipped-test           | `T`                   | `XT`                  |
| array-element-order           | `AB\|3`               | `BA\|3`               |
| optional-key-skip             | `0\|undefined`        | `1\|undefined`        |
| object-method-branch-skip     | `0\|false`            | `1\|false`            |
| parameter-default-skipped     | `0\|7`                | `1\|7`                |
| parameter-default-before-body | `1\|9`                | `0\|C`                |

Последние два cases — другая форма дефекта, чем R07: здесь default declaration
**не потерян**, но execution помещён в body. Default читает `__oc` до его
объявления/присваивания; при переданном argument ненужный default effect всё равно
выполняется в body. Это отдельный R29.

Baseline runner допускает XFAIL **только** при `--baseline`, по exact
case/mode/expected/actual. Новый failure, exception, timeout, compile error или
unexpected pass делает запуск красным. Default strict запуск красный до fix.
После fix нужно удалить соответствующий baseline entry и сделать case regression.

## Где именно теряется информация

Analyzer корректно обеспечивает captures для этих cases. Потеря порядка уже
видна в raw IR, до passes: executable assignment из `maybeExtract` стоит перед
source statement. Parser passes и emitter сохраняют этот неверный порядок,
runtime исполняет полученный код. Результат не является дефектом optional getter.

Например, R02 в generated script имеет такой порядок (упрощены только имена):

```javascript
__oc = optionalRead(bt.callFunction(second, []));
value = bt.callFunction(add, [bt.callFunction(first, []), __oc]);
```

`optionalRead` здесь обозначение для ternary/getProperty, **не настоящий helper**.
Ожидаемый snapshot первого аргумента отсутствует. Для `x + mutate()?.v`
поздний effect меняет x до его первого runtime read, поэтому одного переноса
effect statements в branch недостаточно.

### Полный список прямых pending producers данного механизма

Все paths ниже относительно `packages/bt-ir/src/lowering`.

| Producer                                 | Содержимое очереди                                      | Требуемая область исполнения                                                  |
| ---------------------------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------- |
| expressions/dispatch: maybeExtract       | scalar declaration + assignment expression              | Execution point исходного expression, не whole statement                      |
| dispatch: createOptionalCheck            | declaration; assignment остаётся inline                 | Declaration можно hoist; inline assignment нельзя отделять от optional base   |
| operators: && /                          |                                                         | / ??                                                                          | declaration; recursive operands могут добавить execution | left eager, right lazy |
| call-helpers: createOptionalFunctionCall | declaration, inline method capture                      | Method read до args; optional args lazy; callable/nullish defect отдельно R11 |
| function-helpers: applyHoisting          | function declaration + descriptor/setup/register writes | Function declaration и function-expression setup имеют разные semantics       |
| expressions/functions                    | child-function pending + parent setup                   | Child parameter/body phase; parent creation point                             |
| bare-visitors                            | plain function declarations + child pending             | Child scope, не parent execution; bare не обеспечивает JS captures            |
| expressions/literals: object methods     | setup, object creation, descriptor.obj writes           | Creation expression; нельзя выполнять в skipped branch                        |
| statements/declarations: classes         | prototype, method/ctor setup, property writes           | Class declaration point; field initializers — instance phase                  |
| visitor: generated file helpers          | file-level setup отдельно от pending                    | Init/setup ABI, не обычный source effect                                      |

Flush boundaries: `transformToIR` для top-level statements;
`visitStatementList` для block/body statements; `visitStatementAsBlock` для single
body; function builders prepend оставшийся child pending к body. Их `hoisted`
переменная означает все collected statements, а не только чистые declarations.
`withPendingScope` также не восстанавливает queue через finally при throw
(code-only observation; отдельный containment task, не причина R01–R03).

### Consumer audit: eager / lazy / repeated / parameter phase

| Consumer                                                     | Риск / evidence                                                                                               | Следующая задача               |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| initializer, assignment, expression statement, return, throw | preceding inline operand может выполниться после extracted sibling; assignment visits RHS before receiver/key | E-05, R/C                      |
| несколько variable declarations                              | later init pending может обогнать earlier init; code-only                                                     | E-07; добавить test            |
| if test                                                      | eager один раз, но siblings/test preludes должны быть ordered                                                 | E-05                           |
| else-if test                                                 | recursive visitor использует наружную queue; `XT` вместо `T`                                                  | E-07                           |
| logical / conditional                                        | RHS и branches lazy; `1` вместо `0`                                                                           | E-04                           |
| optional property/element/call                               | computed key/args conditional; nested key effect утёк                                                         | E-04, C-02                     |
| binary / call / new                                          | order, snapshots, reference; call/new visits args first                                                       | E-05, R-01                     |
| array/object/template/spread                                 | ordered creation and reads; methods also создают pending execution                                            | E-07, L/B/SP                   |
| while / do / for test/update                                 | repeated point, а queue выполняется один раз                                                                  | E-06                           |
| for init / for-in/of iterable                                | once, но ordered относительно test/setup и bindings                                                           | E-06, I-01                     |
| switch discriminant / cases                                  | cases lazy по поиску matching case; ещё parser restriction R28                                                | E-07                           |
| function parameters                                          | execution нужен до body и лишь при default selection                                                          | E-07, P-01                     |
| destructuring defaults                                       | property read и default selection distinct; repetition R12                                                    | B-01                           |
| class extends/fields/ctor params                             | declaration vs per-instance vs parameter points                                                               | K-01; executable audit pending |
| functions внутри выражений                                   | creation setup lazy; body lowering independent                                                                | E-04/P-04                      |

Это полный проход **pending producers/consumers**, не завершённый F-01 inventory
всех TypeChecker/modifier/runtime-library branches. Остальной F-01 остаётся открыт.

### Dispatch boundaries проверенные по коду

Expression dispatcher отдельно маршрутизирует identifier, string/numeric/bool/null,
template/no-substitution template, binary, prefix/postfix, conditional, call,
property/element, object/array, arrow/function expression, parenthesized, non-null,
new, typeof/void/delete, this и as. Иное даёт BT90001. `satisfies`/type assertion
снимаются `unwrapTypeExpressions` в parenthesized path, но не имеют собственного
top-level case — общий T-01 audit ещё нужен.

Assignment token whitelist: `= += -= *= /= %= <<= >>= >>>= &= |= ^=`.
`&& || ??` имеют отдельные branches. Остальные binary tokens проходят через
`tokenToString`/cast без полного target capability validation (R23).
Prefix `++/--` обрабатываются отдельно, unary mapping `- + ! ~`; postfix требует
Identifier/Member (ArgsAccess преобразуется), EnvAccess/property helper rejected.

Calls: super, property/element, XML/internal bypass, type-driven polyfill,
GlobalCache bypass, imported identifier, AbsoluteUrl, builtin/bare identifier,
descriptor identifier, fallback general expression. Property access имеет
import.meta/internal/XML/optional/native distinctions. Эти bypass paths требуют
собственных tests, не covered общим успешным R02 prototype.

## Raw parser capabilities: почему нельзя принять старое ADR на веру

[Native catalog](../../../../packages/bt-ir/test/semantic/expression-native-cases.mjs)
проверяет **raw BS**, без compiler lowering и без bt helpers:

- Grouped ternary корректен на supplied JS в binary operand, argument, array
  element, object value, boolean short-circuit и repeated while condition:
  **6 MATCH**.
- `(conditional).x` даёт parser rejection: grouping не разрешает member receiver.
- `case key:` даёт `Literal value expected in 'case' statement`: **R28**.
  Source switch потребует отдельного semantic lowering, а не только expression prelude.
- C для всех этих native forms ещё неизвестен. Dynamic-case script compilation
  ранее дало тот же parser error; module load завис до watchdog. Timeout не
  объявлен syntax capability и не занесён в XFAIL.

Утверждение ADR-008, что `(ternary) + suffix` обязательно ломается, **не
подтвердилось для выбранных forms/runtime**. Это не доказательство произвольных
nested ternaries, receiver forms или C. ADR пока не superseded.

## Реальные варианты и стоимость

Исполняемые sketches:
[expression-prototypes.mjs](../../../../packages/bt-ir/test/semantic/expression-prototypes.mjs).
Они используют существующие IR builders/emitter, но не меняют visitors. Subset:
boolean conditions, native property reads, явно переданный ledger; нет полного
Reference/call receiver ABI, parameters, do/for/finalizer migration.

| Вариант                                  | Наблюдаемый результат                                  | Плюсы                                                                                        | Минусы                                                                                               |
| ---------------------------------------- | ------------------------------------------------------ | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| A: scope только branch pending           | 3/6 correct; args `BA`, ранний read `11`, while `1\|5` | Малый diff, локально лечит laziness                                                          | Для порядка/frequency нужны общие правила; легко оставить другие producers                           |
| B: value + declarations + execution plan | 6/6 correct                                            | Explicit order/branch/frequency; постепенная миграция visitor API; без новых runtime функций | Нужно freeze ранние reads/callees, разделить declarations/setup; branch materialization verbose      |
| C: semantic tree → normalization         | 6/6 correct, output byte-identical B                   | Можно сохранять lazy/reference meaning между passes, IR-unit tests                           | Новые node kinds требуют walker/collector/pass/validation migration; широкий diff                    |
| I: inline grouping, declarations-only    | 6/6 correct на JS                                      | Native evaluation сохраняет order/laziness/frequency; меньше scalars/code                    | Не выражает effectful setup/object methods/parameter statements; C неизвестен; receiver restrictions |
| D: late pass по сегодняшнему IR          | Не прототипирован                                      | Общая parser normalization                                                                   | Source branch/reference/order уже потеряны; raw IR R01/R02 это показывает                            |
| E: thunks/IIFE/CPS                       | Не прототипирован                                      | Откладывает execution                                                                        | Scopes/this/arguments/closures и calls/env/args allocations; большой контрольный rewrite             |

C sketch намеренно использует normalizer B: он проверяет возможный общий target
shape, **не реализацию новых production IR nodes**. Равная стоимость B/C не
говорит о сложности их интеграции. D/E оценки архитектурные, не measured.

Измеренные **структурные** counts одного probe function, без shared fixture
helpers/caller; все variants включают одинаковый ledger object:

| Case          | B/C bytes / IR nodes / generated bindings | I bytes / IR nodes / generated bindings |
| ------------- | ----------------------------------------- | --------------------------------------- |
| lazy          | 508 / 64 / 3                              | 287 / 45 / 1                            |
| args          | 473 / 66 / 4                              | 291 / 46 / 1                            |
| early-read    | 430 / 60 / 3                              | 288 / 45 / 1                            |
| nested-lazy   | 903 / 107 / 6                             | 409 / 69 / 2                            |
| skipped-throw | 673 / 80 / 3                              | 400 / 61 / 1                            |
| while         | 559 / 74 / 2                              | 377 / 58 / 1                            |

Во всех sketches: zero new env/descriptors/argument-array/helper calls.
Call sites не равны dynamic call count: skipped ветка содержит call site, но
не выполняет его. IR count включает Program; binding count — syntactic unique
generated var names. Heap allocations и C latency **не измерялись**.

## Рекомендация перед реализацией

**B + I fast path**, а не обязательная материализация всех expressions:

1. Явный immutable result `declarations / execution / value`, с extension point
   для Reference. Declarations без initialization могут hoist-иться, effects нет.
2. Сохранять expressions inline, если их target shape проверен и execution
   statements отсутствуют. Grouping conditional не переносит execution.
3. При statementful child упорядочить siblings, snapshot unstable early values,
   помещать plans только в selected branch/точку повторного вычисления.
4. Parser normalization остаётся IR→IR, но не получает обязанность восстанавливать
   уже потерянную source semantics. Полную C модель вводить лишь при доказанной
   необходимости semantic nodes между passes.

Первый vertical slice: conditional extraction без escaping execution + один
initializer/return consumer, nesting/early-read/exception regressions. Затем
logical/optional producers, ordered calls, loop consumers, defaults/literals/
switch. Нельзя закрыть E-04 лишь заменой `maybeExtract`: object-method setup
тоже escaping producer, и computed keys обходят часть call sites.

Если будет отдельный normalization pass, он должен выполнить loop/effect rewrites
**до for-update-desugar/abrupt-completion-desugar**: эти passes фиксируют lexical
targets/finalizer crossings. Target ids и loc сохраняются. Parenthesize/comma/
grouping/literal/hoist идут после semantic placement. При B-only часть placement
может завершаться в lowering, без нового pass. Pass dependency нужно проверить
tests, не просто вставить ещё один элемент в pipeline.

## Прежде чем принять дизайн

- Получить оба C shape probes (B и I), отдельно script/module ABI evidence после fix.
- Перепроверить complex grouped helper expressions через существующие parser
  passes, не только parenthesize sketch.
- Уточнить Reference API / no-extra-pure-cost invariant и параметрическую фазу.
- Добавить finalizer/continue tests к E-06, multi-init/callee throws к E-05/E-07.
- Сравнить pure fast path с baseline, проверить рост nesting и mutation sensitivity.
- После обсуждения принять [draft spec](../specs/01-expression-evaluation.md)
  и ADR для shared API. До этого не делать массовый rewrite.
