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
файла или каталога. Чтение явно декодирует UTF-8 и убирает один начальный BOM.
На проверенной C-сборке запись создаёт UTF-8 BOM даже у пустого файла.
Это API текстовых файлов; бинарные данные и legacy encodings не аттестованы.

SOAP requests экранируют пробелы/табуляцию/CR/LF numeric references, чтобы C parser
не удалял завершающие пробелы. Чтение использует JSON carrier для защиты CRLF
от native SOAP serializer. Общий SOAP parser различает строки и числа по
`VALUE-TYPE`, но не восстанавливает информацию, уже потерянную серверным serializer.

`destructiveHint` — аннотация для клиента, не гарантия запроса подтверждения.
Инициализация соединения создаёт временный evaluator на HCM-сервере, в том числе
перед чтением. EOF/SIGINT/SIGTERM выполняют общий cleanup, его ошибка даёт ненулевой
exit code. Частичная инициализация и shutdown во время активного SOAP требуют работы.

Помимо unit/protocol/pack проверок есть отдельная команда `test:e2e` для уже
установленного локального Linux Docker-стенда. Проверены четыре tools через
настоящий CLI/stdio/SOAP на `websoft/hcm:2025.2.1333`, включая Unicode, пробелы,
CRLF, перезапись, удаление и cleanup. Байты файлов проверяются независимо через
Docker. Это evidence одной C-сборки; оно не переносится на JS runtime или другие
версии HCM. Команда, требования и границы описаны в package README.
