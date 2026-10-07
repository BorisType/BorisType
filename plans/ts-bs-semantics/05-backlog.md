# L4. Волны и маленькие задачи

Все пункты ниже — **planned**, не implemented. IDs — стабильные ссылки, не номера PR.
Каждый implementation leaf требует собственной research/spec/test readiness по
[workflow](./03-workflow.md). Таблица задаёт границы, а не заранее утверждённый дизайн.
Tasks с неоднородным diff дополнительно делятся в `tasks/`; одна строка не обязана
равняться одному PR. Указанные зависимости — минимальные, уточняются исследованием.

## F. Минимальный фундамент

| ID   | Результат                                                           | Acceptance / зависимости                                                                                                                   |
| ---- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| F-01 | Exhaustive inventory actual dispatch/token/modifier/helper branches | Каждая ветка связана с mode status/test/finding; нет заявления full support по одному SyntaxKind                                           |
| F-02 | Named baseline probes + strict runner первого семейства             | R01–R03 воспроизводятся, controls проходят, manifest/expected/actual/output сохраняются; ненулевые counts, failure exit                    |
| F-03 | Test registration/filter/exit reliability                           | Связать #30; unknown filter и missing runtime не false-green; unregistered files/empty suites явно обнаруживаются; Node failures не скрыты |
| F-04 | JS/C capability и environment manifest                              | Hash/version/setup + raw/compiled/control probes; initial small expression C pack; выполнять постепенно, не ждать полного C inventory      |
| F-05 | Output invariant и cost helpers                                     | AST assertions, hygiene/syntax checks, структурные counts; reusable baseline без произвольного универсального budget                       |
| F-06 | Runtime CI provisioning protocol                                    | Связать #29; approved local provisioning/permissions, не commit runtime; CI gate только при реальном execution                             |

F-02 сначала минимален. Универсализация runner — отдельный follow-up после первой
feature family. F-03/F-06 не должны задерживать read-only research E-01.

## Ранние локальные исправления

Волны не означают, что P1 exported-binding failure должен ждать весь functions
audit. После permanent reproduction можно выделить узкий slice: R04 setter result,
R06 captured export read, R14 template conversion, R22 naming, K10 hex/E и R19 end=0.
Для него сначала исследовать прямо затрагиваемое правило и принять мини-spec;
не требуется завершать всю family spec, если её остальные части не меняются.
Такой slice не закрывает compound references, live exports, coercion или весь
polyfill. Основной expression design идёт своим маршрутом; новые abstractions
не должны закреплять обходы, которые потом невозможно безопасно мигрировать.

## E. Expression evaluation — первый семантический core

| ID   | Результат                                            | Acceptance / зависимости                                                                                      |
| ---- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| E-01 | Исследование pending statements и сравнение дизайнов | F-02; recommended option, prototype/output trade-offs; brief в research, не массовый rewrite                  |
| E-02 | Spec evaluation points + выбранная representation    | E-01; порядок, count, laziness, throws, mode boundaries; ADR для shared design                                |
| E-03 | Core API/IR primitive + один vertical slice          | E-02/F-05; immutable/hygienic, не меняет simple path, bootstrap-safe; branch case R01                         |
| E-04 | Logical/conditional branch evaluation                | E-03; R01, nested &&/                                                                                         |     | /??/?:, effects only selected branch, boolean vs value semantics |
| E-05 | Ordered operands/callee/arguments                    | E-03; R02, early operand reads frozen before later effects, throws stop remaining args                        |
| E-06 | While/do-while/for evaluation frequency              | E-03; R03, tests/updates repeated at correct points, continue + finalizers + condition throw                  |
| E-07 | Literals/defaults/switch consumers migration         | E-04/E-05; each consumer separately, object/array/template source order, case expressions only when evaluated |
| E-08 | Retire unsafe extraction paths и интеграция passes   | E-04–E-07; no orphan pending effects, pipeline order/loc/targets, full abrupt gate + C pack                   |

E-06 нельзя принимать только по `while`: do-continue идёт к condition, for-continue
к update, и finally может заменить completion. Generated fuel не production fix.

## H. Hygiene/parser safety — сквозная волна

| ID   | Результат                                                | Acceptance / зависимости                                                                                                 |
| ---- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| H-01 | Shared naming для literal-extract и остальных generators | R22; source/generated names, nested scopes, deterministic output; F-05                                                   |
| H-02 | Precedence/associativity/token support audit             | Operators/types matrix; valid native subset, ** и logical assignment получают lowering либо explicit temporary rejection |
| H-03 | Effect-safe literal extraction/grouping/comma handling   | E-02; real IR-targeted tests во всех contexts/modes, no frequency/branch escape                                          |
| H-04 | Hoist/declaration timing/pass metadata invariants        | E-08/S-01; duplicate var, source locations/control targets и parameters без redeclaration                                |

H-01 и локальный numeric fix могут идти раньше E-08, если acceptance ограничен и
не требует нового expression API. Parser-safety migration следует выбранному E design.

## R/C. References и calls

| ID   | Результат                                    | Acceptance / зависимости                                                                                |
| ---- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| R-01 | Reference contract/model                     | E-02; value vs location, receiver/key order/once, property coercion/errors, native/XML bypass           |
| R-02 | Property assignment result                   | R-01; R04, nested/chained assignments, exception timing, helper return/ABI compatibility                |
| R-03 | Compound/logical assignment                  | R-01/E-04; R05, get-before-RHS, receiver/key once, aliasing, RHS skipped where required                 |
| R-04 | Prefix/postfix update + delete               | R-01; R24, identifier/captured/member targets, old/new result, non-configurable/property model boundary |
| C-01 | Type-wrapper/callee normalization            | E-05; K09, parenthesized/non-null/as/satisfies calls, call result and descriptor routing                |
| C-02 | Optional call nullish semantics              | C-01/E-04; R10/R11, nullish skips args, non-null noncallable throws, receiver/key preserved             |
| C-03 | Method extraction/receiver/function identity | R-01/FUNC spec; raw native/desc/prototype/host methods, lexical this vs ordinary this                   |
| C-04 | Spread args и call arity                     | E-05/P-02; source order, flatten supported iterables, 0/1/5/6+ args, unsupported forms diagnosed        |

## S/P/I. Scopes, функции, параметры и итерация

| ID   | Результат                                          | Acceptance / зависимости                                                                                                          |
| ---- | -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| S-01 | Binding/TDZ/const/hoist contract                   | Scope graphs, rename/capture slots, source binding identity; assess implementation cost, не объявлять runtime enforcement готовым |
| P-01 | Defaults во всех function forms                    | E-07/S-01; R07/K06, missing vs undefined, order, dependent params, default side effects/captures and parameter environment        |
| P-02 | Rest extraction/bootstrap                          | FUNC ABI spec; R08/K05, helper availability/arity, fresh rest array, script/module/bare boundaries                                |
| P-03 | Lexical arrow this/arguments                       | S-01/C-03; R09, nested arrows inside ordinary functions/methods, construction/callWithThis interactions                           |
| P-04 | Function declaration/expression/recursion/hoisting | S-01/C-01; named self-binding, declaration timing, repeated calls/reentrancy, captures/defaults                                   |
| P-05 | Function reflection/operators assessment           | R26; typeof/isFunction/instanceof/call/apply/bind, feasibility and explicit boundaries                                            |
| I-01 | Classic for initializer list                       | E-06/S-01; K01/#28, all initializers once including zero iterations, correct renamed/captured header slot                         |
| I-02 | Classic for-let per-iteration env                  | I-01/S-01; K08, 0/1/2 captures, body/header/update references, break/continue/finally                                             |
| I-03 | For-in key enumeration и target shapes             | R-01/S-01; R25, object/array keys, shadowing, assignment target, host/XML boundaries                                              |
| I-04 | For-of iterable contract                           | E-06/S-01; arrays/strings, let vs var, holes/mutation/order; assess iterator protocol and IteratorClose, staged support decision  |

Catch per-entry semantics уже реализована: включить её в S/P/I regressions, не
менять автоматически. Custom iterators/IteratorClose требуют отдельной feasibility
spec и могут создать новые implementation tasks, а не исчезнуть из inventory.

## L/B/SP/T. Литералы, bindings и TypeScript forms

| ID    | Результат                                   | Acceptance / зависимости                                                                                         |
| ----- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| L-01  | Template string conversion                  | R14; always string, each span once/in order, exception/coercion boundary, E-05 integration                       |
| L-02  | Numeric raw normalization                   | K10; radix before E/e detection, separators, exact decimal text, no unintended JS Number round-trip              |
| L-03  | Numeric/string platform contract            | F-04; safe integers, wider int/real, overflow/bitwise/NaN/negative zero/Unicode, separate Node vs platform tests |
| B-01  | Destructuring source/default reads once     | E-07/R-01; R12, object source and property once, lazy default, aliasing/errors                                   |
| B-02  | Nested/computed/rest/captured bindings      | B-01/S-01; R13, ordered keys/exclusions, captured slots, nested holes/defaults, object nullish rules             |
| B-03  | Patterns in parameters/assignment/loop/bare | B-02/P/I; exact diagnostics для ещё не implemented forms; staged new support без silent skip                     |
| SP-01 | Object spread copying/member semantics      | E-07/R-01; R15, methods/accessors/keys, source order, fresh result, nullish/string sources                       |
| SP-02 | Spread copy strategy/array semantics        | SP-01/I-04; copy complexity, no cumulative avoidable copies, holes/aliases; cost report + C sizes                |
| T-01  | Universal runtime type-wrapper erasure      | C-01; as/non-null/satisfies/type assertion во всех contexts, no descriptor bypass                                |
| T-02  | Enum semantics                              | F-01; K02, const/runtime/computed/reverse mapping, exact supported subset и ordered effects                      |
| T-03  | Namespace semantics                         | F-01/MOD spec; K03, nested/merged/exported bindings и side effects, reject не substitute namespace support       |
| T-04  | Exhaustive source validation                | F-01; K04/K11/R23, async/generator/class/identifier/modifier unsupported paths; Error + range + no output        |

T-04 — набор мелких validation tasks, а не разрешение заменить все feature fixes
запретами. Numeric contract/user choice не блокирует локальное устранение hex/E дефекта.

## M/K. Modules и classes

| ID   | Результат                                  | Acceptance / зависимости                                                                                        |
| ---- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| M-01 | Module ABI/live-binding spec               | R/S/P; export storage vs read binding, import identity, function descriptors, version/migration plan            |
| M-02 | Captured export correctness                | M-01; R06 initializer без undeclared refs, exported functions/vars/re-exports                                   |
| M-03 | Mutable live exports                       | M-01/R-03; R06 mutations/rebinding/closures, two-file imports and cycles, not snapshot semantics                |
| M-04 | Default/type-only/re-export/naming         | M-01; R27 reproduction, export default forms, no type-only require side effect, collision-safe module refs      |
| M-05 | Module loader initialization/cache/failure | M-01; cycles, throw during init, cleanup/retry, lock/reentrancy, реальные platform contexts                     |
| K-01 | Constructor/derived-field ordering         | P/R; R16, implicit super(args), fields after super, explicit returns, thrown initializer                        |
| K-02 | Prototype/receiver/member support          | K-01/C-03; inheritance/method identity, static/accessor/private/computed/parameter properties; staged contracts |
| K-03 | Class/closure/module integration           | M/P/K; script/module descriptors, arrow fields, repeated instantiation, nested classes, cost + C pack           |

Объекты HCM/XML и ordinary JS objects не смешивать в одну prototype/property model.
Breaking ABI change требует отдельно утверждённого deployment plan.

## A. Runtime library и dispatch

| ID   | Результат                               | Acceptance / зависимости                                                                                 |
| ---- | --------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| A-01 | Type-based dispatch + availability      | F-01/C-01; R20/R21, arrays/tuples/readonly/unions/any/generics, declared method vs implemented helper    |
| A-02 | Argument presence representation        | P/M runtime ABI assessment; R17/R18, omitted vs explicit undefined без потери информации при padding     |
| A-03 | Mutation/copy methods                   | A-02; R17/R19, отдельные splice/toSpliced/copyWithin/fill tasks, negative/fractional/zero/end boundaries |
| A-04 | Callback/reduce/search methods          | A-02/P/C; R18, отдельные map/filter/forEach/every/some/find/reduce tasks, thisArg/holes/mutations/order  |
| A-05 | String/number/object/math methods       | A-01/L-03; implementations vs stubs, Unicode/coercion/arity, отдельная spec + tests каждого метода       |
| A-06 | Polyfill complexity/platform validation | A-03–A-05; per-method costs at N sizes, no semantic drift, JS/C evidence для accepted subset             |

A-03–A-05 обязательно раскрыть в leaf tasks по методам: один passing `.splice`
case не закрывает Array family. R19 — независимо исправимый zero-end case,
но не доказательство общей ToIntegerOrInfinity semantics.

## X. Завершение программы работ

| ID   | Результат                              | Acceptance                                                                                                       |
| ---- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| X-01 | Cross-feature regression matrix        | Every spec rule + dependency edges, bounded generated cases, no blanket skips                                    |
| X-02 | Final JS/C output/cost acceptance      | Current commit/hash/modes, runtime setup/version, remaining unknowns/deferred tasks явно перечислены             |
| X-03 | Documentation/inventory reconciliation | Reference, modes, READMEs, ROADMAP, outdated architecture/ADR statements; public guarantees совпадают с evidence |

## Предлагаемый первый цикл

`F-02 (R01–R03 + controls) → E-01 → E-02 → E-03 → E-04`, с поддержкой
F-01/F-04/F-05. Затем E-05/E-06 и reference model. До E-03 сначала показать
варианты и результаты исследования; первый PR не должен содержать сразу все волны.
