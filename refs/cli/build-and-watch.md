# Build и watch: границы координации

CLI handlers в [src/index.ts](../../packages/bt-cli/src/index.ts) регистрируют
Commander options; [cli/commands](../../packages/bt-cli/src/cli/commands) переводят
их в core. Core не полностью независим от процесса: `getTSConfig`, linking
validation и one-shot `processLinking` всё ещё вызывают `process.exit`.
Программный consumer должен учитывать этот оставшийся долг, а не полагаться
на старое обещание «только CLI завершает процесс».

[compiler.ts](../../packages/bt-cli/src/core/building/compiler.ts) создаёт TS
Program для diagnostics и optional `.d.ts`, но BorisScript эмитит через bt-ir
`compileSourceFile`. Поэтому стандартный tsc noEmitOnError не запрещает весь
BS emit: отдельные файлы и non-TS copy могут появиться при failed build.
CLI выставляет exitCode=1; наличие файлов не заменяет проверку результата.
Пути output берутся из TS options, не всегда `build/`; `init` лишь предлагает
`rootDir=src`, `outDir=build`. CLI `--outDir` зарегистрирован, но compiler/copy
сейчас читают TS options, не `BtcCompileOptions.outDir`: документировать его
как рабочий override нельзя.

[compile-mode.ts](../../packages/bt-cli/src/core/building/compile-mode.ts)
применяет first match в первых 30 строках → `.test.ts`/executable imports → CLI
→ `module`. Executable detector проверяет локальные имена named imports из
строк с prefix `@boristype/types`; alias меняет распознавание. Это эвристика,
не semantic TypeChecker. Прямой bt-ir API её не применяет. Старые флаги
`--no-use-polyfill`/`--no-use-remodule` не существуют.
[Compiler contract](../compiler/README.md) отделяет режим от memory acceptance.

[BuildPipeline](../../packages/bt-cli/src/core/building/index.ts) — фасад с
`run(contextOrOptions)` и `watch(contextOrOptions, callbacks)`, не прежнее
`run(path, options)`. Watch использует TypeScript builder affected files и
отдельный Chokidar non-TS watcher. Первая сборка эмитит весь пользовательский
набор, последующие — affected files. Это не обещание «только изменённый файл»
и не измеренное ускорение 10x. [files.ts](../../packages/bt-cli/src/core/building/files.ts)
копирует non-TS при старте, затем обрабатывает add/change/unlink; исходный
one-shot copy декодирует UTF-8, а watch copyFileSync переносит bytes. Binary
assets в one-shot copy не имеют byte-preserving гарантии.

## Почему координатор ждёт все пакеты

[devCommand](../../packages/bt-cli/src/cli/commands/dev.ts) определяет watchers
из linking packages: нужны `ws:package`, `ws:name`, `tsconfig.json`, исключены
`library`/`lib` и статические директории. Конфигурации пакетов различаются,
поэтому создаётся отдельный watcher на каждый пакет. `DevCoordinator` хранит
pending set по `ws:name`, ждёт успешные initial callbacks и один раз выполняет
full link всех entries. Это предотвращает линковку ещё не созданного build
другого пакета. Затем standalone/component проходят incremental link, а queue
планирует push. Не реализованы старые UI hotkeys `r/q`, отдельный DevPipeline,
150ms build batching и automatic reload всей metadata/configuration.

## Подтверждённые ограничения текущего исходника

Это конкретные source findings, не новые HCM observations:

| Сценарий                                    | Причина / последствие                                                                                     | Обход сейчас                         |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| Выбранный пакет без tsconfig                | В pending set добавляется до старта watcher; watcher пропускается, barrier не закрывается                 | Исправить конфигурацию до запуска    |
| Одинаковые ws:name                          | Set и cache используют одно имя                                                                           | Разные имена                         |
| Incremental пакет имеет явные source/target | Координатор передаёт только `{name}`, теряет overrides                                                    | Full link перед поставкой            |
| Multi-package incremental link              | Новый context содержит только изменённый пакет плюс system; api_ext.xml перезаписывается неполным набором | Full link всех entries               |
| Удаление non-TS                             | Watch callback передаёт исходный path после удаления output; линкер его пропускает как внешний sourceDir  | Очистить stale output и link --clean |
| Удаление TS                                 | Emit не выполняет общего удаления соответствующего старого JS                                             | Очистить stale build вручную         |
| Executable metadata после rebuild           | `currentExecutables` заменяется данными affected subset, не полным registry                               | Полная сборка, затем сверка mapping  |

Произвольные изменения config/package metadata требуют перезапуска dev;
TypeScript может увидеть свой config, но non-TS roots и список пакетов уже
захвачены при старте. Очередь push сериализует только push, не весь async link:
координатор не содержит mutex/ordered queue. Возможная гонка нескольких callbacks
остаётся **гипотезой риска** без bounded concurrency reproduction; она не
объявляется новым доказанным дефектом.

Прежний dev design был предложением: push stub, keyboard UI и config reload
не описывали текущую реализацию. Полезные основания per-package watcher и barrier
сохранены здесь; команды и действующие ограничения — в [гайде](../../docs/guides/dev-mode.md).
