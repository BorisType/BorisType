# .NET workspace BorisType

Согласованная структура: `packages/dotnet` содержит самостоятельные C# проекты,
общую solution и настройки. Первая библиотека — `BorisType.FileSystem`.

- [Дизайн первого шага](01-workspace-design.md).
- [План реализации](02-workspace-plan.md).
- [Исследование преобразования x-local URL](03-path-resolution-research.md).
- [Контракт первого поиска](04-search-design.md).
- [План реализации поиска](05-search-plan.md).
- [Результаты поиска и границы проверок](06-search-results.md).
- [Контракт managed file tools и edit](07-file-tools-design.md).
- [План миграции файловых инструментов](08-file-tools-plan.md).
- [Результаты миграции и native edit acceptance](09-file-tools-results.md).
- [Следующие tools, учёт чтений и границы гарантий](10-file-tools-next-steps.md).
- [Контракт учёта чтений и девяти tools](11-read-aware-files-design.md).
- [План реализации учёта чтений](12-read-aware-files-plan.md).
- [Результаты учёта чтений и девяти tools](13-read-aware-files-results.md).
- Предыстория: [инвентаризация HCM](../mcp-server/05-dotnet-search-research.md),
  [собственные DLL и native smoke](../mcp-server/06-dotnet-probe.md),
  [референс wshcmx/net](../mcp-server/07-wshcmx-net-reference.md).

Первый шаг реализован: metadata DLL, build/test/pack, проверка ZIP и CI matrix.
Подробные результаты и границы проверок — в [плане](02-workspace-plan.md#результаты-реализации-и-проверки-2026-11-06).

Следующий этап реализует ограниченный поиск имён и UTF-8 содержимого в DLL,
BS URL resolver и MCP tool. Managed и protocol проверки выполняются вне HCM;
отдельный native e2e также прошёл на Linux HCM 2025.2.1333 / CLR 9.0.11.
Windows и другие версии HCM требуют собственных проверок.

Read/write/list/delete также переведены на DLL alpha.3; добавлен точечный edit
с preview, unique replacements и optional hash precondition. Все шесть tools
прошли native acceptance на том же Linux HCM.

Alpha.4/API 2: девять tools, обязательный read-token для edit/overwrite, line ranges
и bounded per-server grants. Native Linux acceptance прошла; раздельные чаты и
строгий cross-process compare-and-replace не гарантируются.
