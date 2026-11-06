# .NET workspace BorisType

Согласованная структура: `packages/dotnet` содержит самостоятельные C# проекты,
общую solution и настройки. Первая библиотека — `BorisType.FileSystem`.

- [Дизайн первого шага](01-workspace-design.md).
- [План реализации](02-workspace-plan.md).
- [Исследование преобразования x-local URL](03-path-resolution-research.md).
- [Контракт первого поиска](04-search-design.md).
- [План реализации поиска](05-search-plan.md).
- [Результаты поиска и границы проверок](06-search-results.md).
- Предыстория: [инвентаризация HCM](../mcp-server/05-dotnet-search-research.md),
  [собственные DLL и native smoke](../mcp-server/06-dotnet-probe.md),
  [референс wshcmx/net](../mcp-server/07-wshcmx-net-reference.md).

Первый шаг реализован: metadata DLL, build/test/pack, проверка ZIP и CI matrix.
Подробные результаты и границы проверок — в [плане](02-workspace-plan.md#результаты-реализации-и-проверки-2026-11-06).

Следующий этап реализует ограниченный поиск имён и UTF-8 содержимого в DLL,
BS URL resolver и MCP tool. Managed и protocol проверки выполняются вне HCM;
отдельный native e2e также прошёл на Linux HCM 2025.2.1333 / CLR 9.0.11.
Windows и другие версии HCM требуют собственных проверок.
