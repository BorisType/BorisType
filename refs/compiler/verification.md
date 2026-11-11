# Проверки преобразований TS → BS

## Локальные проверки и target execution

Из корня checkout после установки закреплённого toolchain:

```sh
pnpm install --frozen-lockfile
pnpm exec turbo run build
pnpm --filter @boristype/bt-ir --filter @boristype/eslint-plugin test
```

IR/unit/output cases находятся в `packages/bt-ir/test/`. Они проверяют diagnostics,
метаданные, порядок passes и target shape, но не заменяют выполнение output.
Для botest добавь `tests/src/<suite>/<case>.test.ts`, зарегистрируй compiled
`<case>.test.js` в `_suite.json` и закончи тест `botest.assertOk()`.
Это sentinel завершения; учитывай catch/finally тестируемого исходника.
Runner пропускает незарегистрированный файл. Assertion message нужен для диагностики;
уникальность текста не является требованием протокола assertion.

Для JS BorisScript execution нужен отдельно предоставленный одобренный runtime
в `packages/botest/build/borisscript/main.js`. Не commit и не скачивай случайный
runtime ради зелёного gate. После provisioning:

```sh
node packages/botest/build/index.js tests/build <suite>/<case>.test.js
pnpm test
pnpm test:semantic
```

`pnpm test` запускает уже собранные botest cases; он не выполняет build автоматически.
У неизвестного фильтра пока возможен success с нулём tests: проверяй ненулевой состав
и фактические результаты, [issue #30](https://github.com/BorisType/BorisType/issues/30).
Отсутствующий runtime означает невыполненный gate, а не успешный skip.
Advisory Node checks не заменяют strict Node ↔ JS BorisScript сравнение.

Изменения compiler/lowering/passes/emitter/runtime требуют относящихся к ним execution
и semantic gates на проверяемой ревизии, включая регрессии сохранённых режимов.
Проверка документационного переноса не является новым запуском этих gates.

## C-runtime и evidence

`pnpm test:semantic` генерирует `packages/bt-ir/build/semantic/BtAbruptProbe.js`.
Подготовка файла не является его выполнением на C. Для изменённой execution shape
нужна отдельная ограниченная проверка на целевой платформе с указанием режима,
версии/ОС/runtime, исходника/output identity и actual/expected.
Если output byte-identical старому, фиксируются сравнение hashes и старый запуск;
это не новый native run. Не запускай известный unsafe diagnostic как обычный smoke.

В ручном C-запуске 2026-10-07 пользователь подтвердил Check27Fixed
`0FU1FU2FU|E` и полный selected bare pack `OK: 60/60`; версия не сообщена.
Это не полная JS matrix на C и не C memory/performance acceptance.
[Исходные инструкции и результат](../research/compiler-control-flow/probes/README.md),
[план, реализация и follow-up](control-flow.md).

Для исторического expression checkpoint `pnpm test:expressions:baseline` сохраняет
ожидаемые расхождения; strict `pnpm test:expressions` требует equivalence.
PASS baseline с XFAIL не означает исправления фичи.

Для новой expression regression добавь case в
[expression-cases.mjs](../../packages/bt-ir/test/semantic/expression-cases.mjs).
Для bare укажи `modes: ["bare"]` (либо более широкий применимый список): без
`modes` catalog выбирает script/module. Case задаёт `id`, `finding`, ожидаемую
строку `expected` и TS `body`; helper оборачивает body в `runProbe(): string`.
После сборки с предоставленным JS runtime запусти strict comparison:

```sh
node packages/bt-ir/test/semantic/run-expressions.mjs --case <new-id> --mode bare
```

Здесь нет `--baseline`: сравниваются expected, Node и JS BorisScript. Output,
raw/final IR и результаты сохраняются в ignored `packages/bt-ir/build/semantic/expressions`.
Этот runner отклоняет пустую/неизвестную выборку; это не исправляет поведение
отдельного botest runner. Для C требуется отдельная bounded probe, как описано выше.
[Manifest и пределы воспроизведения](../research/compiler-semantics/results/2026-11-05-research-checkpoint.md).

В отчёте укажи compiler revision, runtime identity, команды, modes, counts и exit
status; неизвестное оставь неизвестным. Действие, не выполненное на C, не записывается
как C acceptance. Provisioning CI остаётся отдельной задачей
[issue #29](https://github.com/BorisType/BorisType/issues/29).

## Что сохранять при семантическом исследовании

Source oracle, compiler output и target — три результата. TS source стирает типы
и исполняется в Node; target получается собственным lowering и исполняется в
supplied JS runtime, затем отдельно C. Стандартный TS emit enum/namespace в oracle
не добавляет отсутствующий target lowering. Проверяй result/type/trace/state;
throws — completion/момент/trace с явной границей arbitrary thrown identity.

Матрица строится rule-focused, затем targeted/pairwise interactions: modes,
обе API entrypoints и btc project build; initializer/return/throw/if/loops/
switch/args/callee/literal/default contexts; effectful receiver/key/argument,
skipped/repeated branches, exceptions; local/captured/renamed/catch/per-iteration/
imported/exported bindings. False/0/empty/null/undefined и omitted/explicit
undefined различаются. Host/XML и ordinary objects не сливаются в один контракт.
Полный Cartesian product всех language features не является требованием.

Начинай с minimal counterexample и positive control. Baseline failure держится
в отдельном exact research manifest, после fix становится strict regression.
Новый xfail не может скрыть compile/load/runtime error, timeout, changed mismatch
или XPASS. Bounded grammar generator с фиксированным seed и reducer полезен для
общего expression/reference core; сейчас общего runner всех families нет.
Mutation sensitivity check должен задевать реальный IR path: script helper
getProperty(literal) не проверяет pass, работающий лишь с MemberExpression.

AST-based output assertions проверяют отсутствие executable survivors, а не
слова внутри strings/comments. Дополнительно: names/targets/loc, single native
var, assignment/update value, early snapshots, lazy plans, loop frequency,
parameter phase, captured export slots и bootstrap. Pure/simple path не должен
получать helper/IIFE/env/args arrays без семантической необходимости. Source
rewrite не должен обходить дефект тестируемого lowering.

Cost report: bytes/IR nodes/generated scalars, helper/args-array/env/descriptor/
array/object call sites, reads/writes/copies и рост при nesting. Static sites —
не динамические allocations и не measured latency. Budget задаётся для правила
(например, receiver/key once и linear output growth), а не единым процентом для
всех features. C benchmark требует N sizes, setup/version, warmup/repeats,
median/spread, отдельных compile/load/init/execute; JS timing не заменяет C.

## Bounded C протокол и идентичность результата

Сначала raw capability case, compiled equivalent и control, затем маленький
тематический pack. Loop/carrier fuel ограничивает шаги и trace; process watchdog
ограничивает зависший JS interpreter. Promise timeout не прерывает synchronous
execution. Client timeout не отменяет серверный код. Известный unsafe legacy
fixture остаётся отдельным diagnostic, не обычным smoke.

Fuel instrumentation и production output имеют разные hashes. Guard не должен
скрывать неверный continue/exception path; production workaround не является fuel.
Для script/module нужны настоящие library/descriptor ABI и lifetime prerequisites;
bare pack этого не аттестует. В эту Markdown миграцию новые native runs не входят.

Минимальная запись evidence:

```text
rule/case IDs; date; compiler commit + worktree diff identity
Node/TS/tool versions; mode; entrypoint; compile options
runtime version (or unknown), SHA-256, adapter/libraries/setup
C platform/config/carrier (or unknown), execution prerequisites
catalog/selection; expected/executed counts; commands/exit status
source/oracle/IR/output hashes; instrumented + production hashes
expected/actual trace/MESSAGE; failures/skips/xfails and precise reasons
output invariants; static counts; timings with method or not measured
cleanup; remaining findings; links to design and evidence
```

Replay source и command должны быть доступны без private runtime; один hash не
обеспечивает воспроизведение. Не включай supplied runtime source, secrets или
host data в git/logs/artifacts. Результат помечай `unit-verified`, `JS-verified`,
`C-smoke-verified` либо accepted subset с конкретными boundaries. При новом output
нужна новая relevant execution, либо документированная byte identity и ссылка
на старый C result (это не новый run).

Если меняется shared IR/ABI, проверь consumers/walkers/emitter/passes, metadata,
bootstrap, compiler/runtime version coupling, upgrade order и rollback. Малый
localized fix не требует формальной spec-plan-results цепочки; не скрывай
существенную потерю semantics под новым expected или большой green suite.
