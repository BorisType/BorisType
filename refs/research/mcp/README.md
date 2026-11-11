# MCP: сохранённые технические основания

Текущие решения и маршруты изменения — в [MCP refs](../../mcp/README.md).
Ниже датированные evidence, а не конкурирующий implementation plan. Их версии,
hashes и acceptance относятся к указанным сборкам/carriers. Повторного HCM
запуска при документационной миграции не было.

| Вопрос                                                        | Сохранённое исследование                        | Текущий вывод                                                                           |
| ------------------------------------------------------------- | ----------------------------------------------- | --------------------------------------------------------------------------------------- |
| Какие поколения dependencies были пропущены                   | [Audit 2026-11-05](03-dependency-review.md)     | [Transport/dependencies](../../mcp/transport-and-lifecycle.md)                          |
| Как нашли SOAP whitespace/CRLF/UTF-8 и evaluator EOF проблемы | [First native e2e](04-local-e2e.md)             | [Transport/lifecycle](../../mcp/transport-and-lifecycle.md)                             |
| Что было в поставке HCM и .NET логах                          | [Inventory](05-dotnet-search-research.md)       | [Bridge](../../dotnet/bridge.md)                                                        |
| Что доказал static ABI и что падало в callback                | [Native DLL probe](06-dotnet-probe.md)          | [Crash scope](../../dotnet/bridge.md)                                                   |
| Чем отличается чужой main от release ABI                      | [wshcmx/net audit](07-wshcmx-net-reference.md)  | [Dependency boundary](../../dotnet/bridge.md)                                           |
| Как был завершён физический filesystem MCP                    | [Merge checkpoint](08-filesystem-checkpoint.md) | [Files/grants](../../dotnet/files-and-read-grants.md)                                   |
| SQL/BS числа, Unicode и bounded XQuery                        | [Native XQuery](09-xquery-native.md)            | [XQuery semantics](../../mcp/xquery.md)                                                 |
| XML schema/data/lifecycle/whole replace                       | [Object bundle](10-object-model/README.md)      | [XML tools](../../mcp/xml-objects.md), [platform model](../../platform/object-model.md) |

Superseded plans удалены после извлечения альтернатив, constraints и findings
в указанные темы. Native/static reports сохранены с provenance; package scripts
и публичные schemas определяют текущие команды/контракт. Saved verifiers не
открывают сервер и не доказывают новую acceptance.
