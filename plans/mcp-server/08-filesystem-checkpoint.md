# Файловый MCP checkpoint

Дата: 2026-11-07. PR: [#48](https://github.com/BorisType/BorisType/pull/48).
Проверенный production implementation: `a399e449cd49a005921676ba48fe2c67a20908a5`,
base `ed8935d3ba4be97cdba8d012ec05fdbfe9129b24`. Завершающая уборка меняет
release notes, документацию и комментарий версии ABI, без изменения поведения.

## Завершённый шаг

Экспериментальный stdio MCP предоставляет девять операций с **физической
файловой системой** HCM через authenticated SOAP evaluator и отдельно
установленную BorisType.FileSystem **0.1.0-alpha.4 / API 2**:

| Tool                     | Завершённое поведение                                                                     |
| ------------------------ | ----------------------------------------------------------------------------------------- |
| `wshcm_read_file`        | Strict UTF-8, весь файл или строки, BOM/hash/UTF-16 coordinates и readToken.              |
| `wshcm_write_file`       | Create-only по умолчанию; overwrite после полного чтения той же версии.                   |
| `wshcm_edit_file`        | Unique sequential replacements в прочитанном покрытии, dry-run и проверка исходных bytes. |
| `wshcm_list_directory`   | Immediate entries в ordinal order, без обхода links.                                      |
| `wshcm_search_files`     | Glob имён, literal/.NET regex содержимого, budgets и явный неполный охват.                |
| `wshcm_delete_file`      | Удаление отдельного файла, без удаления каталога.                                         |
| `wshcm_create_directory` | Создание каталога и missing parents.                                                      |
| `wshcm_move_file`        | Native no-replace rename без copy/delete fallback.                                        |
| `wshcm_get_file_info`    | Metadata без предоставления read grant, включая binary/large files.                       |

Read grants ограничены экземпляром MCP, URL, версией bytes, диапазонами,
количеством и TTL. Ошибка доставки mutation response не сохраняет разрешение
на повторную правку. Text IO ограничен 1 MiB, strict UTF-8; BOM/newlines
покрыты проверками. Shared chat isolation и атомарный CAS с внешним writer
не входят в контракт.

Пакет собирается независимо от TS → BS compiler. `.NET` workspace имеет SDK pin,
locked restore, managed tests, installation ZIP с hashes и Windows/Linux CI.
Переносимый `skills/websoft-hcm` устанавливается отдельно и хранит подтверждённые
сведения о путях, конфигурации и SQL storage, без зависимости от MCP.

## Проверка состава и уборка

- В MCP зарегистрированы девять реализованных tools. Незавершённые
  read-multiple/tree отсутствуют в source, регистрации и публикуемом build.
- Два действующих BS resources — `file-operation.bs` и `search-files.bs` —
  используются bridge и входят в настоящий npm tarball. Старые BS stubs удалены.
- Четыре промежуточных changeset сведены в один: итоговые девять tools,
  alpha.4/API 2, always-JSON read и обязательный readToken вместо старых
  обещаний alpha.3/API 1 и optional metadata.
- В PR нет tracked `build/dist/bin/obj`, DLL/vendor binaries, архивов, логов,
  временных fixtures или `.env`. Пользовательский untracked `.agents/` не включён.
- Research plans и probes сохранены как evidence и способы воспроизведения.
  Они исключены из production npm/ZIP. Известный Datex callback crash изолирован
  в ручном `unsafe-platform-encode.bs`, не вызывается обычным smoke или tools.

Два независимых read-only review Node/BS/ws-client и managed core не нашли
блокирующих дефектов. Устаревшие release notes исправлены. Дополнительные
изолированные managed проверки отвергли гипотезы о symlink root bypass через
trailing slash и о молчаливой подмене непарного UTF-16 surrogate при записи.

## Локальная проверка 2026-11-07

Среда: Linux x64, Node 24.22.2, pnpm 12.16.1, .NET SDK 9.0.320,
Microsoft.NETCore.App 9.0.22. Команды выполняются из корня репозитория;
`dotnet` должен быть доступен в PATH.

| Проверка                                        | Результат                                                                                                         |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `pnpm exec turbo run build test --force`        | 20/20 tasks, без cache; MCP 111/111, ws-client 19/19, bt-ir 61/61, ESLint plugin 5/5.                             |
| `pnpm test`                                     | botest 149/149, 17 suites.                                                                                        |
| `pnpm build:dotnet`                             | Release build, 0 warnings/errors, locked restore.                                                                 |
| `pnpm test:dotnet`                              | Managed tests 107/107, без skips.                                                                                 |
| `pnpm test:dotnet:pack`                         | Настоящий installation ZIP: состав и все manifest hashes проверены.                                               |
| `pnpm --filter @boristype/mcp-server test:pack` | Настоящий npm tarball: resources, отсутствие stubs, import и CLI help/version. Использует workspace dependencies. |
| `pnpm lint`                                     | 0 errors; 11 прежних warnings в bt-ir.                                                                            |
| `pnpm check-versions`                           | Syncpack без расхождений.                                                                                         |

`pnpm exec changeset status --since origin/main` подтвердил корректный release
plan: MCP minor и patch обновления зависимых пакетов. Prettier по tracked files
и новому checkpoint прошёл; пользовательский `.agents/` исключён из набора.
`pnpm docs:build` завершился успешно с прежними предупреждениями подсветки `gitignore`.

`pnpm audit --audit-level=high` завершился успешно: high/critical отсутствуют.
Остаётся **moderate** [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249)
для `minimatch@10.2.6`, уже присутствующего в `origin/main` на указанном base.
Затронуты eslint/typescript-eslint и `bt-cli → archiver → readdir-glob`;
новый MCP package не использует minimatch. Advisory указывает исправление
в 11.0.1; обновление major/transitive compatibility требует отдельного шага.
Этот checkpoint не заявляет полностью чистый dependency audit.

## Native и CI evidence

[Native acceptance alpha.4](../dotnet/13-read-aware-files-results.md) от
2026-11-06: Linux C-runtime HCM 2025.2.1333 / CLR 9.0.11, suites files **28/28**,
edit **1/1**, read-aware **1/1**, search **1/1**, без skips. Проверены реальные
bytes/hashes, token isolation двух MCP instances и независимый cleanup;
stand возвращён в исходное остановленное состояние.

На merge-проверке native suites повторно не запускались: functional code после
этого acceptance не менялся. Локальная managed проверка на CLR 9.0.22 не заменяет
результат на платформенном CLR 9.0.11. Windows HCM и JS runtime не аттестованы.

Для проверенного `a399e44` GitHub CI завершился успешно: ESLint & Prettier
(включая Node unit/package tests) и .NET build/test/pack на Ubuntu и Windows.
Статус окончательного head-коммита проверяется отдельно в PR перед merge.

## Следующие отдельные шаги

1. Логические URL/blob операции с самостоятельным backend и read-grant contract.
   `UrlToFilePath` не переносит SQL routing; правка диска не обновляет blob.
   [Подтверждённое поведение](../dotnet/15-url-storage-routing-research.md).
2. Partial evaluator initialization и shutdown во время активного SOAP: cleanup
   этих сценариев не заявляется завершённым. EOF/SIGINT/SIGTERM проверены.
3. Стратегия CAS относительно внешних writers, permissions/VFS и special files.
   Текущая повторная проверка bytes перед rename не закрывает внешнюю гонку.
4. Native acceptance на Windows HCM и других версиях; полный механизм
   регистрации URL roots. Наличие DESIGN-DB/DATA-DB само по себе не даёт
   универсального рецепта допуска корня или SQL storage.
5. Отдельное устранение унаследованного moderate minimatch advisory.

Завершённая граница — проверенный экспериментальный filesystem MCP на указанной
Linux HCM, с portable managed core и явными ограничениями. Продолжение этих
исследований не является условием добавления текущего checkpoint в main.
