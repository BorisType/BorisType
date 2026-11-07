# Проверка остальных зависимостей после SDK migration

Дата: 2026-11-05. Ветка: `feat/mcp-server`, draft PR #48.

## Область и метод

Проверены 29 уникальных имён прямых внешних dependencies/devDependencies во всех
workspace manifests, включая опубликованные `@boristype/*`. Peer-only имён сверх
этого списка нет. Дополнительно проверены Node 24 и pnpm. Полный транзитивный
граф не исследовался на переименования каждого пакета.

Installed versions получены из `pnpm list -r --depth 0 --json`. Для каждого имени
сверены npm dist-tags, список stable versions, release timestamps, repository,
deprecation установленного и latest release. Отдельно просмотрены upstream README
основных библиотек и руководства миграции SDK/Inspector/Chokidar. Установленным и
latest releases этих 29 имён npm не выставляет `deprecated`; это само по себе
не гарантирует отсутствие нового поколения под другим именем.

Cutoff для 14-дневной выдержки при проверке: `2026-10-22T18:00:26Z`.
В таблице «доступна» означает опубликованную stable, прошедшую cooldown,
а не проверенную совместимость с BorisType. Для `@types/node` выбрана линия 24,
для собственных pre-release packages отдельно показаны alpha tags.

## Результат

Таблица фиксирует состояние на момент аудита, до последующего обновления двух
зависимостей, описанного в конце этого документа.

| Пакет                             | Установлено   | Доступна по возрасту | Вывод                                                              |
| --------------------------------- | ------------- | -------------------- | ------------------------------------------------------------------ |
| `@modelcontextprotocol/server`    | 2.3.1         | 2.3.1                | Актуален по policy; latest 2.4.0 ещё не прошла выдержку            |
| `@modelcontextprotocol/client`    | 2.3.1         | 2.3.1                | Актуален по policy; используется только тестами                    |
| `@modelcontextprotocol/inspector` | 2.12.0        | 2.12.0               | Правильная линия v2; latest 2.14.0 слишком свежая                  |
| `commander`                       | 15.0.0        | 15.0.0               | Актуален                                                           |
| `zod`                             | 4.6.7         | 4.6.7                | Актуален, используется API v4                                      |
| `typescript`                      | 6.0.3         | 7.0.2                | Новый native compiler; прежний Compiler API несовместим            |
| `@types/node`                     | 24.13.6       | 24.19.2              | Отставший minor в целевой линии Node 24                            |
| `fast-xml-parser`                 | 5.11.1        | 5.11.2               | Отставший patch; latest 5.12.0 пока слишком свежая                 |
| `@changesets/cli`                 | 3.0.3         | 3.0.3                | Используется текущая линия v3                                      |
| `eslint`                          | 10.11.0       | 10.13.0              | Отставший minor; latest 10.14.0 пока слишком свежая                |
| `eslint-config-prettier`          | 10.1.8        | 10.1.8               | Актуален                                                           |
| `lefthook`                        | 2.1.14        | 2.2.2                | Отставший minor                                                    |
| `prettier`                        | 3.9.8         | 3.9.10               | Отставший patch; 4.x доступна только как alpha                     |
| `syncpack`                        | 15.3.3        | 15.3.3               | Актуален                                                           |
| `turbo`                           | 2.11.2        | 2.11.10              | Отставший patch                                                    |
| `typescript-eslint`               | 8.70.1        | 8.72.0               | Отставший minor; обновлять согласованно с parser                   |
| `@typescript-eslint/parser`       | 8.70.1        | 8.72.0               | Отставший minor                                                    |
| `vitepress`                       | 1.6.4         | 1.6.4                | Stable линия актуальна; 2.0.0-alpha.21 не stable                   |
| `vue`                             | 3.5.43        | 3.5.44               | Отставший patch; 3.6 пока RC, 3.5.45 слишком свежая                |
| `chalk`                           | 6.0.0         | 6.0.1                | Отставший patch                                                    |
| `tsx`                             | 4.23.15       | 4.23.15              | Актуален                                                           |
| `archiver`                        | 8.0.0         | 8.0.0                | Актуален                                                           |
| `@types/archiver`                 | 8.0.0         | 8.0.0                | Актуален                                                           |
| `chokidar`                        | 5.0.0         | 6.0.0                | Пропущен новый stable major                                        |
| `@types/eslint`                   | 9.6.1         | 9.6.1                | Новее по этому имени нет; номер типов не обязан совпадать с ESLint |
| `semver`                          | 7.8.5         | 7.8.5                | Актуален по policy; latest 7.8.6 слишком свежая                    |
| `@types/semver`                   | 7.8.0         | 7.8.0                | Актуален                                                           |
| `@boristype/types`                | 1.0.0-alpha.3 | 1.0.0-alpha.3        | Установлен alpha tag; latest указывает на более старую alpha.1     |
| `@boristype/http-handler`         | 1.0.0-alpha.5 | 1.0.0-alpha.5        | Последний опубликованный release, stable без prerelease нет        |

Таким образом, кроме уже исправленного SDK migration, найдены один пропущенный
major Chokidar, новый несовместимый TypeScript major и **десять** отставших
patch/minor dependency names. Другого подтверждённого переезда под новым именем
при этой проверке не найдено. Это не полный update всего workspace.

## TypeScript 7: основание оставить Compiler API baseline 6

`typescript@7.0.2` опубликован 2026-07-08 и является stable/latest. Он прошёл
cooldown; причиной оставаться на 6 является совместимость, а не возраст release.

Проверен именно npm tarball 7.0.2, SHA-512 integrity совпала с registry metadata.
Его `package.json#exports["."]` указывает на `lib/version.cjs`. Этот entry
экспортирует только `version` и `versionMajorMinor`. Локальное выполнение этого
entry с подставленным package metadata подтвердило:

| Проверка             | TS 6.0.3 | TS 7.0.2 root |
| -------------------- | -------- | ------------- |
| `createProgram`      | function | undefined     |
| `createWatchProgram` | function | undefined     |
| `factory`            | object   | undefined     |

Новый API существует в `typescript/unstable/sync`, `unstable/async` и
`unstable/ast/*`; это другой контракт. Нельзя переносить устаревшее утверждение
«API ещё нет» из исторического typescript-go README на текущий npm package.

BorisType импортирует `typescript` напрямую и использует прежние API:
`packages/bt-ir/src/pipeline/index.ts`,
`packages/bt-cli/src/core/building/compiler.ts`, lowering и analysis modules.
Глобальная замена версии на 7 сломает этот контракт. Отдельный native CLI для
Node-only пакетов можно исследовать, но это не мигрирует Compiler API потребителей.

Pin `^6.0.3` сохранён. В syncpack исправлена вводящая в заблуждение метка
`TypeScript aligned to latest` на `TypeScript 6 Compiler API compatibility baseline`.
Это уточнение существующего ограничения, без изменения dependency ranges.

Источники:

- [Registry metadata 7.0.2](https://registry.npmjs.org/typescript/7.0.2).
- [Tarball 7.0.2](https://registry.npmjs.org/typescript/-/typescript-7.0.2.tgz).
- [Текущий TypeScript repository](https://github.com/microsoft/TypeScript).
- [Исторический native-port repository](https://github.com/microsoft/typescript-go#readme),
  закрыт после переноса в основной repository; таблица API в нём устарела.

## Chokidar 6: отдельная миграция watch mode

6.0.0 опубликована 2026-10-19 и прошла cooldown. Upstream описывает полную
переработку watcher и native recursive backend на macOS/Windows. Минимальный
Node >=22.22 подходит текущему toolchain, но нужен поведенческий acceptance
для ignore filters, add/change/unlink, удаления каталогов и закрытия watcher.

В BorisType зависимость используется в
`packages/bt-cli/src/core/building/files.ts`, а не в MCP. Обновление версии
входит в отдельную задачу watch-mode maintenance, с Linux/Windows проверками.

Источник: [Chokidar README: changelog и upgrading](https://github.com/paulmillr/chokidar#changelog).

## Toolchain и последующие действия

- Node **24.22.2** совпадает с последним release линии 24 в
  [официальном release index](https://nodejs.org/dist/index.json).
- pnpm **12.16.1** совпадает с npm latest на момент проверки.
- Проверить десять patch/minor обновлений отдельным workspace maintenance шагом;
  согласовать pinVersion в syncpack с изменёнными ranges и прогнать CI checks.
- Исследовать Chokidar 6 отдельно с файловыми fixtures и закрытием watchers.
- Для TypeScript 7 сначала описать mapping прежнего Compiler API на новый API;
  не включать смену AST/typechecker contracts в MCP maintenance.
- До следующего dependency refresh проверять не только npm latest одного имени,
  но и upstream release lines, deprecation, replacement packages, engines и
  migration docs. Пример ещё одного опасного dist-tag — `@boristype/types`,
  где latest старее используемого alpha.

Другие проверенные материалы:

- [Inspector v1 → v2](https://github.com/modelcontextprotocol/inspector/blob/main/docs/v1-to-v2-migration.md):
  единый root package выбран правильно, старые subpackages не используются.
- [Commander README](https://github.com/tj/commander.js#readme).
- [Zod README](https://github.com/colinhacks/zod/tree/main/packages/zod#readme).
- [VitePress npm versions](https://www.npmjs.com/package/vitepress?activeTab=versions).
- [Fast XML Parser: experimental v6](https://github.com/NaturalIntelligence/fast-xml-parser#documents).
- [typescript-eslint dependency versions](https://typescript-eslint.io/users/dependency-versions/).

В этом audit зависимости и runtime реализация не менялись. Проверены metadata,
upstream материалы и экспорт TypeScript 7; native HCM запусков не было.

## Выполнено после аудита (2026-11-05)

По запросу пользователя в этот же draft PR добавлены:

- `fast-xml-parser`: `^5.11.1` → `^5.11.2` в `ws-client` и `bt-cli`.
  Версия 5.11.2 опубликована 2026-09-29. `ws-client` использует её для SOAP,
  включая операции MCP. Latest 5.12.0
  опубликована 2026-11-03 и пока не проходит 14-дневную выдержку.
- `@types/node`: `^24.13.6` → `^24.19.2` во всех семи workspace consumers.
  Версия 24.19.2 опубликована 2026-10-09. Это последняя версия типов линии 24
  для закреплённого Node
  24.22.2; minor/patch версий типов и runtime не обязаны совпадать. Типы Node 26
  для этого toolchain не выбирались.

Обновлены syncpack pins и lockfile. Сопутствующие обновления в lockfile:
`@nodable/entities` 3.1.0 и `undici-types` 7.24.6; транзитивные `@types/node`
выровнялись на 24.
Остальные восемь patch/minor позиций, Chokidar 6 и TypeScript 7 остаются
отдельными задачами.

Проверено после обновления: frozen-lockfile install; сборка 15/15; 114/114 unit
tests (SOAP 19, MCP 29, bt-ir 61, ESLint 5); MCP tarball smoke с workspace
dependencies; lint (0 errors, прежние 45 warnings); форматирование изменённых
файлов; syncpack; сборка документации; `git diff --check`.
`pnpm audit --audit-level=high` проходит: остаётся одна moderate, high/critical
не найдены. Подключений к HCM и native acceptance не было.
