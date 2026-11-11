> Исторический материал из `plans/dotnet/06-search-results.md` (baseline `8ff2739`).
> Статусы, команды и утверждения ниже относятся к описанному этапу; актуальные входы — [refs](../../README.md).

# File search: implementation evidence and remaining acceptance

Дата: 2026-11-06. Branch: `feat/mcp-server`.

## Реализованный шаг

`BorisType.FileSystem` 0.1.0-alpha.2 предоставляет capability `search` и API 1.
`Search.FindJson(string, string)` — единственный bridge entry с таким именем;
управляемая cancellation доступна через `FindJsonWithCancellation`.

Поиск имён работает без чтения содержимого. Поиск содержимого использует strict
UTF-8, literal или .NET line regex, glob filters/exclusions и budgets из
[контракта](04-search-design.md). Lazy DFS не сортирует всё дерево; ограниченные
matches сортируются перед возвратом. Counters и limitReason описывают пропуски
и неполные результаты. Symlinks/junctions не обходятся.

MCP регистрирует пятый tool `wshcm_search_files`. Настоящий BS template разрешает
URL через `UrlToFilePath` и передаёт физический root в DLL. Два слоя JSON carrier
защищают строковый ответ; Node проверяет response schema и финальный UTF-8 budget
с учётом root URL. Четыре прежних инструмента не переписаны.

## Проверки вне HCM

Среда: Linux; Node 24.22.2, pnpm 12.16.1, .NET SDK 9.0.320 / host CLR 9.0.22.
SDK установлен вне репозитория. CLR исследованного HCM — отдельная 9.0.11.

| Проверка                                                      | Результат                                                                 |
| ------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `pnpm build:dotnet`                                           | Release build, 0 warnings / errors                                        |
| `pnpm test:dotnet`                                            | 44/44; настоящий temporary filesystem, reflection string ABI              |
| `pnpm test:dotnet:pack`                                       | 1/1; production ZIP, состав, manifest hashes и сложный output path        |
| `pnpm pack:dotnet`                                            | `packages/dotnet/dist/BorisType.FileSystem-0.1.0-alpha.2.zip`             |
| `pnpm exec turbo run build`                                   | 15/15 Node build tasks; .NET build не вызывается                          |
| MCP unit/protocol/stdio                                       | 59/59                                                                     |
| ws-client / ws-version / bt-ir / eslint-plugin                | 19/19, 23/23, 61/61, 5/5                                                  |
| MCP `test:pack`                                               | Реальный tarball, resources/import/CLI help/version                       |
| `pnpm test`                                                   | 149/149, 17 suites                                                        |
| `pnpm test:semantic`                                          | 1920/1920 на каждый bare/script/module; Node + JS reference runtime, не C |
| `pnpm test:expressions:baseline`                              | 48 comparisons: 10 PASS / 38 известных XFAIL                              |
| `pnpm format:check`, `pnpm check-versions`, `pnpm docs:build` | Exit 0                                                                    |
| `pnpm lint`                                                   | Exit 0; 0 errors / 39 warnings в прежнем коде                             |
| Markdown local file links / `git diff --check`                | Новых битых file links / whitespace ошибок нет                            |
| Native runner syntax + missing-env gate                       | Syntax valid; без stand env exit 1 с явной configuration error, 0 skipped |

MCP protocol tests используют настоящий InMemoryTransport и исполняют настоящий
BS template в Node VM. Внешние platform/CLR calls подменены. Это проверяет adapter
и transport, но не bridge/native parser/runtime.

TDD evidence: до implementation падали reflection ABI и protocol cases.
Review выявил и regression tests воспроизвели до исправления:

- terminal `**` не совпадал с LF в допустимом Linux filename;
- Node contract ошибочно отвергал literal backslash и `C:foo` в Linux filename;
- root URL мог вытолкнуть итоговый MCP JSON за предел 256 KiB;
- Windows drive-prefixed glob принимался как относительный;
- перегруженный FindJson неоднозначен при reflection lookup по имени.

Исправления проверены managed/protocol tests. Повторный read-only review не
нашёл оставшихся существенных замечаний. Локальная фиксация не публикует ветку
и не добавляет пользовательскую `.agents/`, bin/obj/dist или vendor DLL.

## Native acceptance: Linux HCM, PASS

После первоначальной managed реализации пользователь явно разрешил живую проверку.
Существующие контейнеры были остановлены. Installation ZIP проверен по manifest
hashes и установлен до запуска HCM; прежних файлов BorisType.FileSystem в shared
не было. В 16:47 UTC существующий compose project запущен без пересоздания и
перенастройки. HTTP 200, authentication и SOAP arithmetic smoke прошли.

Runtime: Linux amd64, Ubuntu 24.04.3, `websoft/hcm:2025.2.1333`, image id
`sha256:0edeac24afc2a5371ea8431c59b1c17ca2b1a9e5a3768275cfdb5023609e34ab`.
Лог текущего старта подтверждает CLR `.NET 9.0.11`, assembly
`2.25.12.4 [202512041524]`. Carrier: CLI → stdio MCP → SOAP evaluator temporary
library → C BorisScript → DotNetCoreHost → установленная managed DLL.

Metadata probe вернул строго ожидаемый JSON: id BorisType.FileSystem,
version 0.1.0-alpha.2, apiVersion 1, capabilities `["search"]`.
SHA256 original/evaluated probe (без адаптации):
`3d13ef7f8ac6f3ce23970326d1276387c1d87da0d0e36433600c6190c2f5cb7a`.
Cleanup probe evaluator подтверждён.

`pnpm --filter @boristype/mcp-server test:e2e:search` — **1/1 PASS, 0 skipped**.
Финальный runner выполнил шесть последовательных search calls на своём unique
временном дереве; каждое сравнение использует фиксированные expected values:

| Case                             | Проверенный результат                                                          |
| -------------------------------- | ------------------------------------------------------------------------------ |
| `**/*.bs`, exclude `vendor/**`   | `main.bs`, `sub/deep.bs`; readBytes 0, links 1                                 |
| Literal needle, ignoreCase       | 4 hits; line 2/3/4 и UTF-16 columns 5/1/4 для main.bs, плюс nested hit         |
| maxResults 1                     | Один hit, limitReason results                                                  |
| Binary NUL fixture               | skipped.binary 1                                                               |
| Regex `[a-z]{2}-\d+`, ignoreCase | AB-42 и ab-07, lines 1/2, column 4                                             |
| Quoted root/query                | Кавычка, backslash, Unicode, `${path}`, `${request}`, `$&` сохранены буквально |

Штатный cleanup проверяется внешним filesystem inspection. Дополнительный `find`
после теста не обнаружил `unsafe_eval_*.bs` или `mcp-e2e-*` в корне wt.
HCM после теста оставался running, OOMKilled=false; падений и timeout не было.
После проверки оба контейнера штатно остановлены, как до начала теста; установленная
DLL оставлена для следующих запусков. Hot replacement этим не проверяется.

BS template SHA256:
`2ed634fb0b958262f3c169929e7d033273f4a859578b5719eca7615971e36275`.
Установленная DLL SHA256:
`3e06197333f2afa37f549048ca63b23abfc271f020297a97916878c38c774145`.
Raw logs, deployment manifest и probe code сохранены вне git:
`/home/agent/workspace/wshcm-stand-net9/research/search-native-ckxh77m6/`.

Runner: `packages/mcp-server/test/e2e/search.mjs`; explicit running stand env и
отдельная установка DLL обязательны. Команда и prerequisites — в
[MCP README](../../../packages/mcp-server/README.md#e2e-на-установленном-локальном-docker-стенде).
Серия прекращается при первой ошибке; native timeout не повторяется. Весь сервер
не сканируется. Это evidence одной Linux C-сборки, не Windows или JS runtime.

Известный callback `DatexGlobal.EncodeJson` с exit 139 не запускается.
Новый search core не зависит от Datex и не выполняет platform callbacks.
Предыдущий успешный эксперимент первой загрузки DLL не доказывает hot replacement.

## Границы поддержки

- Обычные стабильные filesystem trees, strict UTF-8. VFS/special files не аттестованы.
- Cooperative deadline не прерывает заблокированный syscall.
- Reparse-point policy не обещает TOCTOU sandbox.
- Result subset при раннем останове зависит от filesystem enumeration order.
- DLL устанавливается отдельно; npm package не содержит серверные assemblies.
- Развитие compiler script/module остаётся замороженным по memory ADR.
