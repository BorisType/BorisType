> Исторический материал из `plans/dotnet/01-workspace-design.md` (baseline `8ff2739`).
> Статусы, команды и утверждения ниже относятся к описанному этапу; актуальные входы — [refs](../../README.md).

# .NET workspace: первый измеримый шаг

Дата: 2026-11-06. Структура согласована пользователем в разговоре.

## Цель и границы

Создать `packages/dotnet` как общий .NET workspace внутри существующего monorepo.
Каждая будущая библиотека получает собственный `.csproj`, DLL, зависимости и
версию. Первый проект — `BorisType.FileSystem`. Общими остаются SDK, настройки
компилятора, central package management и solution.

Первый шаг даёт build/test/pack и проверяемый metadata API; он не добавляет поиск,
новые MCP tools, автоматическую установку DLL на HCM, NuGet/npm публикацию или
размораживание compiler script/module. MCP остаётся отдельным Node-пакетом.

## Структура и инструменты

```text
global.json
packages/dotnet/
  package.json                       # private command wrapper
  BorisType.DotNet.slnx
  Directory.Build.props
  Directory.Packages.props
  src/BorisType.FileSystem/
  tests/BorisType.FileSystem.Tests/
  probes/                            # прежний mcp-server/probes/dotnet
  tools/pack.mjs
  tools/Archive.proj
  test/pack.test.mjs
  dist/                              # ignored installation artifacts
```

- SDK: **9.0.320**, global.json в корне, `rollForward=latestPatch`,
  `allowPrerelease=false`. Поиск SDK зависит от cwd, поэтому вложенного pin мало.
- Target framework: **net9.0**, AnyCPU, без RID/AOT и собственного CLR.
- Первая версия библиотеки: **0.1.0-alpha.1**, protocol/API version **1**.
- Nullable, implicit usings, deterministic build и warnings-as-errors общие.
- NuGet versions централизованы, packages.lock.json сохраняются; CI использует
  locked restore. Для первого core нет сторонних NuGet/runtime dependencies.
- Unit stack: Microsoft.NET.Test.Sdk **18.11.0**, xunit **2.9.3**,
  xunit.runner.visualstudio **4.0.1**; эти stable версии найдены в NuGet index.
- NuGet audit выполняется для прямых и транзитивных зависимостей; проблемы не
  скрываются исключениями warnings-as-errors.

`@boristype/dotnet-workspace` — private npm wrapper с отдельными именами задач
`build:dotnet`, `test:dotnet`, `pack:dotnet`, `test:dotnet:pack`. Это не публикуемый
пакет DLL и не единая версия всех C# библиотек. Default Turbo build его не запускает:
Node-only разработчикам SDK не требуется. Реальный граф C# задаёт ProjectReference.

## Первая библиотека и граница BS/.NET

Публичный entry point:

```text
BorisType.FileSystem.LibraryInfo.GetMetadataJson() -> string
```

Вызывается без аргументов и Datex context. JSON содержит `id`, `version`,
`apiVersion` и `capabilities`. Начальный `id` равен `BorisType.FileSystem`,
`apiVersion` равен 1, `capabilities` — пустой массив: файловых операций ещё нет.
Version берётся из AssemblyInformationalVersion, API version — из assembly metadata,
сгенерированной MSBuild из свойства `BorisTypeApiVersion`. Git hash автоматически
не приписывается к informational version.

Это пригодный потребителю способ идентифицировать установленную DLL. Пока
MCP его не вызывает; проверка версии при подключении будет частью отдельного этапа.
Возвращается JSON string, а не managed object graph или callback в ядро BS.

## Упаковка

`pack.mjs [--out directory]` публикует только production csproj, читает properties
AssemblyName/Version/TargetFramework/BorisTypeApiVersion через MSBuild и создаёт
`BorisType.FileSystem-0.1.0-alpha.1.zip`. Для ZIP используются штатные MSBuild
ZipDirectory/Unzip tasks, без новой npm runtime dependency.

Archive содержит publish output (DLL, deps.json, portable PDB, XML documentation)
и `manifest.json`. Manifest имеет `schemaVersion=1`, `id`, `version`, `apiVersion`,
`targetFramework`, `entryAssembly` и отсортированный `files` со slash paths,
SHA256 и bytes. Сам manifest не хешируется внутри собственного списка.
Он не содержит credentials, локальные абсолютные пути или timestamp.
ZIP timestamps не являются контрактом byte-for-byte reproducibility.

Pack самостоятельно выполняет locked restore/publish. Временный staging удаляется
в finally. Код CLI не выполняет shell interpolation. В archive не входят tests,
probes, vendor DLL, SDK/CLR или source files. Исправность на HCM не следует из
успешного pack; consumer-facing pack test распаковывает именно готовый archive.

## Probes и vendor references

Существующие PlainProbe, DatexProbe, BS, runner и описание exit 139 переносятся
из `packages/mcp-server/probes/dotnet` в `packages/dotnet/probes`, без изменения
BS источников или C# probe bodies. Меняются пути/import runner и документация.
Исторические runtime reports сохраняют исходные hashes и отмечают перенос.

Default solution включает core, unit tests и PlainProbe. DatexProbe исключён:
для его отдельной сборки нужен `WebsoftReferenceDir` вне репозитория. Vendor
reference остаётся Private=false; он не может быть обязательным для core/CI.
Известный падающий callback остаётся исключённым из автоматического native smoke.
Native runner не запускается в CI и сам не поднимает/перенастраивает стенд.

## Проверки и CI

- Unit test через reflection вызывает настоящий public static entry point по
  полному имени — как это будет делать bridge — и проверяет JSON contract.
- Packaging test запускает реальный CLI, распаковывает ZIP, проверяет полный
  список файлов, manifest hashes/sizes, library identity и отсутствие vendor/test
  artifacts. Не проверять код через grep или подмену dotnet mock-ом.
- Dotnet CI job: Ubuntu и Windows, setup-dotnet по global.json, locked restore,
  build, unit tests, pack test; upload готового ZIP как CI artifact.
- Dependabot получает NuGet entry для workspace.
- Проверить существующие Node build/tests, format, docs links и git diff.
- Default build и pack не требуют HCM. Native rerun для одного переноса путей
  не является условием завершения; остановленный стенд остаётся остановленным.

## Критерий завершения

Из root выполняются `pnpm build:dotnet`, `pnpm test:dotnet`, `pnpm pack:dotnet`,
`pnpm test:dotnet:pack`. Получен installation ZIP с проверенными содержимым и
manifest; SDK, vendor files и bin/obj/dist не попадают в git. Старые probes и
записи об их падении не потеряны. README/ADR/roadmap и команды соответствуют
фактической структуре. Публичный search API этим шагом не обещается.
