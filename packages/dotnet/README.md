# BorisType .NET workspace

Самостоятельные C# библиотеки BorisType для загрузки в .NET-хост WebSoft HCM.
`packages/dotnet` — общий workspace, а каждый проект в `src/` имеет собственные
DLL, версию и зависимости. Первая библиотека — `BorisType.FileSystem`.

Библиотека предоставляет metadata API, поиск имён и UTF-8 содержимого,
read/write/list/delete/edit, mkdir, metadata и rename. Все девять файловых MCP tools используют DLL через
BS URL resolver. Есть managed tests и installation ZIP.

## Требования и команды

- Для обычного Node workspace SDK не нужен. Для .NET-команд требуется SDK из
  корневого `global.json`: **9.0.320**, с разрешёнными более новыми patch этой feature band.
- Target framework библиотек — **net9.0**, без RID/AOT и self-contained CLR.
  SDK машины сборки и CLR внутри HCM — разные установки.
- Node.js/pnpm используются из `.node-version` и root `package.json`.

Из корня BorisType:

```sh
pnpm install --frozen-lockfile
pnpm build:dotnet
pnpm test:dotnet
pnpm pack:dotnet
pnpm test:dotnet:pack
```

Private npm wrapper `@boristype/dotnet-workspace` содержит только эти команды.
Default Turbo build их не вызывает. C# зависимости задаются `ProjectReference`,
а версии NuGet packages — в `Directory.Packages.props`. Wrapper не публикуется
и исключён из Changesets; версию каждой C# библиотеки задаёт её `.csproj`.

Прямой .NET путь, без pnpm:

```sh
dotnet restore packages/dotnet/BorisType.DotNet.slnx --locked-mode
dotnet build packages/dotnet/BorisType.DotNet.slnx -c Release --no-restore
dotnet test packages/dotnet/BorisType.DotNet.slnx -c Release --no-build --no-restore
node packages/dotnet/tools/pack.mjs
```

NuGet lock files включены в git. После намеренного обновления dependencies:
`dotnet restore packages/dotnet/BorisType.DotNet.slnx --force-evaluate`, затем
проверить и закоммитить lock diff. Bin/obj/dist исключены из git и Prettier.

## Структура

```text
packages/dotnet/
  BorisType.DotNet.slnx
  Directory.Build.props
  Directory.Packages.props
  src/BorisType.FileSystem/
  tests/BorisType.FileSystem.Tests/
  probes/PlainProbe/
  probes/DatexProbe/                   # отдельная manual сборка, вне solution
  tools/pack.mjs
  tools/Archive.proj
  test/pack.test.mjs
  dist/
```

Новая библиотека получает соседний проект в `src/`, отдельный test project и
запись в solution. Общие props применяются автоматически. Не создавать пустые
адаптеры или дополнительные assemblies без конкретного потребителя.

## Публичный metadata API

`BorisType.FileSystem.LibraryInfo.GetMetadataJson()` — статический метод без
аргументов и Datex context, возвращающий JSON string:

```json
{
  "id": "BorisType.FileSystem",
  "version": "0.1.0-alpha.4",
  "apiVersion": 2,
  "capabilities": ["search", "files", "edit", "read-ranges", "read-preconditions", "mkdir", "info", "move"]
}
```

Version берётся из assembly metadata, API version задаётся свойством
`BorisTypeApiVersion`. Capabilities `search`, `files` и `edit` отражают доступные API.
Метод позволяет потребителю идентифицировать DLL перед использованием её функций.

После отдельной установки DLL в каталог, доступный `DOTNETLIBS-PATH`, форма BS вызова:

```js
var assembly = tools.dotnet_host.Object.GetAssembly("BorisType.FileSystem.dll");
return assembly.CallClassStaticMethod("BorisType.FileSystem.LibraryInfo", "GetMetadataJson", []);
```

Core не ссылается на Datex и не вызывает обратно ядро BS. Это не отменяет
необходимость native acceptance на целевой версии HCM: .NET unit tests и
проверка ZIP выполняются вне платформенного процесса.

## Installation ZIP

`pnpm pack:dotnet` создаёт
`dist/BorisType.FileSystem-0.1.0-alpha.4.zip` относительно этого workspace.
Для другого output: `node packages/dotnet/tools/pack.mjs --out /absolute/path`.
На Windows можно передать обычный Windows path как отдельный аргумент.

Содержимое первого пакета: production DLL, `.deps.json`, portable `.pdb`, XML
documentation и `manifest.json`. Tests, probes, vendor assemblies и CLR туда
не входят. NuGet/npm публикация этой командой не выполняется.

Manifest содержит schemaVersion, id, version, apiVersion, targetFramework,
entryAssembly и список файлов с bytes/SHA256; сам manifest в собственный hash
list не включён. Список отсортирован, пути используют `/`. ZIP timestamps не
обещают побайтовую идентичность архивов разных запусков. Pack публикует настоящий
csproj с locked restore, использует временный staging и удаляет его в finally.

`test:dotnet:pack` запускает CLI, распаковывает получившийся ZIP штатным MSBuild
Unzip и проверяет фактические файлы и hashes. Workflow `.NET workspace` запускает
build/test/pack на Ubuntu и Windows и сохраняет ZIP как CI artifact. Это отдельная
проверка от native HCM acceptance.

## Probes и платформенные ссылки

[Ручные native probes](probes/README.md) перенесены из MCP-пакета без изменения
BS. PlainProbe входит в default build. DatexProbe требует отдельного
`WebsoftReferenceDir` с Datex.Global.dll из целевого сервера, **вне git**, и не
входит в solution. Для platform references используется `Private=false`.

Известный callback `DatexGlobal.EncodeJson` завершал HCM 2025.2.1333 с exit 139
в SOAP evaluator. Он сохранён для исследования и исключён из обычного runner.
Причина не установлена; результат не обобщается на все Datex API.

Происхождение и evidence: [дизайн](https://github.com/BorisType/BorisType/blob/main/refs/dotnet/workspace.md),
[native DLL experiment](https://github.com/BorisType/BorisType/blob/main/refs/research/mcp/06-dotnet-probe.md),
[референс wshcmx/net](https://github.com/BorisType/BorisType/blob/main/refs/research/mcp/07-wshcmx-net-reference.md).

## Файловый поиск

Статический string ABI: `BorisType.FileSystem.Search.FindJson(rootPath, requestJson)`.
`rootPath` — абсолютный физический путь существующего каталога; относительный путь
отвергается. BS adapter преобразует `x-local://` через `UrlToFilePath` перед DLL.
Core не знает платформенные URL и не выполняет callbacks в Datex.

System.IO не воспроизводит платформенный storage hook: существующий физический
путь и логический `x-local` URL могут обозначать разные данные на диске и в
`spxml_blobs`. DLL оперирует физическими байтами; изменение диска не обновляет
SQL blob. [Native сравнение](https://github.com/BorisType/BorisType/blob/main/refs/research/dotnet/15-url-storage-routing-research.md).

```csharp
string json = BorisType.FileSystem.Search.FindJson(
    physicalRoot,
    "{\"pattern\":\"**/*.bs\",\"query\":\"needle\",\"excludePatterns\":[\"vendor/**\"]}");
```

Без query API возвращает совпавшие имена без чтения содержимого. Query по умолчанию
literal; `regex=true` включает .NET regex по отдельным строкам с timeout 50 ms.
`ignoreCase` относится к содержимому, globs остаются ordinal case-sensitive.
Поддержаны `*`, `?`, полный segment `**`; patterns без `/` проверяют basename на
любой глубине. `vendor/**` исключает и обход каталога. Нет brace/class globs.

Ответ: apiVersion, matches, limitReason, stats, skipped. Для содержимого hit
содержит relative path, line/column (1-based, UTF-16) и text строки без newline;
для имён — только path. Разделитель segments всегда `/`; backslash и colon в
Linux-имени сохраняются как данные. Это не путь для разрешения на ОС клиента.

Default budgets: 200 results, 10000 entries, depth 10, 1 MiB/file, 16 MiB/read,
2000 ms, 2000 UTF-16 units/line. Hard maxima и все options — в
[контракте поиска](https://github.com/BorisType/BorisType/blob/main/refs/dotnet/search.md). JSON DLL и финальный
MCP JSON ограничены 256 KiB. При нехватке budget limitReason явно указывает
results/entries/bytes/time/regex/output. Пустой matches при limitReason != null
не означает отсутствие совпадений. Счётчики skipped показывают пропуски links,
depth, tooLarge, binary, invalidEncoding, longLines и ioErrors.

UTF-8 декодируется строго, начальный BOM убирается; NUL означает binary. Другие
кодировки не угадываются. Symlink/junction не обходятся, root и ancestors не
могут быть reparse points. Это не защита от конкурентной подмены filesystem paths.
Deadline cooperative: блокирующий syscall/сетевая FS может задержать возврат.
Специальные файлы и VFS аттестацию не проходили.

Управляемый потребитель может вызвать `FindJsonWithCancellation` с
CancellationToken. Отдельное имя сохраняет однозначность bridge entry FindJson.

### Установка для MCP

Распаковать ZIP в каталог из `DOTNETLIBS-PATH` целевого HCM, например
`dotnetcore/shared` в исследованном Linux стенде. SDK/CLR на сервер не копировать.
MCP package не устанавливает DLL автоматически. При обновлении уже загруженной
DLL пока планировать перезапуск HCM: первая загрузка без рестарта проверена,
hot replacement — нет.

Managed tests и MCP adapter/VM tests проходят вне HCM. Отдельный native e2e
подтвердил resolver и поиск через CLI/stdio/SOAP/BS/DLL на Linux HCM 2025.2.1333 /
CLR 9.0.11: имена, содержимое, Unicode/BOM/newlines, exclusions/links, binary,
result limit, regex и quoted path/query. [Evidence и hashes](https://github.com/BorisType/BorisType/blob/main/refs/research/dotnet/06-search-results.md).
Windows и другие версии HCM этим запуском не проверены.
Команда MCP `test:e2e:search` не запускает стенд, не устанавливает DLL и сканирует
только свой temp fixture.

## Файловое API 2 и учёт чтений в MCP

`BorisType.FileSystem.Files` предоставляет восемь unique string ABI методов:
ReadJson, WriteJson, ListJson, DeleteJson, EditJson, CreateDirectoryJson, InfoJson,
MoveJson. Каждый принимает `(string physicalPath, string requestJson)` и возвращает
JSON string API 2. Пути абсолютные; links/junctions и их ancestors отвергаются.
Для MoveJson request.destination — тоже physical path, преобразуемый BS bridge.

ReadJson принимает optional startLine/endLine и возвращает exact content, sha256
исходных bytes с BOM, bom, line/UTF-16 coordinates. Text file/result <=1 MiB;
диапазон не позволяет читать oversized file. WriteJson mode=create по умолчанию
запрещает overwrite. Mode overwrite требует expectedSha256 и повторной проверки
bytes перед commit. Write добавляет BOM; edit сохраняет BOM и остальные newlines.

EditJson требует expectedSha256 и allowedRanges `{start,end}` исходного UTF-16
текста. Непустые oldText должны быть unique (включая overlapping matches) и целиком
лежать в покрытии. Последовательные edits сдвигают покрытие и учитывают введённый
newText. Все patches проверяются до записи; dryRun возвращает полный preview без
записи. JSON <=8 MiB, listing <=10000 entries, edits <=100. Errors versioned,
с code/message и 1-based editIndex, если применимо.

MCP хранит read-token/ranges отдельно для createServer; DLL не хранит сессий и не
доказывает предшествующее чтение сама. Клиент использует только token/ranges,
предоставленные MCP. Подробности накопления диапазонов, TTL, invalidation и
отсутствующей гарантии границ чата — в [MCP README](https://github.com/BorisType/BorisType/blob/main/packages/mcp-server/README.md).

CreateDirectoryJson создаёт missing parents, existing directory — created=false;
цепочка не транзакционна. InfoJson не читает содержимое: name/isDirectory,
modifiedUtc и sizeBytes для файла, включая binary/large files. ListJson ordinal,
nonrecursive, отмечает links без traversal. DeleteJson только для existing file.

MoveJson использует Linux renameat2(RENAME_NOREPLACE) или Windows MoveFileExW без
COPY_ALLOWED/REPLACE_EXISTING. Нет скрытого copy/delete: CrossDevice либо explicit
unsupported error. Другие ОС не поддержаны этим методом. Binary bytes не
декодируются и не переписываются. Windows native branch предназначена для managed CI;
локальный запуск на Linux не подтверждает загрузку DLL в Windows HCM.

Write/edit готовят temp рядом с target, flush и rename. Mutation lock защищает
собственные вызовы одного экземпляра DLL. Последняя проверка bytes и rename не
составляют атомарный cross-process CAS; строгая защита окна отложена. Existing
Unix rwx сохраняются, новые файлы имеют 0600 с учётом umask; owner/ACL/inode/hardlinks
без гарантии. VFS, special files и hard syscall cancellation не обещаются.

API 2 несовместим с alpha.3/API 1: обновить MCP и установленную DLL вместе.
[Контракт](https://github.com/BorisType/BorisType/blob/main/refs/dotnet/files-and-read-grants.md),
[план проверки](https://github.com/BorisType/BorisType/blob/main/refs/dotnet/files-and-read-grants.md).

DLL alpha.4/API 2 прошла native acceptance всех девяти файловых MCP tools и read guards на
Linux HCM 2025.2.1333 / CLR 9.0.11. [Результаты](https://github.com/BorisType/BorisType/blob/main/refs/research/dotnet/13-read-aware-files-results.md).
