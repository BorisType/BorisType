# C# библиотеки и граница WebSoft HCM

Пользовательская установка — [гайд](../../docs/guides/dotnet.md), команды сборки
и упаковки — [workspace README](../../packages/dotnet/README.md).
`packages/dotnet` — одна solution с самостоятельными библиотеками и test projects;
первая DLL — BorisType.FileSystem. Это не требование складывать все будущие функции
в одну assembly. [Решение workspace](../decisions/2026-11-06-dotnet-workspace.md).

## Устройство и основания

- [src](../../packages/dotnet/src/): библиотеки, [tests](../../packages/dotnet/tests/):
  managed tests, [tools](../../packages/dotnet/tools/): упаковка ZIP и manifest.
  Версия библиотеки задаётся в её `.csproj`, NuGet versions — в
  [Directory.Packages.props](../../packages/dotnet/Directory.Packages.props).
- SDK из [global.json](../../global.json) нужен разработчику. Target framework,
  SDK сборки и CLR внутри HCM — разные параметры; установка DLL не обновляет HCM.
  Обычная Node-сборка не требует SDK и не запускает .NET-команды автоматически.
- **Standalone ABI:** BS разрешает URL и вызывает unique static method с JSON
  strings. Внутри FileSystem нет Datex dependency. Это отделяет физическую FS
  от платформенных ресурсов и избегает исследованного native callback crash.
  [Boundary](../decisions/2026-11-06-dotnet-search-boundary.md),
  [probe evidence](../research/mcp/06-dotnet-probe.md).
- **Portable search:** grep executable не предполагается, traversal/matching/limits
  выполняются managed кодом. Strict UTF-8, skipped counters, regex и output budgets
  делают неполную выдачу явной. Cooperative deadline не прерывает зависший syscall.
- **File mutation:** temp sibling, flush и rename уменьшают риск частичной записи,
  но не гарантируют external CAS, owner/ACL/inode preservation или VFS semantics.
  Move без overwrite использует OS-specific no-replace rename без copy/delete fallback.
  [File tools decision](../decisions/2026-11-06-managed-file-tools.md).
- **Read policy:** DLL проверяет bytes и интервалы, но не хранит MCP sessions.
  Состояние выданных чтений принадлежит MCP instance. [Read grants](../decisions/2026-11-06-read-aware-file-tools.md).

## Работа с workspace

Из корня checkout после установки SDK:

```sh
pnpm build:dotnet
pnpm test:dotnet
pnpm pack:dotnet
pnpm test:dotnet:pack
```

Locked restore и hashes installation ZIP обеспечивают определённый состав сборки,
но не доказывают совместимость host ABI. Для новой библиотеки добавляются отдельные
проект, tests и запись solution; дополнительные пустые adapters без потребителя
не создаются. Vendor assemblies включаются только при конкретной необходимости
и с понятными условиями получения; полный CLR/SDK в пакет не входит.

Managed tests проверяют реальные временные файлы; pack tests — состав и manifest.
Native execution проверяет другую границу: загрузку assembly, resolver, reflection
и работу внутри HCM. Windows managed CI не является Windows HCM acceptance.
Первая загрузка собственной DLL без рестарта проверялась; hot replacement загруженной
assembly не подтверждён. До отдельного исследования обновление планируется с restart.

## Как дойти до первичных данных

- [Metadata/workspace и проверки](../research/dotnet/02-workspace-plan.md).
- [Поиск: контракт](../research/dotnet/04-search-design.md), [native результаты](../research/dotnet/06-search-results.md).
- [File/edit: результаты](../research/dotnet/09-file-tools-results.md).
- [API 2/read ranges: контракт](../research/dotnet/11-read-aware-files-design.md),
  [результаты](../research/dotnet/13-read-aware-files-results.md).
- [Native probes и известный callback crash](../../packages/dotnet/probes/README.md).
- [Исследование платформенных URL](../research/dotnet/14-path-schemes-research.md).

Эти записи датированы. Числа, hashes и версии в них относятся к конкретным сборкам;
они не становятся evidence новой сборки после переноса файлов. Известные последующие
задачи перечисляются в [TODO](../../TODO.md), не в ещё одном конкурирующем плане.
