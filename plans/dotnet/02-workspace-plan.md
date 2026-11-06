# .NET Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Execute inline in the current feature branch; preserve existing research and the user's untracked `.agents/`. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Оформить самостоятельный .NET workspace с первой DLL, unit tests и проверенным installation ZIP.

**Architecture:** `packages/dotnet` объединяет независимые C# проекты через MSBuild solution. Private npm wrapper даёт отдельные команды; production pack не зависит от probes или Datex. Первая библиотека предоставляет только metadata JSON, без файлового поиска.

**Tech Stack:** .NET SDK 9.0.320, net9.0, MSBuild, Node 24, pnpm 12, xUnit.

**Spec:** [01-workspace-design.md](01-workspace-design.md).

## Global Constraints

- SDK 9.0.320, global.json `rollForward=latestPatch`, `allowPrerelease=false`.
- Target framework net9.0, AnyCPU, без RID/AOT и собственного CLR.
- Library version 0.1.0-alpha.1; protocol/API version 1.
- Microsoft.NET.Test.Sdk 18.11.0, xunit 2.9.3, xunit.runner.visualstudio 4.0.1.
- Private wrapper `@boristype/dotnet-workspace`; отдельные dotnet task names.
- No Datex/NuGet runtime references in core. DatexProbe outside default solution.
- Native stand остаётся остановленным; падающий callback не исполняется.
- SDK/vendor/bin/obj/dist не коммитятся. Заморозка script/module сохраняется.

## Task 1: Workspace, public metadata ABI и unit check

**Files:**

- Create: `global.json`, `packages/dotnet/package.json`, `BorisType.DotNet.slnx`,
  `Directory.Build.props`, `Directory.Packages.props` внутри `packages/dotnet`.
- Create: `packages/dotnet/src/BorisType.FileSystem/BorisType.FileSystem.csproj`,
  `LibraryInfo.cs` и `packages.lock.json`.
- Create: `packages/dotnet/tests/BorisType.FileSystem.Tests/BorisType.FileSystem.Tests.csproj`,
  `LibraryInfoTests.cs` и `packages.lock.json`.
- Modify: root `package.json`, `pnpm-lock.yaml`, `.gitignore`, `.prettierignore`.

**Interfaces:**

- Consumes: установленный SDK и согласованный JSON metadata contract.
- Produces: `BorisType.FileSystem.LibraryInfo.GetMetadataJson() -> string`,
  root commands `build:dotnet` / `test:dotnet` и locked solution restore.

- [x] Создать project/config scaffold без production methods. Common props:

```xml
<Project>
  <PropertyGroup>
    <TargetFramework>net9.0</TargetFramework>
    <Nullable>enable</Nullable>
    <ImplicitUsings>enable</ImplicitUsings>
    <TreatWarningsAsErrors>true</TreatWarningsAsErrors>
    <Deterministic>true</Deterministic>
    <RestorePackagesWithLockFile>true</RestorePackagesWithLockFile>
    <NuGetAuditMode>all</NuGetAuditMode>
    <IncludeSourceRevisionInInformationalVersion>false</IncludeSourceRevisionInInformationalVersion>
  </PropertyGroup>
</Project>
```

Core csproj устанавливает AssemblyName, Version, GenerateDocumentationFile и
`BorisTypeApiVersion=1`, генерирует `AssemblyMetadata` с ключом `BorisType.ApiVersion`.
Tests project имеет IsTestProject=true/IsPackable=false, три PackageReference
без Version и ProjectReference к core. Solution изначально содержит оба проекта.
Wrapper scripts вызывают dotnet из cwd `packages/dotnet`; root forwards через pnpm filter.
В git/prettier ignores добавить `**/bin/`, `**/obj/`.

- [x] Добавить тест реального строкового ABI, не требующий production C# symbol:

```csharp
using System.Reflection;
using System.Text.Json;
using Xunit;

namespace BorisType.FileSystem.Tests;

public class LibraryInfoTests
{
    [Fact]
    public void Metadata_entry_point_is_callable_without_a_platform_context()
    {
        Assembly assembly = Assembly.Load("BorisType.FileSystem");
        Type? type = assembly.GetType("BorisType.FileSystem.LibraryInfo");
        Assert.NotNull(type);
        MethodInfo? method = type.GetMethod("GetMetadataJson", BindingFlags.Public | BindingFlags.Static,
            null, Type.EmptyTypes, null);
        Assert.NotNull(method);
        Assert.Equal(typeof(string), method.ReturnType);
        string json = Assert.IsType<string>(method.Invoke(null, null));
        using JsonDocument document = JsonDocument.Parse(json);
        JsonElement root = document.RootElement;
        Assert.Equal("BorisType.FileSystem", root.GetProperty("id").GetString());
        Assert.Equal(1, root.GetProperty("apiVersion").GetInt32());
        Assert.Matches(@"^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$", root.GetProperty("version").GetString()!);
        Assert.Empty(root.GetProperty("capabilities").EnumerateArray());
    }
}
```

- [x] Запустить `dotnet test packages/dotnet/BorisType.DotNet.slnx -c Release`;
      увидеть assertion failure отсутствующего public типа, исправить только scaffold,
      если вместо этого есть инфраструктурная ошибка.
- [x] Реализовать production entry point:

```csharp
using System.Globalization;
using System.Reflection;
using System.Text.Json;

namespace BorisType.FileSystem;

/// <summary>Identifies the installed library and the operations it exposes.</summary>
public static class LibraryInfo
{
    /// <summary>Returns metadata as JSON text without requiring a WebSoft context.</summary>
    public static string GetMetadataJson()
    {
        Assembly assembly = typeof(LibraryInfo).Assembly;
        string version = assembly.GetCustomAttribute<AssemblyInformationalVersionAttribute>()!.InformationalVersion;
        string apiVersion = assembly.GetCustomAttributes<AssemblyMetadataAttribute>()
            .Single(item => item.Key == "BorisType.ApiVersion").Value!;
        return JsonSerializer.Serialize(new
        {
            id = assembly.GetName().Name,
            version,
            apiVersion = int.Parse(apiVersion, CultureInfo.InvariantCulture),
            capabilities = Array.Empty<string>(),
        });
    }
}
```

- [x] Восстановить packages.lock.json, повторить unit test до PASS и проверить
      `dotnet restore ... --locked-mode`; `pnpm install --lockfile-only --ignore-scripts`.

## Task 2: Проверенный deployment archive

**Files:**

- Create: `packages/dotnet/tools/pack.mjs`, `tools/Archive.proj`, `test/pack.test.mjs`.
- Modify: scripts в private wrapper и root package.json.

**Interfaces:**

- Consumes: core csproj из Task 1 и properties AssemblyName/Version/TargetFramework/BorisTypeApiVersion.
- Produces: `pack.mjs [--out directory]`, ZIP и manifest schemaVersion 1.

- [x] Добавить Node integration test, запускающий настоящий пока отсутствующий CLI:

```js
const result = spawnSync(process.execPath, [packScript, "--out", outputDirectory], {
  encoding: "utf8",
  timeout: 120_000,
});
assert.equal(result.status, 0, result.stderr + result.stdout);
const { archive } = JSON.parse(result.stdout);
assert.match(path.basename(archive), /^BorisType\.FileSystem-\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?\.zip$/);
```

Test создаёт output/extract directories через mkdtemp и чистит их в finally.
Для распаковки вызывает `dotnet msbuild tools/Archive.proj -target:Extract` с
ArchiveFile/ExtractDirectory. Проверяет identity/apiVersion/targetFramework,
entryAssembly, отсутствие Test/Probe/Datex DLL и совпадение extracted file set
с manifest.files. Для каждого файла проверяет bytes и независимый SHA256.

- [x] Запустить `node --test packages/dotnet/test/pack.test.mjs` и увидеть
      FAIL при отсутствующем CLI (реальный process exit, не mock).
- [x] Создать штатный архиватор:

```xml
<Project DefaultTargets="Create">
  <Target Name="Create">
    <ZipDirectory SourceDirectory="$(SourceDirectory)" DestinationFile="$(ArchiveFile)" Overwrite="true" />
  </Target>
  <Target Name="Extract">
    <Unzip SourceFiles="$(ArchiveFile)" DestinationFolder="$(ExtractDirectory)" />
  </Target>
</Project>
```

- [x] Реализовать pack CLI с Node builtins fs/path/os/crypto/child_process:
      проверить только ноль args или `--out directory`; root вычислить из import.meta.url;
      query/publish/zip вызывать execFileSync без shell с timeout 120000 ms.
      Query: `dotnet msbuild <core.csproj> -getProperty:AssemblyName,Version,TargetFramework,BorisTypeApiVersion -nologo`.
      Publish: `dotnet publish <core.csproj> -c Release -p:RestoreLockedMode=true -o <staging>`.
      Вывести properties в manifest следующего вида:

```js
const manifest = {
  schemaVersion: 1,
  id: properties.AssemblyName,
  version: properties.Version,
  apiVersion: Number(properties.BorisTypeApiVersion),
  targetFramework: properties.TargetFramework,
  entryAssembly: `${properties.AssemblyName}.dll`,
  files: entries.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)),
};
```

`entries` формируются рекурсивным обходом publish output: `{path, bytes, sha256}`,
path с `/`, bytes и hash от реальных bytes. Затем записать manifest.json, создать
ZIP через Archive.proj и напечатать одну JSON строку `{archive}` в stdout.
Успешный вывод dotnet остаётся в capture; при ошибке печатать диагностику в stderr
и завершаться ненулевым кодом. Staging удаляется в finally.

- [x] Повторить integration test до PASS, затем root `pnpm pack:dotnet` и
      `pnpm test:dotnet:pack`; не публиковать NuGet/npm package.

## Task 3: Перенос probes, CI, документация и итоговая проверка

**Files:**

- Move: `packages/mcp-server/probes/dotnet` → `packages/dotnet/probes`.
- Modify: `probes/run.mjs` import к `../../ws-client/build/index.js`, README paths,
  slnx (добавить PlainProbe), lock files, `.github/dependabot.yml`.
- Create: `.github/workflows/dotnet.yml`, `packages/dotnet/README.md`,
  `ref/decisions/2026-11-06-dotnet-workspace.md`.
- Modify: `README.md`, `ROADMAP.md`, `ref/architecture/monorepo.md`,
  `plans/mcp-server/06-dotnet-probe.md`, `plans/mcp-server/README.md`, plans/dotnet README.

**Interfaces:**

- Consumes: build/test/pack commands из Tasks 1–2.
- Produces: Windows/Linux CI, ручные probes по новому пути, документированный workspace.

- [x] Перенести свои untracked probe files, сохранив C#/BS contents; убрать из
      проектов дубли общих props. DatexProbe не добавлять в slnx. Обновить ссылки
      старых runtime reports, сохранив historical hashes и 19/19 как исторический результат.
- [x] CI matrix ubuntu-latest/windows-latest, setup-dotnet по root global.json;
      pinned actions совпадают с доступными commit SHA. Выполнять locked restore,
      build --no-restore, test --no-build, Node pack integration test и pack archive.
      Setup Node по .node-version; pnpm для .NET job не обязателен, wrapper не вызывается.
      Upload ZIP через actions/upload-artifact; добавить NuGet Dependabot entry
      `/packages/dotnet`, weekly/cooldown 14 дней.
- [x] Документировать root commands, metadata ABI, доставку ZIP, vendor refs,
      различие SDK/CLR, будущие независимые проекты и отсутствие search API.
      ADR фиксирует согласованную структуру; roadmap отмечает workspace и отдельный search этап.
- [x] Проверить fresh locked restore, build, unit tests, pack test и ZIP.
      Отдельно собрать DatexProbe с уже существующим внешним reference dir; не запускать.
- [x] Запустить существующие Node build/unit tests, format, lint, docs build и
      локальные ссылки; проверить отсутствие vendor/generated files в git и diff --check.
- [x] Сверить каждый критерий spec, обновить progress/verification в плане и
      сохранить работу в текущей feature branch. Remote publishing отдельной командой не выполнять.

## Проверка плана

Все требования design покрыты Tasks 1–3; первый core остаётся metadata-only.
Source proof и runtime evidence разделены, новых native executions не требуется.

## Результаты реализации и проверки (2026-11-06)

- Tasks 1–3 выполнены в `feat/mcp-server`; remote publishing не выполнялся.
- TDD: metadata test сначала упал на отсутствии public типа, pack integration
  test — на отсутствии настоящего CLI. После реализации оба прошли.
- SDK 9.0.320 установлен вне репозитория. Локальные managed tests выполнялись
  на CLR 9.0.22; исторические native результаты относятся к HCM CLR 9.0.11.
- Принудительный locked restore solution (`--locked-mode --force`) прошёл.
  Root `build:dotnet`, `test:dotnet` (1/1), `test:dotnet:pack` (1/1) и
  `pack:dotnet` завершились успешно. Сборка: 0 warnings/errors.
- ZIP `BorisType.FileSystem-0.1.0-alpha.1.zip` распакован integration test:
  DLL, deps.json, PDB, XML documentation, manifest; размеры и SHA256 совпали.
- При review найдено разделение MSBuild property values по запятой/`;`.
  Regression test с output `output space,semi;literal%20` сначала подтвердил
  MSB1006; после MSBuild escaping прошёл. Готовый ZIP проверяется по запрошенному
  пути, затем копируется для независимой распаковки. Повторный review без замечаний.
- DatexProbe отдельно собран с внешней reference directory, 0 warnings/errors.
  Vendor DLL не включена в output. Native runtime повторно не запускался.
- Перенесённый runner прошёл syntax check; без explicit environment завершается
  до обращения к Docker/HCM. Стенд остаётся остановленным.
- Node: Turbo build 15/15 (cache), bt-ir 61/61, ws-client 19/19,
  mcp-server 38/38, eslint-plugin 5/5; MCP tarball smoke и syncpack прошли.
- ESLint: 0 errors, 45 прежних warnings. Docs build и полный format check прошли.
  Генерируемые NuGet lock files исключены из Prettier, как pnpm lockfile.
- Проверка новых локальных Markdown links успешна; в изменённых документах есть
  четыре прежние битые ссылки, не относящиеся к .NET workspace.
- Windows/Linux matrix добавлена в CI. Локально проверен Linux; результат
  Windows CI до запуска workflow не заявляется.

Особенность pnpm: после добавления workspace `install --lockfile-only` не
обновил локальный workspace state. `pnpm install --frozen-lockfile --ignore-scripts`
восстановил его без изменения dependency policy. pnpm lockfile не потребовал diff.
