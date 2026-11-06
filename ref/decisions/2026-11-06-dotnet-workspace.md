# Общий .NET workspace с независимыми библиотеками

**Date:** 2026-11-06

**Status:** Accepted

## Context

Для MCP исследуется файловый поиск средствами .NET внутри HCM. Native experiment
подтвердил загрузку собственной standalone DLL; зависимость от Datex не обязательна
для обычной managed логики. Позже могут понадобиться другие C# библиотеки.
Node monorepo использует pnpm/Turbo/Changesets, но у .NET собственный граф сборки
и форматы доставки. Текущие probes находятся внутри MCP и не должны становиться
production runtime dependency.

## Decision

Создать `packages/dotnet` с solution и общими Directory.Build.props /
Directory.Packages.props. Самостоятельные библиотеки размещать в `src/`, тесты
в `tests/`, диагностические эксперименты в `probes/`. Версия и DLL принадлежат
проекту, не всей директории. SDK 9.0.320 закрепляется корневым global.json;
первый target — net9.0, как в исследованном HCM.

Private npm wrapper предоставляет отдельные dotnet commands. Default Turbo
build не требует SDK; .NET проверяется отдельным Windows/Linux CI job.
ProjectReference остаётся источником графа C# dependencies, central package
management и committed lock files — источником NuGet versions.

Первая библиотека `BorisType.FileSystem` начинается с metadata JSON entry point.
Она не зависит от Datex и не содержит search API. Доставка — installation ZIP с
production publish output и manifest files/hashes; публикация registry packages
не является частью этого шага.

## Consequences

Можно добавлять проекты с независимыми версиями, не меняя структуру репозитория.
Для .NET development нужен отдельный SDK, для обычного Node development — нет.
Изменения deploy/API contract требуют синхронизации metadata и manifest.
Сборка/упаковка вне HCM не заменяет native acceptance.

Vendor references остаются вне git, manual DatexProbe — вне solution. Известный
exit 139 при Datex callback сохранён как ограничение эксперимента. Развитие
compiler script/module остаётся замороженным по прежнему memory ADR.

## Alternatives Considered

- Несколько соседних `packages/dotnet-*`: удобно для независимых npm releases,
  но сейчас добавляет повторяющиеся orchestration wrappers без потребителей.
- Корневой `dotnet/`: привычная .NET структура, но расходится с размещением
  компонентов BorisType внутри packages.
- Одна общая DLL для всех будущих функций: связывает unrelated API/версии;
  общая директория не должна диктовать единую assembly.

Детальный [дизайн](../../plans/dotnet/01-workspace-design.md) и
[план](../../plans/dotnet/02-workspace-plan.md).
