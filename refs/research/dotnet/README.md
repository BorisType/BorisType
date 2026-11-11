# .NET: датированные исследования и результаты

Текущее объяснение — [.NET refs](../../dotnet/README.md). Планы реализации и
промежуточные designs сведены в текущие темы; здесь остаются технические данные,
которые нельзя заменить актуальным пересказом.

| Evidence                                                     | Значение                                                                                   | Текущая тема                                               |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| [Datex URL wrapper metadata](03-path-resolution-research.md) | Static PE/CLI tokens/MVID/hash; wrapper не реализует mapping и не был вызван этим анализом | [Bridge](../../dotnet/bridge.md)                           |
| [Первый search](06-search-results.md)                        | Alpha.2/API 1, Linux native/protocol/managed разделены                                     | [Search](../../dotnet/search.md)                           |
| [Managed file migration](09-file-tools-results.md)           | Alpha.3/API 1, BOM/bytes/edit negatives/native                                             | [Files/read grants](../../dotnet/files-and-read-grants.md) |
| [Read-aware nine tools](13-read-aware-files-results.md)      | Alpha.4/API 2, grant chain/rename и independent cleanup                                    | [Files/read grants](../../dotnet/files-and-read-grants.md) |
| [URL schemes](14-path-schemes-research.md)                   | 27+23+3 resolver inputs, managed alias-read; не новые MCP schema inputs                    | [Paths/storage](../../platform/paths-and-storage.md)       |
| [SQL storage routing](15-url-storage-routing-research.md)    | Blob/disk priority/hydration, root config negatives и restored ini hash                    | [Paths/storage](../../platform/paths-and-storage.md)       |

Проверки относятся к Linux HCM 2025.2.1333/CLR 9.0.11, если в самом отчёте
не оговорён иной слой. Windows managed CI не означает Windows HCM acceptance.
Полные vendor runtime/raw logs находятся вне git и нужны отдельно для native
воспроизведения. Собственные probes остаются по прежним относительным путям;
[SDK/pack проверки](../../dotnet/workspace.md) не требуют HCM.
