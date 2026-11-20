# MCP: устройство, решения и проверки

Пользовательский вход — [гайд](../../docs/guides/mcp-server.md), точный контракт —
[README пакета](../../packages/mcp-server/README.md) и schemas tools. Текущий
сервер предоставляет девять физических file tools, XQuery, шесть tools для форм и объектов,
запуск агентов, execute/system info/runtime status и десять tools пакетов объектов. Общий [SDK/runtime](../dotnet/managed-runtime.md) владеет
платформенной логикой; MCP — адаптер.
Node tsc/BS resources независимы от TS→BS compiler и script/module ABI.

[Пакеты объектов](object-packages.md): реализованные схемы/export/inspect/import/status,
immutable артефакты и точные границы native acceptance; общий SDK владеет
операциями, MCP предоставляет десять адаптеров.

| Вопрос                                                                    | Текущие основания                                       | Датированное evidence                                                                                                                          |
| ------------------------------------------------------------------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Где регистрировать tool, как упакованы resources, кто закрывает evaluator | [Transport/lifecycle](transport-and-lifecycle.md)       | [Первый native file e2e](../research/mcp/04-local-e2e.md), [checkpoint](../research/mcp/08-filesystem-checkpoint.md)                           |
| Как stdio восстанавливает HCM доступ в том же процессе                    | [Восстановление HCM](resilient-connection.md)           | [Native proxy acceptance](../research/mcp/connection-recovery/README.md)                                                                       |
| Почему BS resolver + standalone JSON DLL                                  | [.NET bridge](../dotnet/bridge.md)                      | [Callback crash, причина неизвестна](../research/mcp/06-dotnet-probe.md)                                                                       |
| Как token подтверждает выданные диапазоны, почему hash не CAS             | [Files/read grants](../dotnet/files-and-read-grants.md) | [Alpha.4/API 2 native](../research/dotnet/13-read-aware-files-results.md)                                                                      |
| Что означает пустая/усечённая search выдача                               | [Bounded search](../dotnet/search.md)                   | [First search](../research/dotnet/06-search-results.md)                                                                                        |
| Почему disk edit не меняет SQL blob                                       | [Paths/storage](../platform/paths-and-storage.md)       | [Routing/hydration](../research/dotnet/15-url-storage-routing-research.md)                                                                     |
| Где теряются SQL signed/NULL значения и exact ID                          | [XQuery и typed SOAP](xquery.md)                        | [Linux C/PostgreSQL observations](../research/mcp/09-xquery-native.md)                                                                         |
| Откуда берутся сведения о стенде и почему конфигурации пока текстом       | [System info](system-info.md)                           | [Native UI/SOAP и acceptance](system-info.md#native-проверка-2026-11-17)                                                                       |
| Как работают сохранённые схемы, immutable ZIP и import/status             | [Пакеты объектов](object-packages.md)                   | [Native CLI/stdio receipt](../research/mcp/object-packages-mcp-2026-11-17.json)                                                                |
| Почему XML whole replace и какие negatives проверяются до Save            | [XML object tools](xml-objects.md)                      | [Product checkpoint](../research/mcp/10-object-model/first-implementation.md), [probe bundle](../research/mcp/10-object-model/README.md)       |
| Как работают partial XML, повторы без Save и Date wall time               | [XML patch](xml-object-patch.md)                        | [Native SDK receipt](../research/mcp/object-patch/acceptance.json), [native stdio receipt](../research/mcp/object-patch/stdio-acceptance.json) |
| Что Save делает относительно XMD/XMS/UI/claims                            | [Object model/lifecycle](../platform/object-model.md)   | [XMS source audit](../research/mcp/10-object-model/xms-and-business-logic.md)                                                                  |

Серверный BorisScript: [execution, диагностика и неизвестный исход](execution.md),
[native timeout acceptance](execution.md#native-проверка-2026-11-17) и
[запуск существующего агента](execution.md#запуск-существующего-серверного-агента).

## Проверять изменённый слой

Команды — из [package scripts](../../packages/mcp-server/package.json).
После build `pnpm --filter @boristype/mcp-server test` проверяет локальный
protocol/state/XML/templates, `test:pack` — настоящий tarball с workspace deps.
VM doubles не являются C-runtime acceptance. Отдельные `test:e2e*` требуют
подготовленного эксклюзивного Linux Docker stand, credentials и net9 host с правами
на автоматическую подготовку DLL для files/search; обычный test их не запускает.

Историческая native acceptance: Linux HCM 2025.2.1333/CLR 9.0.11/PostgreSQL.
Windows HCM/MSSQL/все типы/полные бизнес-сценарии ею не подтверждаются.
Timeout не отменяет server code; Save error/lost response не доказывает
отсутствие изменений. Tokens относятся к MCP instance, не гарантированной
изоляции чатов. Compare-before-rename/Save не является external atomic CAS.

Локальная проверка записанного evidence, **без HCM**:

```sh
node refs/research/mcp/10-object-model/probes/verify-results.mjs refs/research/mcp/10-object-model/observed
node refs/research/mcp/10-object-model/probes/verify-xml-results.mjs
```

Verifier проверяет observations/hashes/cleanup receipts, не переаттестовывает
текущий product head. Остальные сохранённые источники — в
[research entry](../research/mcp/README.md). При добавлении tool определить
storage, effects, limits, error/timeout outcome и проверять соответствующий слой.
