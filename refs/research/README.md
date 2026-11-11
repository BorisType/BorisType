# Исследования и первичные данные

Здесь сохранены датированные исследования, исходники проб и результаты из прежнего
`plans/`. Это история проверок и вопросов; формулировка «следующий этап» в старой
записи не является текущим поручением. Актуальные объяснения — в [тематических входах](../README.md).

| Тема                                    | Материалы                                                                                                                         | Текущий смысл                                                                                            |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| MCP: transport, поиск, XQuery и объекты | [Хронология](mcp/README.md), [object model](mcp/10-object-model/README.md)                                                        | Реализованные checkpoints и их ограничения; дальнейшая acceptance не обещана.                            |
| .NET workspace, file API, URL/storage   | [Хронология](dotnet/README.md)                                                                                                    | Сохранены designs, планы и native evidence; текущие основания суммированы в [.NET](../dotnet/README.md). |
| Compiler expressions                    | [Исследование](compiler-semantics/README.md), [checkpoint](compiler-semantics/results/2026-11-05-research-checkpoint.md)          | Research/test этап сохранён; 38 exact XFAIL не исправлены этим переходом; script/module on hold.         |
| Compiler labels/finalizers/for-update   | [Полный отчёт](compiler-control-flow/labeled-statements.md), [C probes](compiler-control-flow/probes/README.md)                   | Реализованный контрольный baseline и отдельно ограниченная ручная C smoke проверка.                      |
| Переносимые skills                      | [Платформа](skills/01-websoft-hcm.md), [MCP/числа](skills/02-mcp-and-numbers.md), [администратор](skills/03-websoft-hcm-admin.md) | Источники, проверки и условия распространения существующих skills.                                       |

Новые исследования не обязаны повторять нумерованную цепочку старых этапов.
Достаточно связной заметки с вопросом, вариантами, результатами, следующим шагом
и критерием завершения. Пробы/manifests/results сохраняются комплектом. Перед повторным
запуском проверить prerequisites и известные crash/hang ограничения.
