# Исследования и первичные данные

Датированные отчёты сохраняются, когда сами являются основанием вывода: native
observations, source/declaration audits, воспроизводимые контрпримеры и ограничения.
Завершённые process logs и дубли plans/spec/tasks сведены в тематические объяснения.
Старое «проверить далее» не становится текущим поручением автоматически.

| Вопрос                                          | Текущий вывод и исходные данные                                                                                                                                          |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Структура SQL-БД и файлов сервера               | [Карта хранения](../platform/storage-layout.md), [срез 2026-11-11 и collectors](platform-storage/README.md): документы, каталоги, blobs, форматы и FT                    |
| MCP transport/XQuery/XML                        | [MCP](../mcp/README.md), [датированные evidence](mcp/README.md), [object model комплект](mcp/10-object-model/README.md)                                                  |
| .NET bridge/files/search                        | [.NET](../dotnet/README.md), [native отчёты](dotnet/README.md)                                                                                                           |
| URL roots и disk/blob routing                   | [Платформенные пути](../platform/paths-and-storage.md), ссылки на отдельные версии runtime и probes внутри                                                               |
| Compiler expressions                            | [Checkpoint](compiler-semantics/README.md), [контрпримеры и кандидаты](compiler-semantics/expression-evaluation.md), [границы исследования](compiler-semantics/scope.md) |
| Labels/finalizers/for-update                    | [Алгоритм](../compiler/control-flow.md), [датированные результаты](compiler-control-flow/2026-10-07-results.md), [C probes](compiler-control-flow/probes/README.md)      |
| Skills: почему такие инструкции и чем проверены | [Платформенный справочник](../platform/agent-skills.md), [пользовательский каталог](../../skills/README.md)                                                              |

Неудачные альтернативы и known XFAIL сохраняются вместе с выводом. Пробы,
manifests, transcripts и cleanup receipts идут комплектом; raw bytes не
форматируются при правке прозы. [Правила evidence](../development.md) различают
документацию, declarations, статический source audit, JS/mock, managed и native.
Для повтора проверить prerequisites и crash/hang ограничения. Локальная проверка
сохранённых результатов не является повторным native запуском.
