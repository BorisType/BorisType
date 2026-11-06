# MCP server для WebSoft HCM

`@boristype/mcp-server` — отдельный Node.js пакет с stdio transport. Его сборка
не использует TS → BorisScript compiler. Требуется Node.js >=24.22.2.
Сервер использует MCP TypeScript SDK 2.x (`@modelcontextprotocol/server`);
клиентский пакет подключён только для локальных тестов. Схемы — Zod 4 objects.

В прототипе объявлены шесть tools: `wshcm_read_file`, `wshcm_write_file`,
`wshcm_list_directory`, `wshcm_delete_file`, `wshcm_search_files`, `wshcm_edit_file`.
Все требуют отдельно установленной BorisType.FileSystem DLL 0.1.0-alpha.3 / API 1. Остальные заготовки не публикуются
в `tools/list`. Подключение, CLI/env и конфигурация клиента описаны в
[package README](https://github.com/BorisType/BorisType/blob/main/packages/mcp-server/README.md).

Read/list возвращают tool error при неожиданном типе ответа вместо пустого
файла или каталога. Чтение в DLL строго декодирует UTF-8 и убирает один начальный BOM.
Запись создаёт UTF-8 BOM даже у пустого файла; edit сохраняет исходный BOM.
Это API текстовых файлов: NUL, invalid UTF-8 и файлы больше 1 MiB отвергаются;
legacy encodings не угадываются.

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

`wshcm_search_files` ищет имена по glob, а при query — UTF-8 содержимое построчно.
URL разрешается в BS, обход и сопоставление выполняет C#. Ответ содержит root URL,
relative paths, line/column/text для содержимого, stats, skipped и limitReason.
Полный проход требует нулевых skipped и null limitReason; остальные ответы
явно описывают ограниченный охват.
Финальный JSON ограничен 256 KiB. Отдельный `test:e2e:search` прошёл на Linux
HCM 2025.2.1333 / CLR 9.0.11 через CLI/stdio/SOAP/BS/DLL, включая regex,
quoted path/query и cleanup. Совместимость с другими ОС/версиями остаётся
отдельной проверкой; managed/adapter tests её не доказывают.

После миграции read/write/list/delete на .NET их прежние native e2e также проходят:
28/28 checks, с независимым сравнением байтов и evaluator cleanup. Edit проверен
отдельной командой `test:e2e:edit`. Он применяет до 100 exact oldText/newText пар
в памяти, требуя одно совпадение на каждый edit, затем заменяет файл. dryRun
возвращает preview без записи. Read includeMetadata=true возвращает исходный
SHA256 (BOM included); edit expectedSha256 отвергает устаревший hash.
Ошибка любого patch оставляет файл без частичных изменений. External write race
после последней проверки и ограничения owner/ACL/hardlinks описаны в package README.
