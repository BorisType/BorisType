# Проверка независимого C runtime

Из корня проекта после сборки и подключения JS runtime:

```bash
pnpm test:semantic
```

Команда строго сравнивает Node и JS BorisScript во всех трёх compile modes и
генерирует `packages/bt-ir/build/semantic/BtAbruptProbe.js`.

Запустить этот файл целиком на C-платформе. Он сам содержит expected values,
не требует botest или bt runtime и заканчивается `MESSAGE = BtAbruptProbe()`.
Ожидаемый `MESSAGE`: `OK: 60/60`. При расхождении он вернёт имена кейсов и их
фактические trace/outcome. Приложить также версию C-платформы, если доступна.

Рядом лежат `BtAbruptProbe.cases.txt` и `BtAbruptProbe.expected.txt` для
покейсного сравнения. Generated artifacts ignored; они воспроизводятся командой
выше. Сам JS runtime не добавляется в git.

## Обязательный pre-merge gate

Для PR, меняющих compiler/lowering/passes/emitter/runtime, одних зелёных CI checks
недостаточно: до merge обязательно выполнить E2E и strict semantic gate на
актуальном head. После каждого изменения compiler повторить проверку; результаты
другого commit не считаются проверкой нового output.

Сборка CI уже компилирует `tests/`, но не выполняет E2E/differential: для этого
нужен внешний runtime. Без `main.js` ошибка ENOENT означает незапущенный gate,
а не допустимый skip. Автоматизация и безопасное provisioning отслеживаются в
[#29](https://github.com/BorisType/BorisType/issues/29).

Из корня проекта:

```bash
pnpm install --frozen-lockfile
pnpm exec turbo run build
```

Подключить одобренный локальный JS runtime как
`packages/botest/build/borisscript/main.js` (symlink или локальная копия; не commit).
В этой рабочей среде symlink ссылается на `/home/agent/workspace/main.js`; для
другой среды нужно явно выбрать свой файл, не скачивать произвольный runtime.
Затем:

```bash
git rev-parse HEAD
sha256sum packages/botest/build/borisscript/main.js
pnpm --filter @boristype/bt-ir --filter @boristype/eslint-plugin test
pnpm test
pnpm test:semantic
```

В PR зафиксировать проверенный commit SHA, версию runtime (если известна) и его
SHA-256, команды, counts и exit status. `test:semantic` должен пройти во всех
трёх modes; advisory Node-check из botest не заменяет этот строгий gate.
Для #27 ожидаются 148 E2E и 1920 × 3 = 5760 differential comparisons.
Проверять ненулевую выборку: botest пока возвращает success для неизвестных
фильтров с 0 tests ([#30](https://github.com/BorisType/BorisType/issues/30)).
Для отдельной advisory Node проверки labels/finalizers корректные фильтры:
`node packages/botest/build/index.js tests/build labels try-catch-finally --node-check`;
ожидаются 38 BS tests и 38 Node validations.

Если target execution shape меняется, regenerated C probes нужно снова
выполнить на независимой C-платформе и записать MESSAGE/версию. Если output
байт-в-байт совпадает с ранее проверенными артефактами, указать сравнение хешей
и исходную C проверку; это не новый C запуск. Не публиковать supplied runtime
в репозитории, artifacts или logs без согласованных прав на распространение.

Pack включает все targeted regressions и регулярную выборку completion matrix:
native catch не ловит return carrier, finalizer override, nested finalizers,
chained labels, loop update/do-condition, switch fallthrough, caught override,
локальный catch в finalizer, expanded for-of, catch shadowing и рекурсию.

## Подтверждённые C результаты (2026-10-07)

Пользователь вручную запустил оба актуальных файла на независимой C-платформе:

- `Check27Fixed.js`: `MESSAGE: 0FU1FU2FU|E`.
- Полный `BtAbruptProbe.js`: `MESSAGE: OK: 60/60`.

Обход и все 60 selected bare-mode smoke cases прошли. Версия платформы не
сообщена. Полная 1920-case матрица и script/module modes проверены на JS runtime,
не на C; C performance benchmark не выполнялся. Ранее `AB` и `012` проверяли
только базовый carrier. Raw/legacy C diagnostic result пока не получен:
успешный обход не доказывает внутреннюю причину исходного comma-update дефекта.

## Диагностика зависания check27

Пользователь сообщил, что C runtime не возвращает ответ от `check27` (`for-update`).
Пользователь связывает зависание с пропуском `i++` в compound update:
`for (...; ...; ledger.value = ledger.value + "U", i++)`. В Node и supplied JS
runtime он завершается с `0FU1FU2FU|E`.

IR compiler теперь устраняет такие заголовки до completion rewrite. Прежде чем
повторять полный pack, проверить небольшой актуальный output:

```bash
node packages/bt-ir/test/semantic/check27-diagnostic.mjs
```

Запустить `packages/bt-ir/build/semantic/Check27Fixed.js` целиком.
Ожидаемый `MESSAGE`: `0FU1FU2FU|E`. Это реальный output текущего compiler,
ограниченный 64 входами в loops/carriers, без comma-update заголовка. При
неисправном выполнении результат содержит `LIMIT`, а не бесконечную trace.
Пользователь подтвердил этот expected result на C 2026-10-07 (см. выше).

Для дополнительной локализации исходного дефекта (не требуется для приёмки
уже подтверждённого обхода) создать отдельный диагностический файл:

```bash
node packages/bt-ir/test/semantic/check27-diagnostic.mjs
```

Запустить `packages/bt-ir/build/semantic/Check27Diagnostic.js` целиком и прислать
`MESSAGE`. В каждый цикл добавлен лимит шагов: неисправный update или неверный
continue-target должен дать `LIMIT:i=...,trace=...,type=...`, а не бесконечно
наращивать trace. Legacy comma case сохранён как намеренно unsafe fixture;
`generated-fixed` компилируется заново. Production workaround — first-entry
while, не instrumentation/fuel guard. Основной smoke pack также regenerated.

Ожидается:

```text
raw-normal=0U1U2U
raw-continue=0U1U2U
raw-simple=012
generated-comma=0FU1FU2FU|E
generated-simple=0F1F2F|E
generated-helper=0FU1FU2FU|E
generated-fixed=0FU1FU2FU|E
```

Если ломается `raw-normal`, проблема воспроизводится без carrier и try/catch.
Если только `raw-continue`, это сочетание native continue и compound update.
Если raw cases проходят, а generated нет, исследуем взаимодействие carrier с
C execution contexts. Simple/helper variants проверяют обход comma update;
fixed проверяет выбранный IR обход. Fixed и актуальный полный pack (`OK: 60/60`)
уже подтверждены на C; raw/legacy/simple/helper C controls остаются непроверенными.
Старый 38-case файл не актуален и не должен использоваться повторно.
