# Независимые DLL: сборка, metadata и упаковка

`packages/dotnet` объединяет независимые C# проекты общей solution, SDK и
настройками сборки. У каждой библиотеки свой `.csproj`, assembly, зависимости
и версия. Первая — `BorisType.FileSystem`; будущие библиотеки не обязаны
становиться её модулями. [Принятое решение](../decisions/2026-11-06-dotnet-workspace.md).

SDK выбирается из [global.json](../../global.json), target framework — из
[Directory.Build.props](../../packages/dotnet/Directory.Build.props), NuGet
versions — из [Directory.Packages.props](../../packages/dotnet/Directory.Packages.props).
SDK разработчика, target framework DLL и CLR работающего HCM — разные параметры.
Node-only сборка не вызывает .NET workspace: private npm wrapper предоставляет
отдельные задачи, а C# project graph определяется `ProjectReference`/solution.

## Идентичность установленной библиотеки

`BorisType.FileSystem.LibraryInfo.GetMetadataJson() -> string` доступен без
Datex context. JSON содержит `id`, `version`, `apiVersion`, `capabilities`.
Version берётся из AssemblyInformationalVersion, API — из MSBuild-generated
assembly metadata `BorisType.ApiVersion`; git revision автоматически к версии
не добавляется. Сверять следует metadata фактически установленной DLL,
[csproj](../../packages/dotnet/src/BorisType.FileSystem/BorisType.FileSystem.csproj)
и [LibraryInfo](../../packages/dotnet/src/BorisType.FileSystem/LibraryInfo.cs).

Текущий исходный контракт — **0.1.0-alpha.4 / API 2**, capabilities
`search/files/edit/read-ranges/read-preconditions/mkdir/info/move`.
Alpha.1/API 1 была metadata-only, alpha.2 добавила search, alpha.3 — files/edit.
Это промежуточные состояния, а не поддерживаемые альтернативные настройки:
MCP и DLL при переходе на API 2 обновляются вместе. Версия npm MCP не является
версией DLL. Успешный pack не подтверждает ABI установленного HCM.

## Production archive

[pack.mjs](../../packages/dotnet/tools/pack.mjs) получает AssemblyName, Version,
TargetFramework и BorisTypeApiVersion через MSBuild, выполняет locked
restore/publish и архивирует publish output штатной задачей MSBuild ZipDirectory.
Новой npm runtime dependency для ZIP не требуется. Archive содержит DLL,
deps.json, portable PDB, XML documentation и manifest; tests/probes, vendor
assemblies, SDK/CLR и source в production ZIP не входят.

Manifest schema 1 содержит identity/API/target/entryAssembly и отсортированный
список `{path,bytes,sha256}` с slash paths. Manifest не хеширует сам себя;
credentials, локальные абсолютные пути и timestamp в него не входят.
ZIP timestamps не обещают побайтовую воспроизводимость самого архива.
Temporary staging удаляется в finally. Параметры процессов передаются без shell
interpolation; MSBuild property escaping требуется также для запятых/`;`/`%`
в output path: такой путь воспроизводил MSB1006 до исправления.

## Проверки и границы

Из корня checkout с доступным SDK:

```sh
pnpm build:dotnet
pnpm test:dotnet
pnpm pack:dotnet
pnpm test:dotnet:pack
```

Managed tests проверяют reflection string ABI и настоящую временную ФС.
Consumer-facing pack test вызывает реальный CLI, распаковывает фактический ZIP,
сверяет состав, identity, bytes/hashes и сложный output path. Mock dotnet либо
поиск строк в packer не доказывали бы пригодность artifact.
[CI](../../.github/workflows/dotnet.yml) выполняет managed/build/pack на Ubuntu
и Windows; это **не Windows HCM acceptance**. Исторический результат этой
матрицы для `a399e44` сохранён в [checkpoint](../research/mcp/08-filesystem-checkpoint.md).

Default solution не требует vendor reference. DatexProbe собирается отдельно
с `WebsoftReferenceDir`, `Private=false`; vendor DLL не копируется в output.
[Ручные probes](../../packages/dotnet/probes/README.md) не входят в CI и не
поднимают stand. Первоначальная локальная managed проверка 2026-11-06 шла на
CLR 9.0.22; native bridge — на HCM CLR 9.0.11. Она не повторялась при миграции
документации. Build/pack/lock hashes не решают host ABI, hot replacement или
совместимость сторонних dependencies: это отдельные проверки целевого HCM.
