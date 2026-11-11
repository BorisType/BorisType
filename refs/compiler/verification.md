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
[план, реализация и follow-up](../research/compiler-control-flow/labeled-statements.md).

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
