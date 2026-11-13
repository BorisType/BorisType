# MCP server для WebSoft HCM

`@boristype/mcp-server` — Node.js >=24.22.2, stdio transport, MCP SDK 2.x.
Его сборка не использует TS → BorisScript compiler. Девять файловых tools требуют
отдельно установленной BorisType.FileSystem **0.1.0-alpha.4 / API 2**.
MCP и DLL обновляются вместе: read/edit/write изменили контракт относительно API 1.

Доступны read_file, write_file, edit_file, list_directory, search_files,
delete_file, create_directory, move_file и get_file_info с префиксом `wshcm_`.
Также доступны `wshcm_xquery` и XML object tools `wshcm_get_form`,
`wshcm_get_object`, `wshcm_save_object`, которым BorisType DLL не нужна.
Конфигурация CLI/env и клиента, installation и точные options — в
[package README](https://github.com/BorisType/BorisType/blob/main/packages/mcp-server/README.md).

## Установка и подключение

Требуются Node.js >=24.22.2 и доступ к серверу HCM. Для файловых tools сначала
[установите DLL и проверьте её metadata](./dotnet). Для XQuery и XML tools этот
шаг с DLL не нужен.

Установите MCP сервер:

```sh
npm install -g @boristype/mcp-server@next
```

Например, для VS Code добавьте в `.vscode/mcp.json`:

```json
{
  "servers": {
    "wshcm": {
      "command": "boristype-mcp",
      "args": ["--host", "localhost", "--port", "80", "--username", "admin"],
      "env": {
        "WSHCM_PASSWORD": "<пароль пользователя HCM>"
      }
    }
  }
}
```

Замените host, port и учётные данные на параметры вашего HCM. Для HTTPS добавьте
`--https`. CLI имеет приоритет над переменными окружения; вместо CLI доступны
`WSHCM_HOST`, `WSHCM_PORT`, `WSHCM_USERNAME`, `WSHCM_PASSWORD`, `WSHCM_HTTPS`.
Конфигурацию с реальным паролем не включайте в репозиторий. Другие клиенты,
включая Claude Desktop, описаны в
[конфигурации package README](https://github.com/BorisType/BorisType/blob/main/packages/mcp-server/README.md#конфигурация).

Запустите сервер средствами MCP-клиента и проверьте список tools: девять
файловых, `wshcm_xquery` и три XML tools. Затем выполните операцию чтения,
например `wshcm_get_form` с формой, существующей на вашей установке:

```json
{ "formUrl": "x-local://wtv/wtv_cost_center.xmd" }
```

Успех этого вызова подтверждает соединение и загрузку конкретной формы,
но не установку DLL. Для файлового маршрута прочитайте известный физический
UTF-8 файл через `wshcm_read_file`; результат должен содержать content, sha256
и readToken. Параметры URL и ограничения — в
[описании tools](https://github.com/BorisType/BorisType/blob/main/packages/mcp-server/README.md#tools).

## Руководство для агента

Сервер передаёт короткие общие `instructions` при MCP initialization, а каждый
tool публикует свои schema и description. Для подробных workflow можно установить
skill `boristype-mcp`: чтение/правка с readToken, хранилища, XQuery/SQL,
потери типов и обработка неизвестного исхода. Установка и границы доставки
инструкций клиентом — в [руководстве по skills](agent-skills.md).
Skill не устанавливает сервер или DLL и не добавляет новых гарантий.

## XML объектов

`wshcm_get_form({formUrl})` возвращает раскрытую структуру через нативный
`XmlForm.TopElem.Xml`: агенту не нужно вручную собирать SAMPLE/INHERIT из файлов.
Это текущая загруженная форма, не автономный export всех зависимостей XMD.

`wshcm_get_object({id})` возвращает полный экспорт `TopElem.Xml`, actual form URL
и `readToken`. ID передаётся точной decimal string; hex integer внутри XML
поддерживается без JS Number. Полный XML не включает гарантированный binary
backup, TEMP и computed data.

`wshcm_save_object` принимает XML строкой, без XML→JS→XML mapping:

```json
{
  "mode": "create",
  "formUrl": "x-local://wtv/wtv_cost_center.xmd",
  "xml": "<cost_center><code>example-unique-code</code><name>Example</name></cost_center>"
}
```

Create выделяет новый ID. Для replace нужны `mode:"replace"`, `id`, `readToken`
и `xml`; форма берётся из прочитанного существующего объекта. **Пропущенные поля
удаляются либо получают defaults.** Нужен token полного чтения в текущем MCP
instance, TTL 30 минут, до 32 snapshots. Новое чтение меняет token, попытка
replace расходует его; после попытки требуется перечитать объект.

Проверяются строгий XML 1.0, root/identity, известность полей, cardinality и
integer lexical/range. Остальные scalar conversions и бизнес-проверки не
гарантируются. XML/schema ограничены 256 KiB каждый, input depth 64, 8192
элемента; большой ответ отклоняется целиком. Поддерживаются локальные XMD URLs
`x-local://` и `x-app://` без произвольных open options.

Перед Save повторно проверяются XML объекта и его форма, но это не atomic CAS
относительно внешних writers. Token относится к MCP instance, изоляция чатов
при переиспользовании сервера не гарантируется. Form/load/hooks могут выполнять
код; сохранение не повторяет XMS business workflow или UI authorization.

Ответ содержит `writeStatus`: `not_attempted` — Save ещё не вызывался,
`unknown` — исход не установлен, `saved` — Save завершился, даже если последующий
readback не удался. Известный ID сохраняется в ошибке. Нет гарантии rollback или
отмены по timeout; автоматически повторять create/replace нельзя.
[Полный контракт и примеры](https://github.com/BorisType/BorisType/blob/main/packages/mcp-server/README.md#xml-объектов-форма-чтение-сохранение).

## Серверные запросы

`wshcm_xquery` принимает `query` и optional `maxRows` (default 100, 1–1000):

```json
{ "query": "sql: SELECT 1 AS n", "maxRows": 10 }
```

Обычный XQuery и префикс `sql:` передаются в платформенный `XQuery` на сервере
без фильтрации. Дополнительных клиентских SQL-флагов tool не включает.
**Гарантий чтения, идемпотентности и отката нет**; tool помечен как потенциально
изменяющий данные. Политика readToken файловых tools эти запросы не ограничивает.

Ответ: `rows`, `returnedRows`, `truncated`, `limitReason` (`null`/`rows`/`output`).
Ограниченный диапазон содержит до maxRows + 1 строк для lookahead; размер
сериализованных строк ограничен 65000 символами, весь ответ — 256 KiB UTF-8.
Типы/вложенность следуют `tools.object_to_text(row, "json", 5)`; каноническое
сохранение SQL NULL, decimal, дат и дубликатов колонок не гарантируется.
Числовые JSON tokens возвращаются без повторной сериализации в Node.
На проверенной Linux C/PG сборке отрицательные SQL integer становятся пустыми
XML-полями и выдаются как `null`, даже `-7`. Приведение integer к тексту в SQL
сохраняет знак; SQL `NULL` без явного типа и `''` оба получены как `""`.

Эти лимиты не ограничивают работу БД и память сервера. Transport timeout не
гарантирует отмену запроса; автоматических повторов нет. Запрос может изменить
данные до ошибки или потери ответа. `test:e2e:xquery` прошёл 10/10 на Linux HCM
2025.2.1333 / CLR 9.0.11 / PostgreSQL 16 без BorisType DLL в query path. Проверены
каталог, SQL, quotes/control escapes, row/output limit и большие Unicode-ответы.
Команда требует запущенный локальный стенд; output fixtures используют PostgreSQL.
[Evidence и ограничения типов](https://github.com/BorisType/BorisType/blob/main/refs/research/mcp/09-xquery-native.md).

## Чтение перед изменением

Read всегда возвращает JSON: content, original-byte sha256, bom, координаты
строк/UTF-16 и readToken. Optional startLine/endLine — 1-based inclusive,
с сохранением CRLF/CR/LF. Даже частичное чтение требует UTF-8 файл <=1 MiB.
Каждое чтение отменяет предыдущий token этого URL; для накопления диапазонов
одной версии передать предыдущий readToken в следующий read request.
Без него подтверждается только новый диапазон.

Edit требует token из этого экземпляра MCP и допускает oldText только целиком
в прочитанном покрытии. Каждая exact replacement должна быть unique, включая
overlapping matches. Последовательные замены проверяются в памяти; ошибка
любого patch не сохраняет предыдущие patches. При stale hash — Conflict,
при отсутствующем token/покрытии — ReadRequired. После попытки изменения token
расходуется; для следующего edit требуется новое чтение. DryRun не пишет и не
расходует token, но preview не предоставляет дополнительных разрешений.

Write по умолчанию create-only и отказывает для existing path. Overwrite требует
mode=overwrite и token с полным покрытием. Get-info/search не заменяют чтение.
Delete/move — отдельные явные операции без требования читать весь binary file.

Состояние ограничено 128 файлами, 256 объединёнными диапазонами на файл и TTL
30 минут после последнего чтения. URL aliases требуют отдельного token.
**Разделение чатов не гарантируется**, если клиент переиспользует MCP server.
Сервер фиксирует выдачу текста клиенту, а не его получение/осмысление моделью.
Проверка версии и rename не являются атомарным compare-and-replace относительно
внешних writers: строгое закрытие этого окна отложено в исследование.

## Файловые операции и ограничения

BS разрешает x-local URLs через UrlToFilePath, standalone DLL выполняет IO без
Datex callbacks. Text — strict UTF-8, один начальный BOM убирается при чтении;
write добавляет BOM, edit сохраняет исходный BOM и unaffected whitespace.
NUL/invalid encoding/oversized files отвергаются; legacy encodings не угадываются.
List возвращает immediate entries ordinal, отмечает links без traversal;
переполнение 10000 entries — ошибка. IO paths и ancestors с links/junctions
отвергаются. VFS и special files не аттестованы.

Tools работают с **физической ФС**, а не со всем содержимым платформенного URL.
На проверенном Linux HCM `LoadUrlData(x-local://wt_data/...)` с SQL hook читал
blob из `spxml_blobs`, тогда как чтение физического пути видело другие байты
на диске. Изменение или удаление дисковой копии не обновляет этот blob.
ReadToken/hash относятся к дисковому файлу. Операции с логическими URL и SQL
resources требуют отдельного контракта; добавление поддержки схем его не заменяет.
[Native исследование](https://github.com/BorisType/BorisType/blob/main/refs/research/dotnet/15-url-storage-routing-research.md).

Create-directory создаёт missing parents и допускает existing directory;
создание цепочки не транзакционно. Get-info читает metadata, включая binary/large
files, без содержимого. Move использует native no-replace rename на Linux/Windows:
нет overwrite или скрытого copy/delete между файловыми системами.

Search ищет имена по glob, содержимое — построчно literal/.NET regex. Ответ root,
relative paths, line/column/text, stats/skipped/limitReason описывает охват явно.
Полный проход требует skipped=0 и limitReason=null; ответ ограничен 256 KiB.

`destructiveHint` — подсказка клиенту, не гарантия запроса подтверждения.
EOF/SIGINT/SIGTERM выполняют общий evaluator cleanup. Частичная инициализация
и shutdown во время активного SOAP требуют дальнейшей работы.

## Проверки

XML object suite `test:e2e:objects` не требует BorisType DLL и проверяет
form/create/read/whole replace, XML negatives и stale/consumed token на одном
собственном `cost_center`, с независимым удалением/cleanup. На Linux HCM
2025.2.1333 / CLR 9.0.11 / PostgreSQL 16 прошло 8/8 tests без skips.
Общий локальный MCP suite — 218/218; он не заменяет native acceptance.
[Отчёт и границы](https://github.com/BorisType/BorisType/blob/main/refs/research/mcp/10-object-model/first-implementation.md).

Есть managed, MCP protocol/VM, stdio и pack проверки, а также отдельные native
команды test:e2e, test:e2e:edit, test:e2e:read-aware, test:e2e:search. Native suites
требуют уже установленного локального stand/DLL и ограничиваются своими fixtures.
Все четыре серии прошли на Linux HCM 2025.2.1333 / CLR 9.0.11 с alpha.4/API 2:
28/28 + 1/1 + 1/1 + 1/1, без skips. Байты и cleanup проверены независимо.
Это evidence одной C-сборки; JS runtime и Windows HCM этим не проверены.
[Контракт и границы](https://github.com/BorisType/BorisType/blob/main/refs/dotnet/files-and-read-grants.md),
[результаты](https://github.com/BorisType/BorisType/blob/main/refs/research/dotnet/13-read-aware-files-results.md).
