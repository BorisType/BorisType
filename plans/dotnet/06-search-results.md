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

## Native acceptance: ещё не выполнен

`docker ps` не показывает работающих контейнеров. Стенд не запускался,
DLL не устанавливалась; новых native search calls в этом шаге не было.
Совместимость resolver/bridge на HCM пока не подтверждена. Тесты Linux managed
также не доказывают Windows execution; для managed Windows предусмотрен CI job.

Подготовлен отдельный `packages/mcp-server/test/e2e/search.mjs`, команда
`pnpm --filter @boristype/mcp-server test:e2e:search`. Она требует explicit running
local stand env и уже установленную DLL; команда и prerequisites приведены в
[MCP README](../../packages/mcp-server/README.md#e2e-на-установленном-локальном-docker-стенде).

Runner создаёт unique fixture, проверяет names/content/Unicode/BOM/newlines,
exclusions/links/binary/result limit через CLI/stdio/SOAP/DLL и независимый cleanup.
Серия прекращается при первой ошибке, native timeout не повторяется. Документирует
hash BS template и установленной DLL. Весь сервер не сканируется.

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
