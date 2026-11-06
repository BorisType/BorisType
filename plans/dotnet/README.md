# .NET workspace BorisType

Согласованная структура: `packages/dotnet` содержит самостоятельные C# проекты,
общую solution и настройки. Первая библиотека — `BorisType.FileSystem`.

- [Дизайн первого шага](01-workspace-design.md).
- [План реализации](02-workspace-plan.md).
- Предыстория: [инвентаризация HCM](../mcp-server/05-dotnet-search-research.md),
  [собственные DLL и native smoke](../mcp-server/06-dotnet-probe.md),
  [референс wshcmx/net](../mcp-server/07-wshcmx-net-reference.md).

Следующий самостоятельный этап после workspace — контракт ограниченного
файлового поиска. Функции поиска этим шагом не реализуются.
