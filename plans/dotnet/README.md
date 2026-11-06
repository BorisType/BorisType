# .NET workspace BorisType

Согласованная структура: `packages/dotnet` содержит самостоятельные C# проекты,
общую solution и настройки. Первая библиотека — `BorisType.FileSystem`.

- [Дизайн первого шага](01-workspace-design.md).
- [План реализации](02-workspace-plan.md).
- [Исследование преобразования x-local URL](03-path-resolution-research.md).
- Предыстория: [инвентаризация HCM](../mcp-server/05-dotnet-search-research.md),
  [собственные DLL и native smoke](../mcp-server/06-dotnet-probe.md),
  [референс wshcmx/net](../mcp-server/07-wshcmx-net-reference.md).

Первый шаг реализован: metadata DLL, build/test/pack, проверка ZIP и CI matrix.
Подробные результаты и границы проверок — в [плане](02-workspace-plan.md#результаты-реализации-и-проверки-2026-11-06).

Следующий самостоятельный этап после workspace — контракт ограниченного
файлового поиска. Функции поиска этим шагом не реализуются.
