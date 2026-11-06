# BorisType .NET workspace

Самостоятельные C# библиотеки BorisType для загрузки в .NET-хост WebSoft HCM.
`packages/dotnet` — общий workspace, а каждый проект в `src/` имеет собственные
DLL, версию и зависимости. Первая библиотека — `BorisType.FileSystem`.

Текущий этап предоставляет metadata API, сборку, unit tests и installation ZIP.
Файловых операций и поиска пока нет. Существующие MCP tools используют прежний
BS/SOAP путь; установка DLL не добавляет новый MCP tool автоматически.

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
  "version": "0.1.0-alpha.1",
  "apiVersion": 1,
  "capabilities": []
}
```

Version берётся из assembly metadata, API version задаётся свойством
`BorisTypeApiVersion`. Пустые capabilities отражают отсутствие файлового API.
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
`dist/BorisType.FileSystem-0.1.0-alpha.1.zip` относительно этого workspace.
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

Происхождение и evidence: [дизайн](../../plans/dotnet/01-workspace-design.md),
[native DLL experiment](../../plans/mcp-server/06-dotnet-probe.md),
[референс wshcmx/net](../../plans/mcp-server/07-wshcmx-net-reference.md).
