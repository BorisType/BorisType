# MCP server для WebSoft HCM

`@boristype/mcp-server` — Node.js >=24.22.2, stdio transport, MCP SDK 2.x.
Его сборка не использует TS → BorisScript compiler. Общий SDK ws-client
поставляет DLL для девяти файловых tools и автоматически подготавливает её
на HCM. Для файловых tools нужны net9 host и доступ к dotnetcore/shared.

Доступны read_file, write_file, edit_file, list_directory, search_files,
delete_file, create_directory, move_file и get_file_info с префиксом `wshcm_`.
Также доступны `wshcm_execute`, `wshcm_get_system_info`, `wshcm_xquery` и XML object tools `wshcm_get_form`,
`wshcm_get_object`, `wshcm_save_object`, а также десять package tools; всем им BorisType DLL не нужна.
Конфигурация CLI/env и клиента, installation и точные options — в
[package README](https://github.com/BorisType/BorisType/blob/main/packages/mcp-server/README.md).

## Установка и подключение

Требуются Node.js >=24.22.2 и доступ к серверу HCM. Для файловых tools DLL
входит в npm dependency ws-client; [подготовка происходит автоматически](./dotnet).
Execute, system info, XQuery, XML и package tools не зависят от готовности DLL.

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
файловых, `wshcm_execute`, `wshcm_get_system_info`, `wshcm_xquery`, три XML tools, десять package tools и `wshcm_runtime_status` — всего 26. Затем выполните операцию чтения,
например `wshcm_get_form` с формой, существующей на вашей установке:

```json
{ "formUrl": "x-local://wtv/wtv_cost_center.xmd" }
```

Успех этого вызова подтверждает соединение и загрузку конкретной формы,
но не установку DLL. Вызовите `wshcm_runtime_status` с `{}`: ready разрешает
файловые операции, restart_required сообщает о подготовленной DLL и старом
загруженном коде. HCM автоматически не перезапускается. Для файлового маршрута прочитайте известный физический
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

## Экспорт и импорт пакетов объектов

Доступны `wshcm_list_package_schemas`, `wshcm_get_package_schema`,
`wshcm_save_package_schema`, `wshcm_delete_package_schema`,
`wshcm_add_package_objects`, `wshcm_remove_package_objects`, `wshcm_export_package`,
`wshcm_inspect_package`, `wshcm_import_package`, `wshcm_get_package_operation`.

Экспорт по точным IDs не сохраняет схему и не переключает текущую схему UI:

```json
{ "objectIds": ["9007199254740993"], "operationId": "11111111-1111-4111-8111-111111111111" }
```

Вызовите `wshcm_export_package` с этими параметрами. Альтернатива — только
`{schemaId,revision}` из `wshcm_get_package_schema`; одновременно оба источника
запрещены. Ответ содержит artifactId/localPath/sizeBytes/sha256 внутри `artifact`,
status и missingCount. ZIP/base64 в контекст не попадает.
`localPath` находится **на машине MCP**; файл клиента в другой среде недоступен
по одному имени. Каталог `~/.boristype/package-artifacts` переживает сеанс, handle
действует 24 часа; автоматической уборки expired/native файлов пока нет.

Просмотрите `wshcm_inspect_package({artifactId})` либо
`wshcm_inspect_package({localPath:"/absolute/path/on-mcp-host/input.zip"})`.
Полученный inspectionId связывает неизменяемую копию архива. Для применения:
`wshcm_import_package({inspectionId,operationId})`. По умолчанию применяется весь
состав; страницы preview не ограничивают выбор. Явные objectIds/packageIds могут
выбирать любой элемент снимка, включая другие страницы. После перезапуска MCP
требуется повторный inspect. Конфликты и hash проверяются перед apply.

По умолчанию отключены `allowVersionMismatch`, `allowReimport`, `skipConflictingIds`,
`includeCustomTemplates`, `includeAccessRoles`, `includeFiles`, `includeDeletions`,
`includeLists`. Export/add принимают отдельные includeCategories/includeRelatedObjects/
includeFiles/includeAssessmentItems. Related использует штатные XMD/foreign связи;
ссылки в wvars и mode → web_mode ещё не разрешаются. Поддерживаются objects/courses/
web/custom_file, остальные типы отклоняются; custom_file destination ограничен
`x-local://custom/`. Native acceptance пока покрывает objects/cost_center на Linux
C/PostgreSQL; дополнительные типы и extras остаются непроверенными.

Схемы: создайте через `wshcm_save_package_schema({name})`, читайте по schemaId,
изменяйте/добавляйте/исключайте с `{schemaId,revision,...}`. Удаление схемы не удаляет
её объекты. Общий XML перечитывается перед Save; external atomic CAS отсутствует.

Лимиты ZIP: 128 MiB, expanded 512 MiB, 10000 entries, depth 2; XML 32 MiB;
input objectIds до 10000; chunk 256 KiB. Страницы default 100, limit 1–1000,
продолжение через offset/limit или выданный `nextPage`. MCP text ≤256 KiB;
сокращение помечается truncated/truncatedFields. Подробные diagnostics доступны
через SDK/native reports, длинные settings могут сокращаться.

Задайте UUID operationId до долгого вызова и сохраните его. Public UUID handles
operationId/artifactId/inspectionId принимаются в любом регистре и приводятся
к lowercase перед использованием; schemaId/packageId сохраняют регистр. После
потери ответа запросите `wshcm_get_package_operation({operationId})` на том же
стенде и аккаунте: timeout не отменяет работу. Отсутствующий, недоступный или
повреждённый receipt даёт unknown с code ReceiptUnavailable и phase receipt.
Unknown не подтверждает отсутствие
изменений; retry/rollback/exactly-once не предоставляются. Completed с
platform_report_only не доказывает успех каждого объекта. Ошибки сохраняют
operationId/status и при наличии lastKnownOperation/cleanupError.
[Все параметры и lifecycle](https://github.com/BorisType/BorisType/blob/main/packages/mcp-server/README.md#пакеты-объектов).

## Сведения о стенде

Вызовите `wshcm_get_system_info` с `{}` для сводки: версии HCM, ОС, БД,
Unibridge, режим запуска и флаги cluster/full-text index/personal data.
Ответ — `{ "summary": { ... } }`; отсутствующие поля и неизвестные значения
флагов равны `null`. Настройки стенда не меняются, DLL не требуется.

Вход `{ "includeReport": true }` добавляет строку `report` с полным штатным
отчётом «О программе → Информация о системе», без дополнительной очистки.
Секции INI/XML/Global Settings пока остаются текстом. Отчёт больше 256 KiB UTF-8
отклоняется целиком, в том числе при запросе только сводки. Лимит не ограничивает
стоимость сбора; автоматических повторов нет. Сведения относятся к ответившему
процессу, единого снимка кластера не гарантируют.
[Контракт и пример ответа](https://github.com/BorisType/BorisType/blob/main/packages/mcp-server/README.md#сведения-о-стенде).

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

## Выполнение BorisScript

`wshcm_execute` выполняет серверный BorisScript с правами подключённого аккаунта,
без BorisType DLL. Например:

```json
{ "code": "print('Checking version'); return tools.get_version('wtv', false);" }
```

Успех: `{ok:true,value,output,outputTruncated}`. `print(value)` собирает сообщения
этого вызова, `return` задаёт результат. Штатные `alert`/логи библиотек остаются
в журналах HCM; в доступном Docker-окружении агент может посмотреть их отдельно.
Это не требует перехвата или изменения общего логирования.

`print(value)` — экспериментальный кандидат с пока не подтверждённой практической
полезностью; по результатам оценки он может быть изменён или удалён.

Ошибка имеет `error.phase`: `execution` — разбор/выполнение, `result` — подготовка
результата, `presentation` — представление в JSON. Уже собранный вывод сохраняется.
При сбое транспорта/ответа возвращается `executionStatus:"unknown"`;
вывод в таком случае не гарантирован. Ошибки помечены MCP `isError: true`.

Safe integer выдаётся как JSON number, остальные integer — decimal strings,
undefined — null, XML/date — проекция XQuery. Код ограничен 64 KiB UTF-8,
ответ — 256 KiB; у проекции и диагностики есть отдельные лимиты.
Усечение сообщений обозначается `outputTruncated`, скрипт при этом продолжается.
Лимиты не ограничивают работу или память кода.

Вызов может менять данные, не ограничен файловыми readToken и не гарантирует
rollback. **Timeout клиента не означает остановку серверного кода**;
автоматических повторов нет. Сначала установить фактические эффекты, затем
решать, нужен ли повтор.
[Контракт, ошибки и лимиты](https://github.com/BorisType/BorisType/blob/main/packages/mcp-server/README.md#выполнение-серверного-borisscript).

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
внутреннего carrier строк ограничен 65000 символами, весь ответ — 256 KiB UTF-8.
Общий `Evaluator.xquery` из ws-client проецирует XML на сервере по фактическим
типам полей в records/arrays; dates становятся ISO-строками. MCP выдаёт safe integer
как JSON number, остальные integer как точные decimal strings. Nonfinite real
даёт ошибку. Форматирование real в SOAP может терять точность. Глубина до 32,
10000 значений; превышение этих пределов даёт ошибку.
[Матрица типов и API](../reference/ws-client-values.md).
На проверенной Linux C/PG сборке отрицательные SQL integer становятся пустыми
XML-полями и выдаются как `null`, даже `-7`. Приведение integer к тексту в SQL
сохраняет знак; SQL `NULL` без явного типа и `''` оба получены как `""`.

Эти лимиты не ограничивают работу БД и память сервера. Transport timeout не
гарантирует отмену запроса; автоматических повторов нет. Запрос может изменить
данные до ошибки или потери ответа. `test:e2e:xquery` прошёл 12/12 на Linux HCM
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
