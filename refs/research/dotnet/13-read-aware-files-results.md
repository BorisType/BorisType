> Датированное техническое evidence; текущие основания — [тематическая запись](../../dotnet/files-and-read-grants.md).
> Alpha.4/API2 checkpoint не переаттестован переносом документации. Windows managed CI и Windows HCM — разные проверки.

# Результаты: учёт чтений и девять файловых tools

Дата: 2026-11-06. [Контракт](../../dotnet/files-and-read-grants.md),
[задачи](../../dotnet/files-and-read-grants.md),
[ADR](../../decisions/2026-11-06-read-aware-file-tools.md).

## Реализовано

- DLL 0.1.0-alpha.4/API 2, несовместимое обновление MCP и managed JSON contracts.
- Read всегда возвращает JSON с line ranges, UTF-16 coordinates и новым token.
  Накопление диапазонов требует предыдущий token; без него разрешается только
  новое чтение. Это предотвращает молчаливое расширение старого grant потерянным
  ответом. При смене byte hash старое покрытие не переносится.
- Edit требует per-createServer read grant и полное покрытие каждого oldText;
  DLL проверяет hash, диапазоны и их сдвиги между последовательными edits.
- Create-only write и guarded overwrite после полного чтения. Mutation попытки
  инвалидируют URL grant, включая ошибки доставки; dryRun не расширяет покрытие.
- Bounded state: 128 URLs, 256 intervals/snapshot, TTL 30 минут; последовательная
  очередь read/mutations предотвращает повторное одновременное использование token.
- Create-directory, metadata для binary/large files и native no-overwrite rename
  без copy/delete fallback. Linux renameat2 и Windows MoveFileExW; CrossDevice
  явно отвергается. Оба URL для move разрешает BS UrlToFilePath.
- Удалены пять BS stubs и два отложенных TS stubs; clean build и реальный tarball
  проверяются на отсутствие устаревших emitted файлов. Два действующих BS bridges
  сохранены. Документация и ROADMAP обновлены.

## Автоматические проверки вне HCM

- .NET Release build: 0 warnings/errors; managed suite **107/107**.
- MCP protocol/VM/stdio/state: **111/111**. Включены token isolation, explicit
  accumulation, stale/reused tokens, TTL/eviction/interval bounds, full overwrite,
  response loss, concurrent consumption, complete bridge request/response validation.
- Turbo build/test: **20/20** tasks, включая ws-client **19/19**, bt-ir **61/61**,
  ws-version **23/23**, ESLint plugin **5/5**; часть builds получена из cache.
- Root botest: **149/149**, 17 suites. Исходные unlisted cases остаются вне suites;
  это существующая граница набора, не native evidence.
- Installation ZIP: **1/1**, manifest/file hashes; npm tarball smoke прошёл.
- Prettier, syncpack, docs build и git diff checks прошли. ESLint: 0 errors;
  11 прежних warnings в bt-ir, warnings удалённых MCP stubs отсутствуют.

RED → GREEN наблюдался для line ranges/coverage/preconditions/create-only,
MCP tokens/overwrite/new tools, удаления BS stubs в npm artifact, required range
coordinates и подтверждённого накопления ranges. Отдельное read-only review не
нашло важных ошибок, включая повторную проверку acknowledgement chain.

Managed filesystem проверки выполнялись на Linux; Windows branch требует CI.
Protocol tests исполняют реальный BS template в JS VM с double внешней платформы;
их результаты не переносятся автоматически на native C carrier.

## Native Linux HCM

Стенд вне git: `/home/agent/workspace/wshcm-stand-net9`, существующие контейнеры
boristype-c-runtime-net9-wt-1/postgres-1. Перед работой оба остановлены.
Alpha.4 установлена из manifest-verified ZIP при остановленном HCM; прежняя
alpha.3 сохранена в evidence/previous. Контейнеры запущены без recreation.

- Image `websoft/hcm:2025.2.1333`, Linux x64, CLR 9.0.11, managed platform assembly
  2.25.12.4 [202512041524] на этом исследованном стенде.
- Image ID `sha256:0edeac24afc2a5371ea8431c59b1c17ca2b1a9e5a3768275cfdb5023609e34ab`.
- DLL SHA256 `47487c24cdd4cce518c718aa1336a80c7d4e52777ea2609cb7a1053267d843af`.
- file-operation.bs SHA256 `7a1a2fbc86ef894a6985a91a29c66ffa191093ae7e1dd04dee260f027d45325b`.
- search-files.bs SHA256 `2ed634fb0b958262f3c169929e7d033273f4a859578b5719eca7615971e36275`.

Authenticated evaluator smoke вернул numeric 4; metadata probe подтвердил
alpha.4/API 2 и capabilities search/files/edit/read-ranges/read-preconditions/
mkdir/info/move. Carrier: CLI/stdio/SOAP/C-runtime/DotNetCoreHost, без Datex callbacks.

Последовательно прошли, без skips/timeouts/failures:

| Команда MCP package | Результат                                                                                                       |
| ------------------- | --------------------------------------------------------------------------------------------------------------- |
| test:e2e            | 28/28, read/create/guarded overwrite/list/delete и lifecycle cleanup                                            |
| test:e2e:edit       | 1/1, BOM/no-BOM, preview/commit, consumed token, external stale bytes, rollback/errors                          |
| test:e2e:read-aware | 1/1, missing/foreign/reused tokens, UTF-16 ranges, unread patch rollback, guarded write, mkdir/info/binary move |
| test:e2e:search     | 1/1, исходная name/content/regex/exclusion/limits regression с API 2                                            |

Байты и hashes проверены независимо через Docker. После suites отдельно
подтверждено отсутствие unsafe_eval и mcp-e2e fixtures. Оба контейнера намеренно
остановлены, OOM=false; alpha.4 остаётся установленной. Старые artifact files
сохранены вне репозитория.

Raw evidence:
`/home/agent/workspace/wshcm-stand-net9/research/read-aware-native-1ecuqdc8/`:
deployment-manifest.json, arithmetic/metadata sources и JSONL, четыре e2e logs,
cleanup.json, initial-state.json, post-test-state.json. Пароли/vendor binaries
и raw logs не добавлялись в git.

## Сохранённые границы

- Разные чаты, использующие один MCP server, не изолированы без клиентского
  lifecycle signal. Наличие token подтверждает выдачу ответа, не осмысление моделью.
- DLL принимает trusted hash/ranges от MCP, а не хранит read grants; прямой SOAP
  или намеренный delete/create не ограничиваются этим правилом.
- Проверка bytes и rename не являются атомарным CAS относительно внешнего writer.
  Строгое закрытие окна остаётся отдельным исследованием, не заявленной гарантией.
- Windows HCM, другие версии/JS runtime, VFS/special files, TOCTOU sandbox,
  owner/ACL/hardlinks и hard syscall cancellation не подтверждены этим запуском.
- Cross-filesystem отказ проверен отдельным managed Linux тестом с /dev/shm;
  native HCM suite проверяет rename внутри fixture, не этот отдельный mount case.
