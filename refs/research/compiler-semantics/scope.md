# Непроверенные семантические области

Это сохранённая область исследования 2026-10-07/08, сверенная на этапе
документационной консолидации 2026-11-11. Она не обещает поддержку и не назначает
следующий набор PR. Script/module и зависимые ABI задачи **on hold** до
[стратегии памяти](../../decisions/2026-11-05-script-module-memory-freeze.md).
Bare — активное направление с ограниченным native subset.

Expression producers/consumers проверялись в [E-01](expression-evaluation.md);
полный dispatch/token/modifier/helper/runtime inventory F-01 не завершён.
[R/K findings и reproductions](../../compiler/findings.md) задают наблюдаемые gaps.
ID ниже сохранены как смысловые ссылки; одна строка не означает согласованную
implementation task. Diagnostics/rejection защищают от corruption, но не закрывают
достижимую семантику.

## Семантические семейства

| ID     | Семейство                                      | Основные места реализации                                                                       | Что надо доисследовать                                                                                                           |
| ------ | ---------------------------------------------- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| EXPR   | Evaluation/order/laziness                      | lowering `expressions/dispatch.ts`, `operators.ts`, `calls.ts`, `visitor.ts`                    | pending effects, eager/lazy contexts, loop frequency, abrupt expression evaluation                                               |
| REF    | References/property/mutation                   | `operators.ts`, `dispatch.ts`, runtime `semantic.ts`                                            | receiver/key once, assignment/update result, compound/logical assignments, delete, nullish errors, property presence             |
| CALL   | Calls/optional chains                          | `calls.ts`, `call-helpers.ts`, `module-access.ts`, `semantic.ts`                                | callee before args, optional boundaries, noncallable values, receiver binding, wrappers, spread args                             |
| SCOPE  | Bindings/hoist/captures                        | analyzer `scope-analyzer.ts`, lowering `binding.ts`, `env-resolution.ts`, pass `hoist.ts`       | shadowing, per-call/per-entry/per-iteration bindings, TDZ/const contract, declaration timing                                     |
| FUNC   | Function ABI/parameters                        | `function-builder.ts`, `function-helpers.ts`, `expressions/functions.ts`, declarations, emitter | default/missing/undefined, rest, named recursion, function hoisting, lexical this/arguments, reflection                          |
| ITER   | Loops/iteration                                | `statements/loops.ts`, analyzer, update/completion passes                                       | all for initializers, lexical header slots, assignment targets, keys vs values, strings, holes, iterator closing                 |
| LIT    | Templates/numeric/string/array/object literals | `literals.ts`, numeric normalization in `dispatch.ts`, emitter                                  | ToString/ToPrimitive, precision, computed/shorthand/method/accessor members, sparse values, regex/bigint boundaries              |
| BIND   | Destructuring                                  | declarations, bare visitors, runtime `destructuring.ts`                                         | source once, nested/default/rest, capture slots, computed keys, params/assignment/loop patterns, iterator semantics              |
| SPREAD | Object/array/call spread                       | `literals.ts`, `spread-helpers.ts`, calls, native ArrayUnion                                    | evaluation/copy order, methods/accessors, nullish/strings, holes, aliases, copying complexity                                    |
| MOD    | Imports/exports/module ABI                     | declarations, module access, visitor, runtime `require.ts`, btc build/linking                   | live mutable exports, captured bindings, default/re-export/type-only, name collisions, cycles/cache/failure cleanup              |
| CLASS  | Classes/prototypes/constructors                | declarations, calls, runtime semantic helpers                                                   | super/default derived ctor, field order, constructor return, prototype lookup/identity, static/accessor/private/computed members |
| LIB    | Builtins/polyfills/type dispatch               | lowering `helpers.ts`, `polyfill-spec.ts`, emitter spec, runtime `polyfill/*`                   | available implementation vs accepted method, tuples/unions/any, omitted args, callbacks/thisArg, numeric/string edge cases       |
| CF     | Existing control flow                          | `control-target-resolver.ts`, `abrupt-completion-desugar.ts`, `for-update-desugar.ts`           | interactions with newly lowered expressions, fuel guards, source locations/control targets; retain current gates                 |
| SAFE   | Parser safety/output hygiene                   | parenthesize/comma-safety/cleanup-grouping/literal-extract/hoist, emitter                       | precedence/associativity, effect placement, generated names, grouping receivers, exhaustive syntax validation                    |
| TS     | Type erasure/source rejection                  | both dispatchers, analyzer, diagnostics, btc checks, eslint rules                               | enum/namespace runtime meaning, as/non-null/satisfies/assertions, modifiers, decorators, unsupported syntax without silent erase |
| API    | Modes/integration                              | pipeline API, ModeConfig, btc selection/build/watch                                             | entrypoint differences, runtime bootstrapping, ABI compatibility, deterministic output and diagnostics                           |

Paths выше относительно `packages/bt-ir/src`, если не указано `runtime`
(`packages/builtin-runtime/src`) или btc (`packages/bt-cli/src`).

## Сведения для завершения inventory

Для завершения F-01 нужно связать каждый SyntaxKind/token/modifier/member или runtime method со следующими сведениями (отдельные файлы-карточки не требуются):

```text
feature ID / source form / implementation symbol
bare: supported | partial | rejected | silently-erased | unknown
script: ...
module: ...
IR nodes / passes / runtime dependencies
spec rule IDs / diagnostic code + category + source range
test IDs + expected counts / output invariant IDs
JS observed status / C observed status
known findings / open questions / owner task
```

Проверять не только верхний `SyntaxKind`, но и вложенные forms. Например:

- `CallExpression`: identifier/property/element/parenthesized/non-null/call result;
  optional token на receiver и на call, spread argument, type-only wrapper.
- `VariableDeclaration`: identifier/object/array/nested patterns, captured/exported,
  declaration list, default/rest и источник с effects.
- `ClassDeclaration`: каждый member/modifier, implicit/explicit derived ctor,
  field initializer, parameter property, computed/accessor/static/private.
- `Function`: declaration/expression/arrow/method; body/no-body; async/generator;
  binding/capture/default/rest/overload.
- `For`: init declaration **list**, each target shape, test/update effect placement,
  renamed/captured header binding, continue/finalizer path.

TypeScript errors, BT errors и ESLint запреты проверять отдельно. `compileSourceFile`
собирает BT diagnostics; вызывающий consumer отвечает за TS diagnostics. Отсутствие
TS ошибки не делает форму реализованной, ESLint не заменяет compiler validator.

## Имеющиеся positive controls

На baseline supplied JS surface probes прошли: simple closure factory с двумя
calls (`2|3`), block shadow (`1|2|1`), array for-of let captures (`1|2`) и var
captures (`2|2`), plain logical values (`7|0|false`), array spread (`0,1,2,3`),
обычный object spread с effects (`AB|2`), basic class instance (`3`), readonly
array join (`1,2`). Это seed cases, не доказательство целых family contracts.

Отдельный current gate проверяет labels/finalizers/update. Новые migrations
обязаны сохранять эти positive controls и unchanged simple-output paths.

## Полнота по взаимодействиям

Начальная обязательная interaction карта:

| Изменённая основа        | Обязательные downstream проверки                                                               |
| ------------------------ | ---------------------------------------------------------------------------------------------- |
| Expression evaluation    | args/callee, defaults, literals, loops, switch cases, return/throw/finally                     |
| Reference lowering       | compound/update/delete, optional calls, destructuring assignments, XML/host fast paths         |
| Scope/environment        | parameters, arrows, catch, loop bindings, imported/exported functions, classes                 |
| Function ABI             | callbacks/polyfills, module descriptors, recursion, constructors/super, bare runtime bootstrap |
| Literal/binding lowering | source once, side-effectful defaults/keys, nested patterns, captures, export bindings          |
| Module ABI               | live imports/exports, cycles, initialization failure, deployment/version compatibility         |
| Parser-safety pass       | every affected IR node/context/mode, target identity/loc, naming and frequency                 |

Unprobed ordinary `if`/switch/coercion/typeof/instanceof/in/unary behavior также
в inventory. Не считать семантику нативного оператора равной JS автоматически.

## Границы «всех проблем»

В scope: все известные findings + все ветки текущих реализованных transforms,
their helpers и разумная targeted interaction matrix. Для ещё не реализованных
async/generator/full iterator/reflection механизмов обязательны assessment и
explicit support decision; полноценный новый engine/continuation runtime не
считается заранее согласованным scope.

Запись закрывается как `fixed` только с evidence. `unsupported/deferred` требует
явного обоснования и сохраняет unresolved feature work, если semantics достижима.
Новые найденные gaps добавляются с ID в findings/backlog, не маскируются новым expected.

## Нерешённые контракты и критерии проверки

### F. Минимальный фундамент

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

### Ранние локальные исправления

Волны не означают, что P1 exported-binding failure должен ждать весь functions
audit. После permanent reproduction можно выделить узкий slice: R04 setter result,
R06 captured export read, R14 template conversion, R22 naming, K10 hex/E и R19 end=0.
Для него сначала исследовать прямо затрагиваемое правило и принять мини-spec;
не требуется завершать всю family spec, если её остальные части не меняются.
Такой slice не закрывает compound references, live exports, coercion или весь
polyfill. Основной expression design идёт своим маршрутом; новые abstractions
не должны закреплять обходы, которые потом невозможно безопасно мигрировать.

### E. Expression evaluation — первый семантический core

| ID   | Результат                                            | Acceptance / зависимости                                                                                      |
| ---- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| E-01 | Исследование pending statements и сравнение дизайнов | F-02; recommended option, prototype/output trade-offs; brief в research, не массовый rewrite                  |
| E-02 | Spec evaluation points + выбранная representation    | E-01; порядок, count, laziness, throws, mode boundaries; ADR для shared design                                |
| E-03 | Core API/IR primitive + один vertical slice          | E-02/F-05; immutable/hygienic, не меняет simple path, bootstrap-safe; branch case R01                         |
| E-04 | Logical/conditional branch evaluation                | E-03; R01, nested logical/nullish/conditional, effects only selected branch, boolean vs value semantics       |
| E-05 | Ordered operands/callee/arguments                    | E-03; R02, early operand reads frozen before later effects, throws stop remaining args                        |
| E-06 | While/do-while/for evaluation frequency              | E-03; R03, tests/updates repeated at correct points, continue + finalizers + condition throw                  |
| E-07 | Literals/defaults/switch consumers migration         | E-04/E-05; each consumer separately, object/array/template source order, case expressions only when evaluated |
| E-08 | Retire unsafe extraction paths и интеграция passes   | E-04–E-07; no orphan pending effects, pipeline order/loc/targets, full abrupt gate + C pack                   |

E-06 нельзя принимать только по `while`: do-continue идёт к condition, for-continue
к update, и finally может заменить completion. Generated fuel не production fix.

### H. Hygiene/parser safety — сквозная волна

| ID   | Результат                                                | Acceptance / зависимости                                                                                                 |
| ---- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| H-01 | Shared naming для literal-extract и остальных generators | R22; source/generated names, nested scopes, deterministic output; F-05                                                   |
| H-02 | Precedence/associativity/token support audit             | Operators/types matrix; valid native subset, ** и logical assignment получают lowering либо explicit temporary rejection |
| H-03 | Effect-safe literal extraction/grouping/comma handling   | E-02; real IR-targeted tests во всех contexts/modes, no frequency/branch escape                                          |
| H-04 | Hoist/declaration timing/pass metadata invariants        | E-08/S-01; duplicate var, source locations/control targets и parameters без redeclaration                                |

H-01 и локальный numeric fix могут идти раньше E-08, если acceptance ограничен и
не требует нового expression API. Parser-safety migration следует выбранному E design.

### R/C. References и calls

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

### S/P/I. Scopes, функции, параметры и итерация

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

### L/B/SP/T. Литералы, bindings и TypeScript forms

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

### M/K. Modules и classes

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

### A. Runtime library и dispatch

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

## Условия дальнейшей работы

После memory strategy и принятия expression design первый vertical slice E-03a
ограничен declarations/execution/value primitive и одним initializer/return
consumer: pure-path identity, early snapshots, loc/targets, без переписывания ABI.
Далее отдельные branch/optional/logical producers (E-04a), callee/args/Reference
(E-05a), while → do/for/continue/finalizer (E-06a), parameter/literal/multi-decl/switch
consumers (E-07a). Они ещё не spec-ready и не означают разрешение начать migration.

Завершение семейства требует cross-feature interactions, актуальных JS/C gates,
output/cost review и согласования публичного subset с evidence. Простой passing
case, временный rejection или документационная миграция этого не заменяют.
