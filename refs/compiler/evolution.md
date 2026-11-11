# Почему компилятор устроен так

Эта запись извлекает полезные основания gen-1/2/3 (2026-03-12–18) вместо
параллельных планов, отчётов и взаимоисключающих reviews. Текущая реализация —
[pipeline](pipeline.md); повторная проверка старых findings — [findings](findings.md).
Исторические тексты доступны в baseline `8ff2739` карты миграции, прежние пути
`ref/temp/gen-{1,2,3}/`. Старые приоритеты/оценки не являются текущим планом работ.

## IR, helpers и разделение обязанностей

[IR вместо TS transformers](../decisions/2026-02-23-ir-over-transformers.md)
выбран из-за зависимого порядка transformers, mutation AST, разрозненного state
и сложности наблюдения промежуточных форм. Это не отменяет ordering dependencies:
теперь они выражены в IR pipeline. Фраза старого документа «единый проход»
заменена явным lowering → passes → emitter. Source maps облегчены наличием loc,
но не реализованы самим выбором IR.

Первый split отделил operators/calls/literals/functions/module-access,
statement dispatcher/declarations/control-flow/loops/blocks и emitter components.
`module-access` появился по смыслу property/element access, отдельный dispatcher —
из-за объёма; размер файла не являлся единственным критерием. Function helpers
объединили пять per-call-env setup и четыре parameter-extraction варианта;
`createMethodCall` — шесть сочетаний optional receiver/call и computed access.
Barrel re-exports сохранили import paths.

Небольшой `resolveHoistingTarget` тогда не выделили: 2–3 строки выбирали
контекстные массивы; отдельная abstraction требовала бы передавать оба. Super
helpers также отклонили: около 20 строк в одном контексте потребовали бы большой
visitor context. Env setup pass сознательно не сделали: helper уже собирал
capture-dependent setup, отрыв в отдельный pass добавлял координацию. Это причины
решений того этапа, не универсальные пороги «10 строк/2 вызова» для новых helpers.

Hoist/emitter migration была атомарной: старый `emitStatementHoisted` удалял
hoistOnly declarations и давал пустые строки, если новый pass подключался без
упрощения emitter. Перенос удалил emitter `collectVariableNames` и
`emit-hoisting.ts`, включая circular emit-statements ↔ emit-hoisting dependency.
Наличие stale build artifact после удаления source породило ложное dead-code
ревью. `build/` и комментарий не доказывают существование source implementation.

Старый try-finally pass потребовал bottom-up nested desugar: внутренний rewrite
создавал return, который должен увидеть внешний. Diff `nested.test.js` обнаружил
ошибку порядка. Сам throw-sentinel алгоритм позже **superseded**
[structured completion](control-flow.md): правильная вложенность старого pass
не спасала return от пользовательского catch.

## Почему контекст и pending контракт менялись

Gen-1 не ввёл PassContext: тогда два pass использовали IR и локальный state.
Gen-3 добавил diagnostics/sourceFile/dependsOn при конкретной потребности;
control-flow работа добавила shared BindingManager. Старое «YAGNI, контекст не
нужен» не является текущим API. Dependencies проверяются, а не auto-sort.

В gen-3 выбрали `withPendingScope` вместо возврата `ExpressionResult` из каждого
visitor. Историческая оценка: 2 файла/4 flush sites против 12+ файлов/76 callers
и переписывания 22 `maybeExtract` sites. Это удешевило сбор queue на statement
boundaries и сохранило API. Отчёт ошибочно выводил отсюда корректность порядка
внутри expressions. Даже гарантированный flush перед statement не сохраняет
lazy branches, snapshots ранних reads, loop frequency или parameter phase.
Отчёт уже признавал condition temp, вычисляемый один раз до loop. Современные
R01–R03/R29 и [E-01](../research/compiler-semantics/expression-evaluation.md)
показывают конкретные miscompilations. Контракт collection реализован;
семантический expression design остаётся draft/on hold.

Отказ объединять bare visitors сохранён: plain signature/current scope отличаются
от env/desc функции, merge добавлял nested branching. ModeConfig заменил 58
старых mode checks флагами по аспекту. `moduleWrapper` переименовали в
`moduleExports`; отдельный hoistFunctions flag не понадобился (`IR.noHoist`).
Reserved `usePolyfills` не делает type-driven dispatch выключаемым независимо.

## Diagnostics и проверка заявлений

Gen-2 заменил console.warn на BT diagnostics, добавил error boundaries и
rejections computed keys/destructured parameters; bare parameter path пришлось
проверить отдельно от function-helpers. Выбрали `ts.Diagnostic`, а не собственные
`{level,message,pos}`/`warnings[]`: CLI reporter и TS formatter работают с одним
форматом. Rejection прекращает corruption, но не реализует requested feature.
Старое «нечего тестировать, ведь фича запрещена» отвергнуто: negative diagnostic,
range/category/no-output и отсутствие false positives — проверяемые контракты.

Reviews расходились в пяти существенных местах: существование precedence
imports, размер class visitor, удалённый emit-hoisting, несуществующий дубль
collectVariableNames и nested-function return. Совпадение двух reviews не заменяло
исходник. Старый подсчёт «20% false rate» относился к их ~25 пунктам, не к общей
точности инструмента. Современный аудит различает fixed, confirmed, superseded
и unverified и не переносит исторические оценки трудоёмкости на новый head.

## Датированные расходы и результаты

| Этап                    | Recorded result и граница вывода                                                                                                                                                            |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Gen-1 split, 2026-03-12 | 113 botest, 122/122 byte-identical `.js`; около 4914 → 4506 строк в разделяемом срезе. Классы были недооценены в первоначальном плане, declarations остался крупным                         |
| Multi-pass, 2026-03-13  | 113 tests, 138/138 identical; ~1142 новых pass/walker строк против ~781 удалённых из прежних файлов, net +361. Explicit traversal платит за модель IR; emitter ~1214 → 726 строк            |
| ModeConfig, 2026-03-13  | 113 tests, 138/138 identical; +91 flags module / −301 existing lines. Это maintainability measurement, не C benchmark                                                                       |
| Gen-2, 2026-03-15       | 114 tests; 121 identical, один expected hoist diff `semantic/functions.test.js`, новый `for-of-captured.test.js`; 14-package build                                                          |
| Gen-3, 2026-03-18       | Waves 0–2 recorded implemented (`ef16ad3`, `a562c7a`, `7f293dc`); 114 tests, 119 identical/3 cosmetic+hoist differences/1 new. Assignment/class split и WalkContext не выполнены тем этапом |

Эти counts имеют разные file sets и checkpoints; их нельзя складывать или
выдавать за текущий gate. Byte identity полезна для no-behavior-change refactor,
но сохраняет и существующие ошибки. Новая revision требует своих проверок.

## Не принятые направления

Unified walker с parent/scope, verifier, type annotations, DCE/constant folding,
source maps, custom ModeConfig и splitting class visitor остаются отдельными
unscheduled возможностями. Ни gen-3 plan, ни старое обещание «после этого фичи
станут простыми» не доказывают их готовность. Reference/evaluation/lifetime
семантика требует своего исследования. [Proposals](proposals.md) сохраняют
существенные варианты и причины отсрочки, [scope](../research/compiler-semantics/scope.md)
— конкретные незавершённые вопросы. Script/module ABI развитие заморожено.
