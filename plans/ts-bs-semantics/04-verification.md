# Проверка семантики, output и стоимости

## Три независимых результата

1. **Source oracle:** TypeScript после стирания типов выполняется как JS в Node.
2. **Compiler/output:** диагностики, IR и конкретный generated BorisScript.
3. **Target execution:** этот output выполняется на supplied JS и отдельно на C.

Не запускать compiled BS в Node как замену target execution. Type erasure для
oracle не должен заменять отсутствующий lowering enum/namespace стандартным TS
emit в target. Oracle и target имеют разные pipelines, сравнение обнаруживает разницу.

Для обычных JS cases сравнивать result, type tag, trace и state. Для throws —
completion/момент/trace; exact thrown identity/stack требовать лишь при выбранном
контракте. Native runtime нормализует arbitrary throws, что надо отдельно учитывать.

## Матрица

Каждое правило проверять на применимых комбинациях:

- Modes: bare / script / module. Неприменимое — отдельная diagnostic expectation,
  не отсутствие строки в отчёте.
- Entrypoints: `compile`, `compileSourceFile` с реальным TypeChecker, btc build.
  Последний проверяет mode selection, imports и artifacts, которые строковый API не видит.
- Contexts: initializer, assignment, return/throw, if, while, do-while, for init/test/update,
  switch discriminant/case, args/callee, array element, object property, default initializer.
- Effects: read/mutation/call/throw, receiver/key, early/late argument; один и два effects;
  skipped branch; repeated evaluation; same-object aliasing.
- Values: false/0/empty string/null/undefined, object/array/function descriptor,
  explicit missing argument, negative/fractional indices; NaN/Infinity/negative zero
  как отдельные capability cases, не автоматически переносимые значения.
- Bindings: local, captured, parameter, shadowed, catch, per-iteration, imported/exported.
- Integration: optional chains + lazy ops; expressions + finalizers; params + captures;
  modules + closures; destructuring + defaults/rest; classes + inheritance + arrows.

Не строить полный Cartesian product всех осей. Сначала rule-focused boundaries,
потом pairwise/targeted combinations; generated bounded cases — для опасного core.
Всегда positive controls и unchanged fast-path fixtures.

Для общего expression/reference core добавить небольшой grammar-based generator
с фиксируемым seed, ограничением глубины/шагов и effects ledger. При mismatch
сокращать source до минимального case, сохранять seed/source/output и добавлять
его в permanent regression. Не подменять это огромным количеством однотипных
constant cases. Проверить чувствительность тестов намеренной локальной мутацией
преобразования (в отдельном контролируемом эксперименте): соответствующий case
должен падать, а не просто компилироваться через другой fast path.

## Permanent test layers

| Слой                | Место                                      | Назначение                                                          |
| ------------------- | ------------------------------------------ | ------------------------------------------------------------------- |
| Analyzer/IR/unit    | `packages/bt-ir/test/*.test.mjs`           | Binding/reference models, pass order, immutability, source ranges   |
| Output invariant    | bt-ir tests + AST helper                   | Нет запрещённых syntax/placeholders; корректные targets, names, ABI |
| E2E                 | `tests/src/<suite>` + `_suite.json`        | Реальный runtime setup и проверка user сценария                     |
| Strict differential | Расширение `packages/bt-ir/test/semantic/` | Ненулевые counts, exact comparison, failure exit, artifacts         |
| Native capability   | Отдельные minimal probes                   | Отделение platform defect от compiler/helper defect                 |
| C acceptance        | Generated bounded packs                    | Независимый результат для изменённого output/runtime shape          |

Общий runner для новых families **ещё не реализован**. Существующий
`test:semantic` — только abrupt/update. Не документировать несуществующие команды
как готовые gates. Начать с адаптации малого runner и named case catalog.

Research failures держать в явном отдельном manifest, не в success-only E2E.
xfail должен идентифицировать конкретный case/mode/причину; неожиданный pass
потребует пересмотра статуса. После fix убрать xfail и включить regression gate.

## Output review

AST-based assertions предпочтительнее глобальных regex; literal text/comment
с `finally`, `__invalid__` или comma не является surviving executable syntax.
Проверять, в частности:

- effects не выходят из selected branch и loop evaluation point;
- receiver/key/callee evaluated нужное число раз, аргументы в source order;
- нет `LabeledStatement`, native finally, unnamed catch, comma в for update;
- нет undeclared generated refs, collision names и duplicate native var;
- assignment/update result сохраняется отдельно от операции записи;
- дескриптор/exports используют правильный captured/env slot;
- lowering unsupported node не заканчивается success с placeholder;
- pure/simple code не получает новых helpers, env/descriptor или escape frames без причины.

При изменении parser-safety pass убедиться, что тест реально создаёт затрагиваемый
IR node. Script `bt.getProperty(literal, ...)` не доказывает literal-extract,
работающий с `MemberExpression`.

## Стоимость generated code

В каждом result report: bytes/IR nodes, число временных scalars, helper calls,
args-array constructions, env/descriptor allocations, property reads/writes,
copy operations и рост кода при nesting. Сначала structural counts, затем timing.

Не назначать один произвольный процент на все feature families. Spec определяет
budget для конкретной задачи: например, receiver/key один раз, zero new env для
plain expression, линейный рост при nesting, отсутствие cumulative object copies.
Baseline и budgets записать до optimization. Correctness не обменивается на скорость.

C benchmark: несколько размеров N, разогрев если применим, повторные серии,
version/config/setup, median и разброс; отдельно compile/load/init/execute.
Для allocations без профайлера писать structural estimate, не выдуманные измерения.
JS wall time не выдавать за C latency. Если C timings не получены — `not measured`.

## Безопасные C probes

- Сначала raw minimal capability case, затем compiled equivalent и positive control.
- Маленькие тематические packs вместо одного огромного файла с неизвестной причиной hangs.
- Case IDs, expected values, compiler SHA, mode, output hash, required helpers,
  итоговый `MESSAGE`, версия C если известна.
- Fuel limit на loop/carrier entries и ограниченная длина trace; отдельно external
  timeout. JS timer может не остановить синхронно зависший interpreter: использовать
  process isolation/watchdog, а не только Promise timeout.
- Instrumented pack отдельно от production output. Проверить, что fuel guards
  не скрыли неверный continue/exception path; хранить оба output hashes.
- Для script/module подключить совместимый runtime ABI и настоящую codelibrary.
  Bare smoke не заменяет такой setup.
- Runtime source/host paths/credentials не публиковать. В git можно хранить
  разрешённые собственные sources/specs; generated artifacts — в ignored build.

## Текущие команды

Из корня проекта, после установки зависимостей и подключения approved runtime:

```bash
pnpm exec turbo run build
pnpm --filter @boristype/bt-ir --filter @boristype/eslint-plugin test
node packages/botest/build/index.js tests/build
node packages/botest/build/index.js tests/build --node-check
pnpm test:semantic
pnpm lint
pnpm format:check
git diff --check
```

Смотреть counts и failures, не только exit code. Baseline: 55 bt-ir tests,
148 BS E2E, 5760 abrupt comparisons; новые tests должны менять counts/manifest
объяснимо. Node validation advisory и может вернуть exit 0 при failed assertions.
Не использовать `pnpm test -- --node-check`: разделитель может стать filter и
дать false-green zero tests. Для фильтрации передавать реальные suite IDs напрямую
в botest CLI. Проверки регистрации/exit codes входят в `F-03`.

До runtime provisioning в CI зелёная сборка не считается execution gate (#29).
После любого semantic change повторить relevant execution gates на актуальном
HEAD/output. Отчёт предыдущего commit не покрывает новый output.
