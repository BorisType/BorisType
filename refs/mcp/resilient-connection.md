# Доступность MCP при выключенном HCM

Дизайн согласован пользователем 2026-11-18: stdio MCP запускается независимо от
HCM, объявляет инструменты и восстанавливает доступ к стенду при следующем вызове.
Текущий baseline — `fa022038b8cfd840d1cea82cbd2e1a81dcf7af1d` после PR #76.

## Поведение

- При корректной конфигурации initialize, tools/list и MCP ping не выполняют
  запросов к HCM. Состав tools не зависит от его доступности. Фонового polling в первой
  версии нет; следующая явно запрошенная операция сама проверяет готовность.
- У CLI есть стабильный evaluator facade и один WshcmApi на весь процесс.
  Connection recovery не теряет package handles/operation IDs, read grants или
  локальные ZIP. Чисто файловые операции artifact store не требуют доступного HCM.
  Существующий inspectPackage включает native preview/context check и продолжает
  требовать HCM; новый offline preview в этот scope не входит.
- Подготовка HCM объединяется для параллельных вызовов одной общей pending
  promise. Неудачная promise не кэшируется навсегда. Повторный вызов может
  восстановить доступ, включая исчезновение собственного evaluator module.
- Перед отправкой пользовательского BS проверяется собственный evaluator
  безопасным `return 1;`. При отсутствии/неисправности module разрешена одна
  повторная подготовка собственного helper и проверка; пользовательский код
  ещё не отправлен. Метод не выполняет пользовательских scripts как health check.
- HTTP setup/probe имеет отдельный timeout 5000 ms на запрос. Обычный request
  timeout остаётся прежним 30000 ms. `connectionTimeoutMs` в McpServerOptions и
  CLI `--connection-timeout-ms` допускают положительное целое число. Invalid
  config отклоняется до запуска транспорта. Смена credential требует изменения
  конфигурации/обычного перезапуска MCP; login errors не запускают фоновый retry.
- После передачи пользовательского BS происходит ровно один вызов. Ошибка
  транспорта делает соединение требующим проверки, возвращает unknown outcome
  и никогда автоматически не повторяет пользовательскую операцию.
- Нативные script/validation failures не считаются отключением стенда. HTTP
  401/403, недоступный transport/timeout и HTTP service error различаются.
  Существующие SOAP Fault diagnostics сохраняются, включая HTTP 500 SOAP Fault.

## Ошибки и SDK

Доступность HCM — tool execution error с `isError:true`, а не остановка MCP.
Общий carrier содержит `error.code` (`HcmUnavailable` либо
`HcmAuthenticationFailed`), понятное сообщение и `connection` с состоянием,
target host/port/https и retryable. Пароль, Authorization, Cookie и полный
непроверенный HTTP response в diagnostics не попадают. Нельзя терять известные
id, operationId, native status, lastKnownOperation или подтверждённый saved.

Общий SDK получает типизированные request failures и отдельный marker ошибки
evaluator до dispatch. Error wrappers сохраняют cause, чтобы MCP мог распознать
connection failure без разбора текста. Для однократных execute/object operations
доказанный preflight failure означает not_started/not_attempted; после dispatch
исход консервативно unknown. В многошаговой package operation ошибка до очередного
eval не отменяет уже отправленные шаги/receipt. Marker не понижает их статус и
не перезаписывает saved. Старые generic failures остаются unknown.

SDK request options для initialize/callMethod и evaluator setup/probe позволяют
переопределить timeout только данного запроса, не уменьшая timeout обычного BS.
Force reinitialization использует тот же принадлежащий caller module URL:
повторная подготовка не накапливает новые библиотеки при каждом outage.
createConnection/closeConnection сохраняют eager API для существующих callers;
createServer по-прежнему допускает внешний evaluator без собственного network IO.

## Shutdown и проверки

EOF/SIGINT/SIGTERM используют один idempotent shutdown. До первой попытки
подготовки нет удалённого helper и нечего удалять. Начавшуюся подготовку нельзя
потерять при закрытии; новые пользовательские запросы после close запрещены.
Созданный/возможно созданный собственный evaluator учитывается для cleanup;
неподтверждённый cleanup остаётся явным. Shutdown не обещает отмены server BS.

Локальные SDK HTTP, unit lifecycle и CLI/stdio тесты проверяют offline startup,
повторную подготовку, конкуренцию, deadlines, SOAP/auth ошибки, helper repair,
неподтверждённую запись и shutdown до, во время и после setup. SDK и MCP results
сохраняют известные object/execute/package outcomes.

[Native acceptance](../research/mcp/connection-recovery/README.md) использует
Linux C HCM 2025.2.1333 через управляемый loopback proxy. Физическое удаление
своего evaluator проверяется отдельно от возможного code cache. Если cache
сохраняет исполнение, proxy однократно отвечает SOAP Fault на safe probe и
пропускает загрузку и проверку восстановленного файла на реальный HCM.
Runner передаёт CLI закрытый временный каталог ZIP. При недоступности HCM
новый inspect может успеть сохранить копию, чей ID не попадёт в ответ.
Очистка удаляет весь каталог запуска, включая такую копию. Export и preview
не дают права удалять download records по ID из архива.
Source/build hashes, трасса запросов и точная очистка принадлежат этому запуску.
Воспроизведение перезапуска HCM, Windows/MSSQL и нескольких процессов не
входит в этот evidence.

## Основания и установка в клиенты

Это разделение следует [MCP lifecycle](https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle)
и [tool execution errors](https://modelcontextprotocol.io/specification/2025-11-25/server/tools#error-handling).
[MCP ping](https://modelcontextprotocol.io/specification/2025-11-25/basic/utilities/ping)
проверяет MCP counterpart, а не обещает доступность downstream HCM.

[Claude Code](https://code.claude.com/docs/en/mcp#automatic-reconnection)
различает remote retry и stdio startup failure. В interactive stdio failure
может требовать ручного reconnect. [Codex](https://learn.chatgpt.com/docs/extend/mcp?surface=cli)
имеет startup timeout и cached catalog readiness; opt-in lazy stdio startup
добавлен в [PR60039](https://github.com/openai/codex/pull/60039), merged 2026-11-07.
Кэш не заменяет живое соединение для tool call. Source проверен на
`openai/codex@bd3eaf7829187f18d05205222bf2f67c0af80fb4`,
`codex-rs/core/tests/suite/mcp_tool_cache.rs` (cached stdio first-use test).
[VS Code](https://code.visualstudio.com/docs/agents/run/manage-mcp-servers)
исключает error state из editor autostart; harness может иметь свои правила.
[Cursor](https://cursor.com/docs/mcp) документирует failed call/retry без общего
обещания бесконечного перезапуска stdio. Это сведения docs/source, не live tests
этих клиентов. Ссылки проверены 2026-11-18.

Регистрация через CLI клиента или будущий `boristype-mcp install` — отдельный
сценарий. В этой реализации клиентские конфиги не меняются. Исследуются штатные
`codex mcp add`, `claude mcp add`, явные client/scope/name, preview и сохранение
соседних записей; набор поддержанных клиентов ещё не утверждён.
[Варианты регистрации и источники](../research/mcp/connection-recovery/installer-research.md).
