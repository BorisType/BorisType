# План реализации учёта чтений и девяти tools

> Выполнять последовательно в текущей ветке; каждый шаг проходит RED → GREEN.

**Цель:** реализовать [контракт](11-read-aware-files-design.md), сохранив известные
границы чатов и внешней гонки после проверки. Baseline: MCP 95/95, .NET 83/83.

## 1. Managed read/coverage/write

- [x] Добавить `ReadAwareTests.cs`: `ReadJson` с `{startLine:2,endLine:2}` на
      `"a\r\n👋\rb\n"` возвращает `"👋\r"`, offsets [3,6], totalLength=8.
      Edit без hash/ranges отвергается; patch вне allowedRanges даёт ReadRequired
      и не меняет bytes. Проверить сдвиги при нескольких patches.
- [x] Запустить `pnpm test:dotnet` с SDK PATH, подтвердить ожидаемые failures.
- [x] В `FileContract.cs` добавить ReadFileRequest и TextRange; EditFileRequest
      требует expectedSha256/allowedRanges. В `TextCoverage.cs` реализовать line
      slicing, validate/cover/transform intervals. В `Files.cs` применить этот контракт.
- [x] WriteFileRequest: mode=create|overwrite. Create вызывает Replace с
      overwrite=false; overwrite требует hash и повторной проверки исходных bytes.
- [x] Обновить существующие FilesTests, сохранив негативные direct ABI cases;
      сменить managed API на 2 и DLL на alpha.4; повторить managed suite.

## 2. MCP state и protocol

- [x] Добавить `read-aware.test.mjs`: guessed oldText без чтения не допускается;
      токен из другого createServer не допускается; read response возвращает token;
      повторные чтения объединяют диапазоны; overwrite требует полного покрытия.
- [x] Запустить tests против текущего build, подтвердить RED.
- [x] Добавить `read-state.ts`: `ReadState.run<T>(action):Promise<T>`,
      `record(path,read,previousToken?):string`, `require(path,token,hash?,full?):Snapshot`,
      `invalidate(path):void`. TTL=30min, 128 snapshots, максимум 256 ranges.
- [x] Создать ReadState в createServer и передать read/edit/write/delete/move.
      Read всегда выдаёт JSON, edit отправляет сохранённый hash/ranges, write по
      умолчанию create-only. Обновить schemas, descriptions и API 2 response validation.
- [x] Проверить invalidation на ошибке ответа, очередь двух mutations и TTL/eviction
      через unit tests реального ReadState; обновить protocol/stdIO fixtures.

## 3. Mkdir, stat, rename

- [x] Добавить managed tests `WorkspaceFilesTests.cs`: mkdir-p/idempotence,
      binary metadata без текстового чтения, binary rename, отказ overwrite,
      missing parent, links, same-source/destination и cross-filesystem failure.
- [x] Подтвердить RED. Добавить уникальные ABI CreateDirectoryJson/InfoJson/
      MoveJson в `WorkspaceFiles.cs` (Files partial), native move в `FileMove.cs`.
- [x] Добавить protocol fixtures новых tools; заменить три TS stubs настоящими
      handlers, экспортировать/зарегистрировать. Для move общий BS bridge разрешает
      destination через UrlToFilePath, используя EncodeJson для physical request.
- [x] Повторить managed/protocol suites, включая исходные search cases с API 2.

## 4. Удаление stubs и artifacts

- [x] В pack-smoke добавить проверку отсутствия tree/multiple-read build entries
      и пяти старых BS resources; подтвердить RED на текущем package.
- [x] Удалить deferred TS stubs и пять BS stubs. Build предварительно очищает
      только package build directory. Проверить npm tarball через test:pack.

## 5. Native, документация и итоговая проверка

- [x] Обновить bounded native file/edit/search runners под API 2; добавить cases
      диапазонов, двух соединений, внешней записи, create-only, mkdir/info/binary move.
- [x] Собрать/упаковать DLL, установить на остановленный локальный net9 stand;
      запустить только нужные native suites и восстановить исходное состояние stand.
      Сохранить version/hash и результаты отдельно от managed evidence.
- [x] Обновить package README, guides, ADR и ROADMAP: девять tools, read-token,
      несовместимое обновление, TTL/лимиты, обе отсутствующие гарантии.
- [x] Проверить .NET build/test/pack, Node build/tests, npm pack, lint/format,
      syncpack, docs build и git diff. Зафиксировать evidence в 13-results.

Команды запускать из корня `/c/Users/vomoh/Desktop/projects/BorisType`.
Для dotnet: `PATH=/home/agent/.local/share/boristype-dotnet:$PATH
DOTNET_CLI_TELEMETRY_OPTOUT=1 pnpm test:dotnet`.
Для MCP: `pnpm --filter @boristype/mcp-server... build` и
`pnpm --filter @boristype/mcp-server test`.

Итог: [результаты и ограничения](13-read-aware-files-results.md). Все задачи
этого Linux checkpoint выполнены; Windows managed CI/HCM acceptance и строгий
внешний CAS не входят в этот завершённый этап.
