# Линковка и invalidation

[processPackagesLinking](../../packages/bt-cli/src/core/linking/index.ts) имеет
три стадии: system dependencies корневого проекта → entries пользователя →
общий `api_ext.xml`. Одиночный проект — список из `{name:"."}`, а не отдельный
pipeline. [parsers.ts](../../packages/bt-cli/src/core/linking/parsers.ts)
применяет explicit source/target, defaults `build`, `wt/<ws:name>` или
`components/<ws:name>`. Component ws:root отвергается в default-target ветке;
explicit target обходит её. Поэтому старое «ws:root всегда обязательный для
standalone» неверно, а «component target невозможно переопределить» слишком сильно.

[Типовые linkers](../../packages/bt-cli/src/core/linking/linkers) разделяют
initialization: standalone init.xml/API entry; component spxml/platform metadata;
system копирует готовое. Library обрабатывается как node_modules dependency,
не top-level linked module. System dependency mode не эквивалентен system,
явно указанному в пользовательском списке. Не нужно унифицировать эти роли
посредством новых compiler transformations: runtime уже собран и требует
проверяемый layout, а не повторной обработки бизнес-модуля.

Standalone/component переиспользуют **целевые** init/spxml, если они существуют.
Это сохраняет пользовательские шаблоны, но также старые generated файлы при
изменении main. Api entries идут system-first, затем по конфигурации; это не
топологическая сортировка приложения. Component entries не попадают в api_ext.

## Что именно кэшируется

[LinkingCache](../../packages/bt-cli/src/core/linking/cache.ts) v2 хранит состояние
в `.btc/linking-cache.json`, ключ — `ws:name`. Ближайший pnpm/npm lockfile ищется
вверх до workspace marker/FS root, fallback — package.json. Это исправляет
прежнюю узкую модель «lockfile только рядом с пакетом».

[node-modules.ts](../../packages/bt-cli/src/core/linking/utils/node-modules.ts)
обнаруживает только точные `ws:package:"library"`, следует symlinks и копирует
nested libraries. При изменении lock hash удаляет весь target node_modules
и пересоздаёт. При прежнем hash пересчитывает content hash локальных libraries,
удаляя/копируя изменившиеся. Путь + содержимое файлов сортируются и хэшируются,
кроме `.git`/`node_modules`. Это делает случай «workspace symlink вне node_modules
изменил свой файл» **реализованным**, а не незакрытым общим file-dependency багом.

Symlink сам по себе не означает local: realpath должен быть вне `node_modules`.
`file:` dependency в pnpm store не обязана соответствовать этому условию;
её произвольное изменение не покрыто content hash. Старое утверждение «все file:
dependencies инвалидируются» снято; package-manager install/lock semantics
нельзя заменить названием протокола.

## Проверенные границы orphan output

Сверка исходника 2026-11-11, без native HCM. Ограниченная локальная проверка
с временным проектом, настоящим symlink вне node_modules и текущими TS модулями
под Node подтвердила три случая: изменение local library перекопируется; новый
target при cache hit не получает library; удаление последней library оставляет
старую копию. Fixture удалена после проверки; это локальная файловая логика,
не platform acceptance. Остальные строки таблицы — source-level findings:

| Старый/возможный finding                       | Текущий статус и точное условие                                                                                                                         |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Любой local change пропускается                | Слишком широко: local realpath вне node_modules хэшируется и перекопируется                                                                             |
| Удалённая library остаётся всегда              | Не всегда: nonempty discovery при unchanged hash удаляет отсутствующие cached names; full copy очищает target node_modules                              |
| Удалена последняя library / node_modules       | **Подтверждено:** early return при libraries.length=0 расположен до cleanup; старая копия остаётся                                                      |
| Удалён dist при сохранённом cache              | **Подтверждено:** cache hit не проверяет target existence; неизменённые local/registry libraries могут отсутствовать                                    |
| Изменён target, ws:name/lock прежние           | **Подтверждено:** target не входит в cache key; новая папка может не получить dependencies                                                              |
| Изменена только nested library                 | **Подтверждено для unchanged outer hash/lock:** node_modules исключён из hash, nested copy выполняется лишь при копировании outer library               |
| Переименован/удалён файл package build         | **Подтверждено:** recursive copy сливает деревья, не удаляет orphan files                                                                               |
| Удалена app entry, переименован ws:name/target | **Подтверждено:** линкер обходит только текущие packages; старый standalone/component каталог остаётся до `--clean`, даже если другие entries сохранены |
| Исчезли все API entries / executables          | **Подтверждено:** запись api_ext/filemap условна; старые целевые metadata не удаляются без clean                                                        |

Не нужно оставлять общий пункт «проверить весь старый кэш»: условия локализованы.
`link --clean` удаляет `.btc` и `dist`, затем собирает полный набор. Он не очищает
`build`, поэтому stale compiler output убирается отдельно. `--no-cache` включает
полное dependency copy при nonempty discovery, но не является общим clean.

## Executable keys: отдельный дефект

[compile-mode.ts](../../packages/bt-cli/src/core/building/compile-mode.ts)
сохраняет в `.executables.json` `sourceFile.fileName` (обычно абсолютный путь),
но `computeFileKey` строит package-relative path. [executables.ts](../../packages/bt-cli/src/core/linking/executables.ts)
использует сохранённый path без такого же relativize и для URL берёт substring
от первого `/`, меняя `.ts` на `.js`. Поэтому ключи/URL могут не совпадать с
runtime lookup и включать source/host path. Это **подтверждённое расхождение
алгоритмов**, не гарантия корректного filemap ABI. Incremental registry имеет
дополнительную потерю affected subset — см. [watch](build-and-watch.md).
Исправление нормализации и тесты должны охватить Windows/POSIX, TSX, nested roots;
документационная миграция не меняет production и не выдаёт этот долг за fixed.

Public contract, примеры и flags — [линковка](../../docs/guides/linking.md),
[btconfig](../../docs/reference/btconfig.md), [типы](../../docs/reference/package-types.md).
