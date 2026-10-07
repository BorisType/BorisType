# L1. Карта преобразований и полнота аудита

Статус: начальная карта по surface review, **не** завершённый exhaustive audit.
`F-01` должен сопоставить её с фактическими dispatch branches, operator tokens,
modifiers, TypeChecker decisions и runtime exports. Пустая клетка не означает support.

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

## Обязательная карточка каждой ветки

В `F-01` для каждого SyntaxKind/token/modifier/member либо runtime method записать:

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
