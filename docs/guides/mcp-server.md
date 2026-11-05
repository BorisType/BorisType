# MCP server для WebSoft HCM

`@boristype/mcp-server` — отдельный Node.js пакет с stdio transport. Его сборка
не использует TS → BorisScript compiler. Требуется Node.js >=24.22.2.
Сервер использует MCP TypeScript SDK 2.x (`@modelcontextprotocol/server`);
клиентский пакет подключён только для локальных тестов. Схемы — Zod 4 objects.

В прототипе объявлены четыре tools: `wshcm_read_file`, `wshcm_write_file`,
`wshcm_list_directory`, `wshcm_delete_file`. Остальные заготовки не публикуются
в `tools/list`. Подключение, CLI/env и конфигурация клиента описаны в
[package README](https://github.com/BorisType/BorisType/blob/main/packages/mcp-server/README.md).

Read/list возвращают tool error при неожиданном типе ответа вместо пустого
файла или каталога. SOAP string values сохраняют whitespace и строки, похожие
на числа; integer/real/bool разбираются по `VALUE-TYPE`.

`destructiveHint` — аннотация для клиента, не гарантия запроса подтверждения.
Инициализация соединения создаёт временный evaluator на HCM-сервере, в том числе
перед чтением. Проверки допустимых путей и полный lifecycle ещё требуют работы.

Текущий maintenance checkpoint подтверждает сборку, упаковку и локальный MCP
protocol с test doubles. Он не подтверждает native работу с файловой системой,
кодировки или права на конкретной версии HCM.
