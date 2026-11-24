# @boristype/mcp-server

MCP-сервер для WebSoft HCM позволяет агенту работать с документами, настраиваемыми полями,
пакетами и физическими файлами, выполнять XQuery/SQL и BorisScript, запускать настроенных
серверных агентов. Клиент соединяется с локальным процессом по stdio. [Model Context Protocol](https://modelcontextprotocol.io/)

Использует [@boristype/ws-client](https://github.com/BorisType/BorisType/tree/main/packages/ws-client) для соединения с WSHCM сервером.

Экспериментальный сервер предоставляет 33 tools. В их числе девять файловых,
десять для пакетов объектов, девять для форм, объектов и конфигурации, а также запуск серверных агентов.
Требуется Node.js >=24.22.2; для файловых tools — net9 HCM с доступным dotnetcore/shared. Общий API
`ws-client` включает production DLL и автоматически подготавливает FileSystem
**0.1.0-alpha.4 / API 2** для девяти файловых tools; execute, XQuery, system info, object, package и agent tools её не используют.
MCP остаётся адаптером этого SDK, пригодного также для CLI.
Файловые операции используют BS URL resolver и managed filesystem API, без Datex
callbacks. Девять файловых tools и защита чтений прошли native e2e на Linux
C-runtime `websoft/hcm:2025.2.1333` / CLR 9.0.11. Это evidence одной сборки;
другие ОС/версии и полный permissions/VFS contract требуют отдельных проверок.
[Отчёт](https://github.com/BorisType/BorisType/blob/main/refs/research/dotnet/13-read-aware-files-results.md).

Файловые tools работают с физическими файлами. Логические URL-ресурсы в `spxml_blobs`
ими не читаются и не обновляются; успешная правка диска может не изменить
результат `LoadUrlData` того же URL. [Граница checkpoint](https://github.com/BorisType/BorisType/blob/main/refs/research/mcp/08-filesystem-checkpoint.md).

Используется стабильная линия MCP TypeScript SDK 2.x: runtime-пакет
`@modelcontextprotocol/server`; `@modelcontextprotocol/client` нужен только тестам.
Схемы инструментов передаются как Zod 4 `z.object(...)` (Standard Schema).
Версии SDK зафиксированы lockfile с учётом 14-дневного `minimumReleaseAge`.

TypeScript 6.0.3 следует общему Compiler API baseline workspace. Это не latest
TypeScript CLI: версия 7 использует новый native compiler и другой API.
Обоснование и отставшие зависимости перечислены в
[dependency review](https://github.com/BorisType/BorisType/blob/main/refs/research/mcp/03-dependency-review.md).

## Установка

```bash
npm install -g @boristype/mcp-server@next
```

Выберите свой клиент и выполните команды в Bash. Замените `hcm.example`,
`443` и `hcm-user` на адрес, порт и имя пользователя вашего HCM. Для HTTP
уберите `--https` и укажите HTTP-порт. Пароль вводится без отображения и
сохраняется в личной конфигурации клиента через `--env`.

### Codex CLI

```bash
read -r -s -p 'Пароль HCM: ' hcm_password
printf '\n'
codex mcp add wshcm --env "WSHCM_PASSWORD=$hcm_password" -- \
  boristype-mcp --host hcm.example --port 443 --https --username hcm-user
unset hcm_password
codex mcp list
```

Команда добавляет `wshcm` в пользовательскую конфигурацию Codex.
[Документация Codex CLI](https://learn.chatgpt.com/docs/extend/mcp?surface=cli).

### Claude Code

Выполните команды из каталога проекта. `--scope local` добавляет личную
запись для текущего проекта. Чтобы использовать её во всех проектах,
выберите `--scope user`.
[Документация Claude Code](https://code.claude.com/docs/en/mcp#scope).

```bash
read -r -s -p 'Пароль HCM: ' hcm_password
printf '\n'
claude mcp add --env "WSHCM_PASSWORD=$hcm_password" --transport stdio --scope local wshcm -- \
  boristype-mcp --host hcm.example --port 443 --https --username hcm-user
unset hcm_password
claude mcp list
```

## Доступность HCM

С корректной конфигурацией stdio-сервер запускается при выключенном HCM.
`initialize`, `tools/list` (33 tools) и `ping` обходятся без запросов к HCM.
Первый вызов инструмента, которому нужен HCM, открывает соединение.
Следующая явно запрошенная операция может восстановить его в том же процессе
MCP. Фоновых проверок нет. Read tokens, package handles и локальные ZIP
сохраняются по обычным правилам срока действия. `wshcm_inspect_package` требует
HCM для preview или проверки полученного ранее inspection.

Если подготовка или запрос к HCM завершаются ошибкой, инструмент возвращает
`isError: true` с JSON. `HcmUnavailable` содержит состояние соединения
(network, timeout, http или evaluator), target и признак `retryable`.
HTTP 401/403 дают `HcmAuthenticationFailed`; обновите учётные данные в
конфигурации клиента и перезапустите MCP. Соединение для параллельных вызовов
готовится один раз. Если временная библиотека этого процесса перестала
отвечать, сервер может восстановить её по тому же URL и проверить до
отправки пользовательского кода.

`--connection-timeout-ms <ms>` задаёт положительное целое число, по умолчанию
5000 мс на каждый HTTP-запрос подготовки или проверки. Обычный запрос к HCM
сохраняет socket timeout 30000 мс. MCP-клиент может задавать собственный таймаут
вызова инструмента.

До отправки кода одиночный execute или XML write получает соответственно
`executionStatus: "not_started"` или `writeStatus: "not_attempted"`.
Потеря ответа после отправки оставляет исход неизвестным. BorisScript
инструмента автоматически не повторяется. Для записи сначала проверьте
результат на HCM, а для package operation запросите сохранённый receipt по
`operationId`. Сбой подготовки к очередному шагу пакета оставляет ранее
подтверждённые шаги в силе. Общий исход может остаться `unknown` с
`lastKnownOperation`. Таймаут не отменяет серверную работу.

При EOF, SIGINT или SIGTERM сервер пытается удалить свою временную библиотеку,
если её создание уже было начато. Неподтверждённая очистка выводится в stderr.
[Native-проверка восстановления](https://github.com/BorisType/BorisType/blob/main/refs/research/mcp/connection-recovery/README.md).

## Руководство для агента

Сервер передаёт короткие общие `instructions` при MCP initialization: связи
между tools, чтение перед правкой, различие физических файлов и blobs,
неполные query results и неизвестный исход выполнения. Клиент решает, включать
ли этот текст в контекст модели; отправка инструкций не доказывает их применение.
Descriptions и schemas tools остаются источником текущих параметров.

Подробные workflow доступны в отдельно устанавливаемом skill `boristype-mcp`:

```sh
npx skills add BorisType/BorisType --skill boristype-mcp
```

Для изменений до публикации используй локальный checkout:
`npx skills add . --skill boristype-mcp`.
Skill не устанавливает MCP/DLL и не требует skill `websoft-hcm`.
[Каталог и установка skills](https://github.com/BorisType/BorisType/blob/main/docs/guides/agent-skills.md).
MCP resources и prompts на этом шаге не зарегистрированы. Описания tools,
instructions и skill не добавляют гарантий чтения, изоляции или отката сверх кода.

## Tools

[Справочник на GitHub Pages](https://boristype.github.io/BorisType/guides/mcp-server#справочник-инструментов)
содержит примеры аргументов, описание результатов и порядок вызовов для каждого инструмента.

| Tool                                   | Назначение                                                |
| -------------------------------------- | --------------------------------------------------------- |
| `wshcm_read_file`                      | UTF-8 текст или диапазон строк, hash и readToken          |
| `wshcm_write_file`                     | Create-only либо перезапись после полного чтения          |
| `wshcm_edit_file`                      | Точные замены внутри прочитанных диапазонов               |
| `wshcm_list_directory`                 | Immediate entries, без recursion                          |
| `wshcm_search_files`                   | Поиск по именам и UTF-8 содержимому                       |
| `wshcm_delete_file`                    | Удаление отдельного файла                                 |
| `wshcm_create_directory`               | Создание каталога и missing parents                       |
| `wshcm_move_file`                      | Rename без overwrite и copy/delete fallback               |
| `wshcm_get_file_info`                  | Metadata файла/каталога без чтения содержимого            |
| `wshcm_runtime_status`                 | Автоподготовка DLL и expected/installed/loaded identity   |
| `wshcm_xquery`                         | Серверный XQuery, включая прямой SQL через `sql:`         |
| `wshcm_get_system_info`                | Сводка стенда и опциональный штатный системный отчёт      |
| `wshcm_execute`                        | Серверный BorisScript: результат, диагностика и ошибки    |
| `wshcm_run_agent`                      | Запуск серверного агента с опциональным ожиданием         |
| `wshcm_list_object_types`              | Типы объектов и отдельно зарегистрированные каталоги      |
| `wshcm_list_object_data_types`         | Типы данных объектов и стороны их связей                  |
| `wshcm_get_custom_field_definitions`   | Поля и страницы одного общего или индивидуального шаблона |
| `wshcm_patch_custom_field_definitions` | Точечная правка полей и страниц с проверкой ревизии       |
| `wshcm_get_form`                       | XML раскрытого root загруженной XMD                       |
| `wshcm_get_object`                     | Полный экспортируемый XML объекта и readToken             |
| `wshcm_save_object`                    | Create либо полная замена объекта из XML                  |
| `wshcm_patch_object`                   | Частичная правка существующего объекта из XML             |
| `wshcm_delete_object`                  | Перемещение одного объекта в корзину после полного чтения |
| `wshcm_list_package_schemas`           | Страница сохранённых схем и общая revision                |
| `wshcm_get_package_schema`             | Схема по id, настройки и страница объектов                |
| `wshcm_save_package_schema`            | Создание схемы или изменение имени/settings/editable      |
| `wshcm_delete_package_schema`          | Удаление одной схемы, без удаления объектов               |
| `wshcm_add_package_objects`            | Добавление IDs и явно выбранных зависимостей в схему      |
| `wshcm_remove_package_objects`         | Исключение IDs из схемы, без удаления объектов            |
| `wshcm_export_package`                 | ZIP из одной схемы либо точных IDs                        |
| `wshcm_inspect_package`                | Неизменяемая копия ZIP, native preview и страницы состава |
| `wshcm_import_package`                 | Применение просмотренного пакета с явными опциями         |
| `wshcm_get_package_operation`          | Сохранённое серверное состояние операции                  |

Read/list/search/info помечены readOnlyHint. Write/edit/delete/move имеют
`destructiveHint: true`, `idempotentHint: false`; create_directory —
`destructiveHint: false`, `idempotentHint: true`. Это подсказки MCP-клиенту;
сервер не реализует отдельное пользовательское подтверждение.
XQuery имеет `readOnlyHint: false`, `destructiveHint: true`, `idempotentHint: false`:
запрос передаётся платформе без проверки на чтение.

Отложенные read-multiple/tree не зарегистрированы; их TS stubs и пять старых BS
stubs удалены. BS resources живут в ws-client: файловые bridges и runtime
manager принадлежат общему SDK; typed `xquery.bs` используется `Evaluator.xquery`
и `WshcmApi.xquery`. MCP не содержит собственной копии ресурсов.

Это несовместимое обновление прототипа: read всегда возвращает JSON,
includeMetadata удалён; edit требует readToken, write по умолчанию create-only.
Старые ответы API 1 отвергаются. Нужный комплект DLL поставляется с ws-client;
отдельное скачивание не требуется. [Подготовка и перезапуск](https://github.com/BorisType/BorisType/blob/main/docs/guides/dotnet.md).

### Пакеты объектов

Десять package tools используют общий SDK `api.packages` и штатные серверные
функции HCM, без BorisType DLL и браузера. Схема выбирается только по `schemaId`;
текущая схема администратора не переключается. Все object IDs — точные десятичные
строки, например `"9007199254740993"`; передавать их через JavaScript Number нельзя.

Для прямого экспорта вызовите `wshcm_export_package`:

```json
{ "objectIds": ["9007199254740993"], "operationId": "11111111-1111-4111-8111-111111111111" }
```

У прямого экспорта можно указать `objectIds`, `customTemplates` или оба
параметра. Для ZIP только с определениями достаточно
`{ "customTemplates": ["subdivision", "request_type"] }`.
Коды относятся к разделам реестра настраиваемых полей. Например,
`request_type` включает все настроенные шаблоны этого типа с их полями и
страницами. Сами записи типов заявок включаются отдельно через `objectIds`.
Для экспорта сохранённой схемы передайте только `{schemaId, revision}`
из чтения схемы в этом MCP instance.

Ответ содержит `artifact: {artifactId,localPath,mimeType,sizeBytes,sha256,expiresAt}`,
`operationId`, `status`, `verification: "archive_membership"`, страницу `objects`,
`missingIds/missingCount`, diagnostics и native `operation`. `customTemplateTypes`
перечисляет типы, реально попавшие в ZIP. `missingCustomTemplates` отражает
выбранные типы, которые HCM пропустил, в том числе в сохранённой схеме.
В HCM 2025.2.1333 тип попадает в ZIP, если у него есть хотя бы одно общее
поле или одна запись шаблона. Тип с одними общими страницами пропускается.
Частичный состав
возвращает `partial`, даже если штатная сборка сообщила успех. ZIP/base64 в текст
tool response не помещается; export не создаёт `upload_package` в базе.

`artifact.localPath` указывает на служебный снимок **на машине процесса MCP**. По умолчанию ZIP и метаданные находятся в
`~/.boristype/package-artifacts`. Чтобы выбрать другой абсолютный каталог,
передайте `--package-artifact-directory <path>`. Файлы переживают закрытие
сеанса, handle действует 24 часа. Автоматическая уборка серверных receipt,
native report/temp и служебных снимков ZIP пока не реализована. Исходный
пользовательский ZIP не перезаписывается; чтение не разрешает его перезапись.
Resources/attachment upload на этом шаге не зарегистрированы.

Просмотр и применение разделены:

```json
{ "artifactId": "<artifactId из export>", "limit": 100 }
```

`wshcm_export_package` возвращает `file.path`. По умолчанию это `~/.boristype/shared/packages/<operationId>.zip`. Если целевой MCP видит этот каталог, передайте ему `file.path` как `inputPath`. Для переноса между машинами используйте общий том или скопируйте ZIP в проект либо в `shared/packages` целевого MCP. Синоним `localPath` у инструмента просмотра поддерживается для существующих клиентов.

Чтобы сохранить ZIP в проекте, передайте `"outputPath":"agents.zip"`. Для XML формы и объекта тот же параметр задаёт имя нового `.xml`. Чтобы редактировать объект скриптом, получите файл через `wshcm_get_object`, измените его и передайте `inputPath` с прежним `readToken` в `wshcm_save_object`. Для точечной правки передайте XML с нужными полями в `wshcm_patch_object`. В обоих случаях отправьте один из `xml` и `inputPath`. Файловый вход по умолчанию возвращает файл, `outputMode: "inline"` возвращает строку.

Временные ZIP и XML находятся в подпапках `packages` и `objects` каталога `--shared-directory`. Для XML временный файл запрашивается через `outputMode: "file"`. В ответе с `file.storage: "shared"` есть предупреждение и `expiresAt` через 24 часа. Stdio MCP проверяет срок при запуске и каждый час. Передайте проектный `outputPath` или скопируйте файл в проект до очистки, если он должен сохраниться. Проектными файлами управляет владелец проекта.

MCP запрашивает корни проекта у клиента по `roots/list`. Для одного корня подходят относительные пути, для нескольких нужен абсолютный путь внутри выбранного корня. Если клиент не даёт подходящих корней, укажите `--project-directory /work/project`. Значение `.` явно выбирает рабочий каталог процесса. Для вывода нужны существующая подпапка и свободное имя файла.

SDK проверяет путь, копирует ZIP в собственный
артефакт и передаёт его для native preview. Ответ содержит `inspectionId`, `artifact`,
страницу `items`, `offset/limit/total` и receipt. Строка вложенного
пакета с определениями содержит `customTemplateTypes`. Следующая страница:
`{inspectionId,offset:100,limit:100}`. Просмотр может создавать временные файлы и
отчёты; целевые объекты ещё не применяются.

`wshcm_import_package({inspectionId,operationId})` по умолчанию применяет **весь
неизменяемый просмотренный состав**. Страницы — способ представления; импорт не
ограничен первой возвращённой страницей. Явные `packageIds`/`objectIds` выбирают
подмножество из любого места этого снимка; внешние IDs отклоняются. Изменение
исходного path после inspect не меняет импорт. Inspection binding принадлежит
этому MCP instance; после перезапуска архив нужно просмотреть снова. Перед
применением снова проверяются target/account, hash и конфликты.

По умолчанию выключены `skipConflictingIds`, `allowVersionMismatch`, `allowReimport`,
`includeCustomTemplates`, `includeAccessRoles`, `includeFiles`, `includeDeletions`,
`includeLists`. Конфликт типа останавливает применение либо явно пропускается через
`skipConflictingIds`; remap IDs отсутствует. Первый релиз допускает типы пакета
`objects`, `courses`, `web`, `custom_file`, остальные отклоняет до native применения.
Для `custom_file` требуется безопасный destination ниже `x-local://custom/`.
На Linux C/PostgreSQL подтверждён перенос объектов `cost_center` и
определений настраиваемых полей со страницами. Для импорта определений
передайте `includeCustomTemplates: true`. HCM добавляет или обновляет
поля по ключу и страницы по ID.

Схемы: `list_package_schemas({offset?,limit?})` → `items/offset/limit/total`;
`get_package_schema({schemaId,offset?,limit?})` → name/settings/revision/objectCount/objects.
Для создания: `save_package_schema({name})`; для изменения:
`{schemaId,revision,name?,settings?,editable?:[{id,editable}]}`.
Settings: `customTemplates`, `processCustomTemplates`, `processAccessRoles`,
`files:[{code,type,url,baseUrl?}]`. Чтобы включить определения в ZIP из схемы,
передайте, например, `settings: { processCustomTemplates: true, customTemplates: ["subdivision"] }`.
Добавление/исключение:
`add_package_objects` / `remove_package_objects` с `{schemaId,revision,objectIds}`;
удаление схемы: `delete_package_schema({schemaId,revision})`. Во всех именах tools
нужен префикс `wshcm_`. Общий документ перечитывается перед Save; это не atomic CAS
между клиентами. После изменения перечитайте схему для свежей revision.

Добавление и экспорт принимают opt-in `includeCategories`, `includeRelatedObjects`,
`includeFiles`, `includeAssessmentItems`. `includeRelatedObjects` использует штатный
XMD/foreign обход; полной транзитивности нет. Ссылки в `wvars` и строковая связь
`mode` → `web_mode` пока не разрешаются; специальных флагов для них нет.

Лимиты: ZIP 128 MiB, суммарный expanded ZIP 512 MiB, 10000 ZIP entries, depth 2,
XML 32 MiB, до 10000 input objectIds; страницы 1–1000, default 100; transfer chunk
256 KiB. Проверяются пути/descriptor URLs, symlinks, CRC/размеры и вложенные архивы;
ZIP64/encryption и неподдерживаемый формат отклоняются. Это ограничения, не результат
нагрузочной acceptance на максимумах. MCP text ограничен 256 KiB: при сокращении
возвращаются `truncated`, `truncatedFields` и `nextPage` для страниц. Длинные
settings/diagnostics могут сокращаться; полный результат доступен через SDK и
native reports по `reportIds`/`downloadIds`.

Save/delete/add/remove/import имеют mutation annotations; export/inspect —
`readOnlyHint:false, destructiveHint:false` из-за временных побочных эффектов.
Задайте собственный UUID `operationId` до долгого/изменяющего вызова. Handles
`operationId`, `artifactId`, `inspectionId` принимаются в любом регистре и
приводятся SDK к lowercase до lookup/dispatch; результаты используют lowercase.
Native `schemaId`/`packageId` сохраняют регистр.
При timeout запросите `wshcm_get_package_operation({operationId})` на том же target
и аккаунте. SDK errors сохраняют `code/message/phase/status/operationId`, а при
наличии — `lastKnownOperation` и `cleanupError`; generic/validation ошибки тоже
ограничены. Отсутствующий, недоступный или повреждённый receipt даёт
`ReceiptUnavailable`, phase `receipt`, status `unknown`; lookup не восстанавливает
receipt и не повторяет мутацию. `unknown` не означает отсутствие изменений. Автоматических retries,
server cancellation, rollback и distributed exactly-once нет. `completed` с
`verification:"platform_report_only"` сообщает завершение штатного вызова, но не
подтверждает успех каждого объекта; проверяйте отчёты и нужный readback.

### Сведения о стенде

`wshcm_get_system_info({})` возвращает JSON с `summary`:

```json
{
  "summary": {
    "hcmVersion": "2025.2.1333",
    "osVersion": "Ubuntu 24.04.3 LTS",
    "database": { "type": "PostgreSQL", "version": "16.16 (Debian 16.16-1.pgdg13+1)" },
    "unibridgeVersion": "2.25.10.8",
    "runMode": "XHTTP",
    "cluster": false,
    "fullTextIndex": true,
    "personalData": false
  }
}
```

Это пример, не фиксированные значения. Строковые поля nullable; флаги — boolean
или `null`. Отсутствующие поля и неизвестные значения флагов дают `null`.
Вход `{ "includeReport": true }` добавляет `report`: полный исходный текст
из «О программе → Информация о системе», включая INI/XML/Global Settings,
без дополнительной очистки. По умолчанию `includeReport: false`, ключа `report` нет.
Подробные конфигурации пока не преобразуются в формализованный JSON.

Общий SDK один раз вызывает `tools_report.gather_system_info()`; DLL не нужна.
Сводка берётся из заголовка перед первой секцией, CRLF/CR/LF текста защищены
JSON carrier. Отчёт больше 256 KiB UTF-8 отклоняется целиком даже при запросе
сводки. Неподдерживаемый SOAP carrier даёт ошибку. Лимит проверяется после сбора
и не ограничивает стоимость сборщика; автоматических повторов нет.
Это сведения ответившего процесса, без гарантии снимка всего кластера.
Tool помечен readOnly/idempotent; настройки стенда не изменяет.
Native acceptance: Linux C HCM 2025.2.1333 / PostgreSQL 16; другие ОС, версии
и локализации требуют проверки.

### Выполнение серверного BorisScript

`wshcm_execute` принимает `{code}` — библиотечные вызовы, небольшие диагностические
скрипты и проверки поведения платформы. Код — серверный BorisScript, без TS compilation:

```json
{ "code": "print('Checking version'); return tools.get_version('wtv', false);" }
```

Пример ответа:

```json
{
  "ok": true,
  "value": "2025.2.1333",
  "output": ["Checking version"],
  "outputTruncated": false
}
```

`return` задаёт возвращаемое значение. `print(value)` сохраняет строку точно,
для прочих значений использует native `EncodeJson` (`undefined` — текстом),
и возвращает аргумент. Это вывод одного вызова; штатные `alert`/логи библиотек
продолжают писать в журналы HCM. Перехвата общих логов нет.

`print(value)` оставлен как экспериментальный кандидат. Его полезность относительно
возврата результата и чтения штатных логов ещё предстоит проверить на реальных
сценариях; по результатам функция может быть изменена или удалена.

Integer в JSON: безопасный — number, большой — точная decimal string;
real — number с известным ограничением точности платформы. `undefined` на любой
глубине становится `null`. Nonfinite real даёт ошибку `presentation`, сохраняя
собранный вывод. XML/date используют общую проекцию XQuery, без полноценного XML API.

Ошибка разбора/выполнения: `{ok:false,error:{phase:"execution",message},output,outputTruncated}`.
Ошибка преобразования результата имеет phase `result`: код уже выполнился.
Native сообщение сохраняет контекст, насколько его предоставляет платформа,
до 2000 символов. Эти ответы имеют MCP `isError: true` и сохраняют прежний вывод.
Transport/невалидный ответ: `{ok:false,phase:"transport"|"response",executionStatus:"unknown",error:{code,message}}`;
получить диагностику при потерянном ответе не гарантируется. Input schema
отклоняет невалидный запрос до выполнения.

Код — до 64 KiB UTF-8, проекция — depth 32/10000 значений/48000 символов carrier,
диагностика — до 256 целых сообщений/16000 символов JSON-кодированного текста.
При переполнении вывода `outputTruncated: true`, скрипт продолжает работу.
Итоговый JSON — до 256 KiB UTF-8. Эти пределы не ограничивают работу/память кода.

Вызов имеет права подключённого аккаунта, может изменять данные и не ограничен
файловыми readToken; readOnly/idempotent hints равны false, destructive — true.
DLL не требуется. Нет rollback, остановки кода по timeout или автоматического
retry. **Timeout клиента не означает остановку серверного кода.** Перед повтором
проверить фактические эффекты; ошибка результата тоже не отменяет изменений.

### Статус runtime

`wshcm_runtime_status({})` проверяет и при необходимости **устанавливает**
зависимости в `AppDirectoryPath()/dotnetcore/shared/.boristype-runtime/`.
Tool не read-only: может создавать файлы и загружать code. Тот же gate
автоматически выполняется перед каждой файловой операцией.

Status schema 1 содержит `status`, `reason`, `expected`, `installed`, `loaded`,
`changed`, `process` (PID/start/CLR/architecture). Identity содержит
`id/version/apiVersion/buildId`; buildId — MVID, загруженный из памяти.
`ready` допускает файловый вызов. `restart_required` означает, что новая сборка
подготовлена, но процесс использует другую; SDK не перезапускает HCM.
`blocked` — диагностируемое препятствие: API, права, corrupted bytes,
BuildConflict и т.п. Локальная/transport ошибка имеет `process:null`.

Ошибки файлового gate возвращают JSON `{error:{code:"RuntimeNotReady",message},
runtimeStatus:...}`. XQuery/XML не блокируются отсутствующей или старой DLL.
Подготовка не откатывает новую совместимую версию и не перезаписывает mapped DLL.
После перезапуска следующий вызов проверяет состояние снова. Status одного
процесса не подтверждает готовность других узлов; файловый вызов следует за
проверкой отдельным SOAP request. Timeout не отменяет установку.

### XML объектов: форма, чтение, сохранение

По умолчанию XML приходит строкой. С `outputMode: "file"` текст доступен по `file.path`, с `outputPath` можно сразу сохранить его в проекте. Для save и patch с `inputPath` результат по умолчанию тоже файловый. Обратной сборки XML
из JS objects нет. XML escaping (`&amp;`, `&lt;`, quotes в атрибутах) остаётся
обычным правилом XML.

При чтении в строку `wshcm_get_form` получает загруженную платформой форму и возвращает
`{formUrl,root,xml}`, где `xml = FetchForm(formUrl).TopElem.Xml`:

```json
{ "formUrl": "x-local://wtv/wtv_cost_center.xmd" }
```

Проверенные SAMPLE/INHERIT/составные TYPE раскрывает платформа. Это текущая форма
из её cache, не исходный XMD и не гарантия автономной повторной регистрации всех
зависимостей. Поддерживаются локальные `x-local://`/`x-app://` XMD URLs без open
options; удалённые формы и произвольные options не принимаются.

`wshcm_get_object` принимает `{id:"7349586349801536169"}` и возвращает
`{id,formUrl,root,xml,readToken}`. ID в JSON — точная canonical positive decimal
string; JS Number использовать нельзя. Внутри XML платформа может писать integer
как `0x65FE…`; такие значения сравниваются точно и поддерживаются при записи.
«Полный» означает весь экспорт `TopElem.Xml`, без усечения. Это не binary backup:
TEMP/computed поля, external data и нормализация имеют платформенную семантику.

`wshcm_save_object` требует явный режим. Создание:

```json
{
  "mode": "create",
  "formUrl": "x-local://wtv/wtv_cost_center.xmd",
  "xml": "<cost_center><code>example-unique-code</code><name>Example</name></cost_center>"
}
```

Create запрещает входной ID и использует `OpenNewDoc` → `LoadData` → `BindToDb`
→ `Save`. На собственной native форме проверено сохранение значений OnCreate
и заполнение переданных полей. Пользовательский XML заполняет новый документ;
прикладные init hooks других типов этим не аттестованы.

Замена после полного чтения этого же объекта:

```json
{
  "mode": "replace",
  "id": "7349586349801536169",
  "readToken": "<token-from-get-object>",
  "xml": "<cost_center><code>example-unique-code</code><name>Changed</name></cost_center>"
}
```

**Replace полностью заменяет документ: пропущенные поля удаляются либо получают
платформенные defaults.** Форма берётся из существующего объекта; менять её через
payload нельзя. XML ID можно опустить либо передать совпадающее значение.
Для replace создаётся отдельный документ из XML, с привязкой к существующему ID;
`LoadData` существующего объекта как скрытый merge не используется.

Token относится к одному ID в текущем MCP instance, действует 30 минут; хранится
до 32 snapshots. Новое чтение меняет token. Replace расходует grant после входа
в обработчик, включая ошибки XML, конфликты и неизвестный исход; после попытки
нужно перечитать объект. Невалидный MCP input, отклонённый schema до обработчика,
не является попыткой записи. Token из другой MCP instance не подходит;
изоляции чатов внутри одного переиспользуемого instance нет.

Сервер сравнивает прочитанные XML объекта, URL формы и XML раскрытой схемы;
проверка повторяется перед Save. **Это не atomic CAS:** внешний writer может
изменить объект после проверки. Token подтверждает выдачу XML клиенту, не то,
что агент его получил/понял.

Перед Save проверяются синтаксис/один root, root по форме, identity, известные
field paths, singleton cardinality, вложенные теги scalar, mixed content
structure и integer lexical/range. Integer поддерживает decimal/hex,
signed int64 и unsigned XML representation до uint64 max. DTD/entity definitions,
неизвестные entities, произвольные PI и атрибуты данных запрещены. Допустимы
XML declaration, CDATA, стандартные/numeric entities и совпадающий root
`SPXML-FORM`. Остальные scalar types проходят native conversion: неверное
значение может быть нормализовано/отброшено платформой. Полной валидации XMD,
foreign/PRIMARY-KEY и бизнес-правил нет.

Input XML, output XML и schema XML ограничены 256 KiB UTF-8 каждый; input depth
64 и до 8192 элементов, внутренний запрос с проверочными путями до 2 MiB.
Большое чтение отклоняется целиком, token не выдаётся. Limits не ограничивают
работу платформы до получения XML, callbacks и общую стоимость загрузки.

Успех Save возвращает `{id,formUrl,root,xml,writeStatus:"saved"}` после отдельного
readback. Ошибка содержит `error`, `phase`, `writeStatus` и известный ID:

| writeStatus     | Значение                                                             |
| --------------- | -------------------------------------------------------------------- |
| `not_attempted` | До вызова Save; загрузка/инициализация формы уже могли выполнить код |
| `unknown`       | Save мог начаться/завершиться, но достоверного подтверждения нет     |
| `saved`         | Save завершился; ошибка относится к последующему readback/ответу     |

Save/hooks могут иметь частичные эффекты. Rollback, cancellation, UI permissions
и эквивалентность XMS-сценария не гарантируются; автоматических повторов нет.
После неизвестного исхода сначала установить фактическое состояние по ID либо
уникальному коду созданного объекта. Удаление и bulk API пока отсутствуют.

[Native acceptance для create/replace](https://github.com/BorisType/BorisType/blob/main/refs/research/mcp/10-object-model/first-implementation.md).

### Частичное редактирование XML

Получите свежий `readToken` через `wshcm_get_object({id})`. Укажите только поля,
которые нужно изменить. Пример меняет имя `cost_center`, сохраняя его код,
комментарий и массивы.

```json
{
  "id": "7349586349801536169",
  "readToken": "<token-from-get-object>",
  "xml": "<cost_center><name>Changed</name></cost_center>",
  "dryRun": true
}
```

`dryRun` по умолчанию `false`. После каждой попытки, дошедшей до обработчика,
нужен новый полный read. Preview, no-op, XML error и conflict тоже расходуют
token. Не прошедшие schema validation аргументы до SDK-обработчика не доходят.
Форма выбирается существующим объектом. ID в XML можно опустить или подтвердить
точным значением. `SPXML-FORM` на корне должен совпасть с actual form URL.

`bt-mode` — управляющий атрибут patch, его значения чувствительны к регистру и
в сохранённый XML не переносятся. По умолчанию структура объединяет только
переданные поля. Для структуры `replace` заменяет содержимое, `clear` очищает его.
Для scalar `replace` означает присваивание, `clear` сбрасывает значение. Пустой
`clear` может восстановить XMD default. На корне допустим только merge.

Для массива с ключом явно укажите непустой ключ в каждом редактируемом элементе.
В примере `theme` обновляется или добавляется, `region` заменяется целиком,
`obsolete` удаляется без ошибки, если его уже нет.

```xml
<cost_center>
  <custom_elems>
    <custom_elem><name>theme</name><value>blue</value></custom_elem>
    <custom_elem bt-mode="replace"><name>region</name><value>west</value></custom_elem>
    <custom_elem bt-mode="remove"><name>obsolete</name></custom_elem>
  </custom_elems>
</cost_center>
```

Неперечисленные элементы остаются на своих местах, новые добавляются в конец.
Неоднозначное сопоставление существующих ключей и дубликаты во входе отклоняются.
`remove` принимает только ключ. Чтобы заменить весь контейнер, передайте
`<custom_elems bt-mode="replace">…</custom_elems>`; пустой
`<custom_elems bt-mode="clear"/>` его очистит. Чтобы заменить только одноимённую
группу массива, поставьте `bt-mode="replace-array"` на её первый элемент и
перечислите весь новый состав по порядку. Остальные элементы группы идут без
`bt-mode`. Такой replace допускается и для исправления старых дубликатов
ключа, с обязательными уникальными ключами в новом составе.

Для массива без ключа перечисление уже означает полную замену. Например,
для формы с unkeyed `tag MULTIPLE` фрагмент `<tag>blue</tag><tag>green</tag>`
задаёт ровно два элемента, `<tag/>` — один пустой. Явные `merge` и `remove`
отклоняются. Единственный пустой `<tag bt-mode="clear"/>` очищает массив.
Для keyed-массива такой же пустой placeholder очищает его целиком.

Patch присваивает XML scalar types string, integer, bool, real и date.
Binary, TEMP и методы исключены. Для integer сохраняется точность decimal/hex;
real использует native точность. Date сохраняет календарные компоненты платформы.
Дату без времени передают в виде `YYYY-MM-DD`. Для `YYYY-MM-DDTHH:mm:ss`
с точностью до целой секунды допустимы отсутствие суффикса, `Z` или нулевое
числовое смещение. Ненулевая дробь и ненулевое
смещение отклоняются. Для годов 1–999 можно повторно применить полное native
написание, например `1-01-02T12:34:56+00:00`. Смещение `+00:00` в native XML
не определяет UTC instant. [Измерения Date и IsChanged](https://github.com/BorisType/BorisType/blob/main/refs/mcp/xml-object-patch.md#основания-date-и-ischanged).

Действуют лимиты 256 KiB UTF-8 на XML и 256 KiB на схему, глубина 64, 8192
входных элементов, 2 MiB на внутренний запрос вместе с patch metadata.
Patch работает с существующим объектом, без создания, смены формы или ID,
загрузки binary/external data и автоматических повторов.

Результат содержит `id`, `formUrl`, `root`, `xml`, `changed`, `dryRun` и
`writeStatus`. `changed` сравнивает кандидат с предыдущим persistent XML перед
Save. При preview `xml` содержит кандидат, `writeStatus` равен `not_attempted`.
При no-op `changed: false`, Save и его hooks пропускаются. Изменённый apply
вызывает Save один раз и возвращает фактический readback, который могут изменить
hooks. Подтверждение Save сохраняется даже при ошибке readback. Снимок XML,
формы и схемы перепроверяется перед Save или успешным preview/no-op. Внешний
writer может изменить документ между проверкой и записью. Загрузка формы и
присваивания могут выполнять platform code даже при `not_attempted`.

[Полный контракт и границы](https://github.com/BorisType/BorisType/blob/main/refs/mcp/xml-object-patch.md).

### Реестр типов объектов и каталогов

`wshcm_list_object_types` возвращает `{total,offset,limit,items,sources}`.
Параметры `offset` и `limit` по умолчанию равны 0 и 100, максимальный размер
страницы 250. Передайте `kind: "object"` или `kind: "catalog"`, чтобы
читать только один реестр. При общем запросе сначала идут типы объектов,
затем каталоги. Порядок внутри каждого реестра определяется именем и URL формы.

Запись содержит `kind`, `name`, `isCustom` и доступные метаданные
`title`, `formUrl`, `isHier`, `supportsCustomFields`. Объекты берутся из
`common.exchange_object_types`, включая зарегистрированные `cc_*`. Каталоги
берутся из `DefaultDb.GetRegisteredCatalogs()`. Поэтому, например,
`cost_center` и `cost_centers` имеют отдельные записи. Каталог может
представлять производную проекцию. В записи каталога `objectType` содержит
тип документа из `XmlForm.ObjectName`. Значение `null` означает, что HCM не
объявляет для каталога собственного типа документа. Поля нет, когда сборка
не предоставляет это свойство. Передайте `{ "objectType": "cost_center" }`,
чтобы получить точный тип и все каталоги, которые HCM связал с ним.

`supportsCustomFields` показывает наличие контейнера `custom_elems` в XMD
документа. Используйте `formUrl` для `wshcm_get_form` и код каталога для
`wshcm_xquery`. Чтобы узнать настроенные поля или шаблоны, вызовите
`wshcm_get_custom_field_definitions`.

`sources` содержит статусы `exchangeObjectTypes` и `registeredCatalogs`.
`not_requested` означает, что источник исключён фильтром. На сборке без
`GetRegisteredCatalogs` второй статус будет `unavailable`. Лимиты
составляют 4096 записей на источник и 256 KiB UTF-8 на страницу.

### Типы данных объектов

`wshcm_list_object_data_types({})` возвращает страницу справочника
`object_data_types`. `{objectType: "subdivision"}` находит типы данных,
где подразделение указано на любой стороне. Если оно указано на обеих,
тип данных возвращается один раз. `primaryObjectType` и
`secondaryObjectType` задают точную сторону. Все переданные фильтры
применяются вместе.

Ответ содержит `items`, `total`, `offset` и `limit`. В строке есть
`id` точной десятичной строкой, `code`, `name` и
`primaryObjectType` и `secondaryObjectType` со значением `null` для
ненастроенной стороны. Порядок по названию и ID. По умолчанию `offset: 0`
и `limit: 100`, максимум 250 строк или 256 KiB. `total` считается
после фильтрации, до разбиения на страницы.

Чтобы прочитать поля и страницы одного типа данных, используйте
`wshcm_get_custom_field_definitions` с
`scope: { objectType: "object_data_type", templateId: id }`.
Для поиска записей этого типа выполните `wshcm_xquery` по каталогу
`object_datas` с условием на `object_data_type_id`.

### Настраиваемые поля

Если область уже известна, вызовите `wshcm_get_custom_field_definitions`
с `scope`. Для общих полей подразделения передайте
`{"scope":{"objectType":"subdivision"}}`. Для шаблона формы заявки
передайте `{"scope":{"objectType":"request_type","templateId":"6405466310999430311"}}`,
подставив точный десятичный ID существующего типа заявки. Ответ содержит
`fields`, `pages` в порядке HCM, `fieldTypes`, `exists` и `revision`.
Чтение ненастроенного шаблона возвращает `exists: false` и пустые списки.

Чтобы найти шаблон, вызовите тот же инструмент с
`{"mode":"list","objectType":"request"}`. Для заявки ответ содержит
`templateType: "request_type"` и `templateSelector: "request_type_id"`.
В `templates` находятся зарегистрированные шаблоны, включая пустые.
Каждая строка содержит `templateId`, `fieldCount`, `pageCount` и доступное
название `title` длиной до 256 символов. `common` содержит счётчики
общей области или `null`, если её нет. `offset` по умолчанию 0,
`limit` — 50, максимум 100. `total` относится к текущему реестру.
Между запросами страниц реестр может измениться.

Для выбранной строки передайте `templateType` в `scope.objectType` и
`templateId` в `scope.templateId`. Берите тип из списка, поскольку
код раздела шаблонов может отличаться от корня XML владельца.
При чтении `scope` проверяется существование записи владельца.
В списке могут встречаться записи с устаревшей ссылкой на владельца;
их можно использовать для диагностики реестра.
Если работаете с существующей заявкой,
нужный ID лежит в поле `request_type_id` из `wshcm_get_object`.
Возьмите его точное десятичное представление, если XML показывает ID в hex.
Ревизию для правки даёт чтение `scope`. Инструмент правки значений
конкретного документа использует XML и readToken из чтения объекта.

Правки идут в порядке `operations`. Используйте ревизию из чтения той же
области в текущем экземпляре MCP. Пример предварительного просмотра:

```json
{
  "scope": { "objectType": "subdivision" },
  "revision": "<revision из чтения>",
  "dryRun": true,
  "operations": [
    { "op": "upsertPage", "id": "details", "set": { "title": "Детали" } },
    { "op": "upsertField", "name": "office", "set": { "title": "Офис", "type": "string", "pageId": "details" } },
    { "op": "moveField", "name": "office", "before": "is_department" }
  ]
}
```

Доступны `upsertField`, `renameField`, `moveField`, `removeField` по
`name` и `upsertPage`, `movePage`, `removePage` по `id`. Upsert
добавляет в конец или меняет на месте. Для move нужен один из `before`
или `after`. `renameField` принимает `newName` и меняет ключ определения
на месте. Значения и ссылки на старый ключ в условиях мигрируются
отдельными правками. Значения на конкретном объекте записывайте через
`wshcm_patch_object`.

У `upsertField.set` доступны следующие настройки.

| Настройки                                  | Свойства                                                |
| ------------------------------------------ | ------------------------------------------------------- |
| Основные                                   | `title`, `type`, `required`, `showOnPortal`, `pageId`   |
| Варианты для `combo` и `list`              | `options`                                               |
| Ссылка `foreign_elem`                      | `catalog`, `catalogFilter`                              |
| Подсказка, проверка и подстановка значения | `comment`, `validationCondition`, `defaultValueFormula` |
| Оформление                                 | `width`, `height`, `visualClass`, `maxChars`            |
| Правила видимости                          | `visibilityConditions`                                  |

Формула и условие верности сохраняются как текст. Когда их использует
HCM, в условии верности доступно `oValue`, в формуле — `GEnv.curUser`
и `GEnv.curObject`. Фильтр каталога — XQuery-условие для выбора
ссылки, например `"$elem/is_dismiss = false()"`. Размеры и `maxChars`
передаются строками, как в форме HCM.

`visibilityConditions` заменяет список правил в указанном порядке.
Например, `[{ "field": "status_id", "type": "string", "operator": "eq", "value": "active" }]`.
`field` — нативное имя или путь к полю. Для настраиваемого поля
передайте его ключ и `isCustomField: true`. HCM использует коды
операторов `eq`, `neq`, `gt`, `lt`, `gte`, `lte`, `cn`, `ncn`.
Для нескольких правил есть `join: "and"` или `"or"` и парные
`bracket: "("` и `")"`. Дополнительные свойства строки —
`title`, `topElement`, `isMultiple` и `values`. `values` переносит
нативный список `value_multiple`. Для проверки видимости HCM использует
`value`, в том числе для «содержит» у множественного поля. Значения
условий передаются строками, в том числе числа, даты и идентификаторы.
Одна запись `visibilityConditions` принимает до 256 правил и до 256
элементов `values` в каждом правиле.

У `upsertPage.set` можно независимо менять `title`, `accessRole`
и `accessGroupId`. Правка ограничений и удаление защищённой страницы
или содержащего её шаблона доступны роли HCM `admin`.
Указывайте код существующей роли и точный десятичный ID существующей
группы строкой. Для обычного пользователя веб-админки заданные роль и
группа должны совпасть одновременно. Администратор видит все страницы.

Пропущенные свойства сохраняются. `null` очищает расширенную текстовую
настройку или ограничение доступа, `[]` очищает `options` или
`visibilityConditions`. Чтение опускает незаданные расширенные
настройки. Для удаления страницы снимите все привязки в той же пачке,
например через `pageId: null`.

`{ "op": "removeTemplate" }` удаляет из реестра весь шаблон, выбранный
через `scope.templateId`, вместе с его полями и страницами. Это действие
соответствует удалению строки на экране «Настраиваемые поля → Тип заявки».
Запись типа заявки и значения в карточках заявок остаются в каталоге и
документах. После удаления чтение шаблона вернёт `exists: false`.
Общие определения правятся операциями над отдельными полями и страницами.

Ревизия относится ко всему реестру. Если его изменила другая операция или
админка, прочитайте область снова. `dryRun` и no-op возвращают
`writeStatus: "not_attempted"` без Save. Сохранённая правка возвращает
`"saved"`, новую ревизию и свежую конфигурацию. При потере ответа статус
`"unknown"` требует перечитать конфигурацию перед повтором. При
`CacheMismatch` кэш и сохранённый документ расходятся, нужна сверка на
стороне HCM. Сравнение
перед сохранением выполняется отдельно от Save. Процесс проверяет общий
кэш и свежеоткрытый документ, кластерный сценарий отдельно не проверялся.

### Удаление объекта

`wshcm_delete_object({id,readToken})` принимает точный десятичный ID и
токен из полного чтения документа через `wshcm_get_object`. Сервер расходует
токен, повторно сравнивает XML документа и формы и вызывает штатное
`DeleteDoc(url, false)`. Ответ `{id,mode:"trash",deleteStatus:"deleted"}`
подтверждает вызов перемещения в корзину HCM. Сравнение и удаление идут
последовательно. Очистка связанных данных и бинарных ресурсов зависит от
платформы и прикладных сценариев.

При ошибке `deleteStatus: "not_attempted"` означает, что вызов удаления
ещё не выполнялся. При `"unknown"` проверьте наличие документа в основном
каталоге и корзине перед повтором. Для нового вызова перечитайте документ.

### Запуск серверного агента

`wshcm_run_agent` запускает существующий BorisScript-агент по `agentId` на
standalone HCM. `objectId` передаётся как `OBJECT_ID`, `objectIds` как
`OBJECTS_ID_STR`. Значения идентификаторов передаются точными десятичными
строками. `params` содержит строковые значения объявленных параметров,
которые подставляются на один запуск.

Режим `async` по умолчанию возвращает `{agentId,status:"accepted"}`.
`mode: "sync"` ждёт завершения потока до `waitTimeoutMs` (по умолчанию
5000, от 1 до 20000 мс) и возвращает `ended` или `wait_timeout`.
`ended` подтверждает завершение потока. Успех прикладной работы проверяется
по эффектам агента. Окончание ожидания или разрыв связи не отменяют запуск.
Ошибки сохраняют `agentId`, фазу и `executionStatus` со значением
`not_started` или `unknown`. При неизвестном исходе проверьте эффекты перед
новым запуском.

### Серверный XQuery и SQL

`wshcm_xquery` принимает `query` и optional `maxRows` (по умолчанию 100, от 1 до 1000):

```json
{ "query": "for $elem in collaborators where $elem/id = 123 return $elem", "maxRows": 10 }
```

```json
{ "query": "sql: SELECT 1 AS n", "maxRows": 10 }
```

Текст запроса передаётся без изменений в `XQuery` существующим серверным evaluator.
`sql:` разрешён; отдельной SQL tool и фильтрации DML/DDL сейчас нет. Инструмент
**не гарантирует чтение, идемпотентность или откат**. Запросы с побочными эффектами
могут изменить данные даже при ошибке либо потере ответа. Автоматических повторов
нет; после неизвестного исхода не следует слепо повторять запрос.

Ответ — JSON с `rows`, `returnedRows`, `truncated` и `limitReason` (`null`, `rows`
или `output`). Число строк относится к выданному ответу, не ко всему результату.
Читается диапазон до `maxRows + 1`, без подсчёта исходного результата. Для ограничения
вывода внутренний carrier строк суммарно ограничен 65000 символами; выдаются только
целые строки. Весь текст ответа ограничен 256 KiB UTF-8. Первая слишком большая
строка даёт пустой `rows`, `truncated: true`, `limitReason: "output"`.

MCP использует общий `Evaluator.xquery` из ws-client. XML проецируется на сервере
в обычные записи/массивы по фактическим типам полей. Integer-поля проходят через
SOAP как `bigint`, real как `number`; строковые CR/LF защищены. Даты становятся
ISO-строками через native `EncodeJson`; дубликаты имён становятся массивами,
schema multi сохраняет singleton-массив. Глубина до 32 и 10000 projected values;
превышение этих пределов даёт ошибку.

JSON-политика MCP: integer в диапазоне `[-9007199254740991, 9007199254740991]`
выдаётся JSON number, больший по модулю — точной decimal string. Обычный
`JSON.parse` сохраняет такие ID. Nonfinite real (`NaN`, `Infinity`, `-Infinity`)
даёт явную ошибку; `-0` становится `0`. Undefined-поля пропускаются, элементы
массива undefined становятся null по правилам JSON. Native SOAP-форматирование
real может округлять: `1.2345678901234567` → `1.2345678901` на проверенном runtime.
Прямой ws-client сохраняет единый bigint-контракт независимо от размера integer.
На проверенном Linux C/PG runtime отрицательные SQL integer, включая `-7`, уже
пусты в XML-результате и выдаются как `null`; приведение к тексту в самом SQL
сохраняет знак, например `CAST(-9007199254740993 AS VARCHAR(32))`.
SQL `NULL` без явного типа и `''` оба получены как `""`. Эти потери происходят
до MCP и не устраняются выбором JSON encoder.
Запрос ограничен 64 KiB UTF-8, должен быть непустым, без NUL и lone surrogates;
произвольные platform options вроде `lds-server` не принимаются.

Лимиты строк/вывода **не ограничивают стоимость запроса или память сервера**:
материализуется ограниченный диапазон, а отдельная строка проецируется до проверки
размера. HTTP timeout только прекращает ожидание; отмена работы в БД не гарантируется.
SQL использует диалект и права текущей БД платформы. Серверный вызов не требует
включать клиентский `ALLOW-SQL-REMOTE-QUERIES`; инструмент не меняет конфигурацию
WebSoft. Ограничения клиентского LDS-вызова не переносятся на наш серверный evaluator.

Источники API и сверка declarations с native:
[матрица и границы ws-client](../../docs/reference/ws-client-values.md),
[XQuery](https://wshcm-docs.boristype.dev/news/platform/7143925311248265325.html),
[клиентское ограничение SQL](https://wshcm-docs.boristype.dev/news/monolith/7203696059885836448.html).
Поддержка серверного `sql:` без дополнительных клиентских флагов — уточнение
пользователя. Native acceptance прошёл 2026-11-07 на Linux HCM 2025.2.1333 /
CLR 9.0.11 / PostgreSQL 16 без изменения настроек SQL. Это проверка текущего
стенда, не всех версий/конфигураций. [Результаты и ограничения](https://github.com/BorisType/BorisType/blob/main/refs/research/mcp/09-xquery-native.md).

### Чтение и разрешённые изменения

`wshcm_read_file` принимает path и optional startLine/endLine, 1-based inclusive:

```json
{ "path": "x-local://wt/web/app.bs", "startLine": 10, "endLine": 30 }
```

Ответ JSON содержит apiVersion=2, content, sha256 исходных bytes, bom, readToken,
startLine/endLine/totalLines, startOffset/endOffset/totalLength. Offsets — UTF-16,
half-open после удаления одного BOM. CRLF, CR и LF сохраняются; newline входит
в строку. Пустой файл и завершающая пустая строка считаются строками. End ограничен
концом файла; start за концом — ошибка. Даже диапазон требует файл <=1 MiB.

Каждое чтение возвращает **новый readToken**, отменяя предыдущий для этого URL.
Чтобы накопить несколько диапазонов одной версии, передать предыдущий readToken
в следующий read_file; без него подтверждается только новый диапазон. Если hash
изменился, старое покрытие не переносится. URL aliases требуют отдельного чтения.

Edit и overwrite разрешаются только по token из этого экземпляра MCP. Состояние
ограничено 128 файлами, 256 объединёнными диапазонами на файл и 30 минутами после
последнего чтения. Eviction/expiry требуют нового чтения; edit не продлевает TTL.
Search, get-info и preview не предоставляют дополнительных разрешений.

**Изоляция чатов агента не гарантируется**, если клиент переиспользует один MCP
server между разговорами. Выдача текста клиенту не доказывает, что модель его
получила или осмыслила. Это политика этих tools, не sandbox против прямого SOAP
или намеренного delete/create.

### Точечное редактирование

В `wshcm_edit_file` передать readToken из последнего чтения и до 100 замен:

```json
{
  "path": "x-local://wt/web/app.bs",
  "readToken": "token-from-read-file",
  "edits": [{ "oldText": "var count = 1;", "newText": "var count = 2;" }],
  "dryRun": true
}
```

Каждый непустой oldText должен встретиться ровно один раз в промежуточном тексте,
полностью внутри прочитанного покрытия. Overlapping matches неоднозначны.
После каждой замены известные диапазоны сдвигаются, newText считается известным.
Ошибка любого patch оставляет файл без частичных изменений. Missing/чужой token
или непрочитанный участок — ReadRequired; устаревшие bytes — Conflict.

MCP сам передаёт DLL сохранённый hash и диапазоны. Optional expectedSha256 —
дополнительное ограничение клиента, не замена token. Ответ JSON: apiVersion,
status applied/dry_run/unchanged, editsCount, previousSha256, sha256 и content
только для dryRun. Preview не пишет и не расходует token; полное preview-содержимое
не расширяет подтверждённое покрытие. Любая допущенная попытка edit без dryRun,
включая no-op и ошибку, расходует token: для следующей правки перечитать файл.

### Запись, каталоги, перемещение и metadata

Write по умолчанию `mode: "create"`: существующее назначение даёт AlreadyExists.
`mode: "overwrite"` требует readToken с полным покрытием файла. При этой попытке
и при delete token URL инвалидируется даже при неизвестном исходе transport.
Create-only не принимает readToken. Parent должен существовать.

Create-directory создаёт missing parents; existing directory — created=false.
Файл по этому пути — ошибка. Создание цепочки не транзакционно.
Get-info возвращает name/isDirectory/modifiedUtc и sizeBytes только для файла;
поддерживает binary/large files без text read и read-token.
Move принимает source/destination URLs, требует существующий parent и никогда
не заменяет назначение. Native Linux renameat2/Windows MoveFileExW не используют
copy/delete fallback; cross-filesystem move даёт CrossDevice. Другие ОС и
неподдерживаемые filesystem operations явно отвергаются. Source/destination
токены инвалидируются. Delete удаляет только файл, никогда каталог; предварительное
чтение текста для delete/move не требуется.

Текст — strict UTF-8, NUL/invalid encoding отвергаются. Write создаёт UTF-8 с BOM,
edit сохраняет исходный BOM и unaffected whitespace/newlines. Файл/result <=1 MiB,
JSON request/response <=8 MiB, listing <=10000 entries. List ordinal и отмечает
links, не обходит их; file root — ошибка. IO paths/ancestors с symlink/junction
отвергаются, VFS и special files не аттестованы.

Write/edit используют temp рядом с target, flush и rename; edit/overwrite повторно
сравнивают исходные bytes перед commit. **Атомарный compare-and-replace относительно
внешних процессов не гарантируется:** между проверкой и rename остаётся окно.
Новые Unix файлы имеют mode 0600 с учётом umask; existing rwx сохраняются,
owner/ACL/inode/hardlinks — без гарантии. Ошибка доставки ответа не откатывает commit.
Подробный [контракт](https://github.com/BorisType/BorisType/blob/main/refs/dotnet/files-and-read-grants.md).

### Поиск

`wshcm_search_files` использует ту же автоматически подготавливаемую
`BorisType.FileSystem.dll` версии `0.1.0-alpha.4` / API 2 из ws-client.
[Подготовка и версия CLR](https://github.com/BorisType/BorisType/blob/main/docs/guides/dotnet.md).
BS разрешает `x-local://` через `UrlToFilePath`, C# получает абсолютный физический
каталог и не вызывает Datex обратно.

Пример arguments для поиска содержимого:

```json
{
  "path": "x-local://wt/web/",
  "pattern": "**/*.bs",
  "excludePatterns": ["vendor/**"],
  "query": "needle",
  "ignoreCase": true
}
```

Без `query` ищутся только имена, без чтения файлов. Globs поддерживают `*`, `?`
и целый segment `**`; pattern без `/` сопоставляется с basename на любой глубине.
Имена всегда сравниваются с учётом регистра. Query по умолчанию literal;
`regex: true` включает .NET regex по отдельным строкам с match timeout 50 ms.
Содержимое должно быть строгим UTF-8, допускается начальный BOM. Бинарные файлы,
неверная кодировка и слишком длинные строки пропускаются со счётчиками.

Ответ JSON содержит `root`, `matches`, `apiVersion`, `limitReason`, `stats` и
`skipped`. Match содержит относительный `path`; для содержимого также `line`,
`column` (1-based, UTF-16) и `text` без newline. `/` — единственный разделитель
segments; допустимые на Linux backslash и colon сохраняются как данные имени.
Не разрешать такие paths средствами ОС MCP-клиента.

Default limits: 200 hits, 10000 entries, depth 10, 1 MiB/file, 16 MiB/read,
2000 ms и 2000 UTF-16 units/line. Финальный JSON ограничен 256 KiB.
`limitReason != null` или ненулевые `skipped` означают ограниченный охват,
включая случай пустого `matches`. Links/junctions не обходятся; root и ancestors
с reparse points отвергаются. Timeout cooperative и не прерывает зависший syscall.
Обычные стабильные файлы — текущая граница поддержки; TOCTOU sandbox не обещается.
Все options, hard maxima и точный контракт — в
[спецификации](https://github.com/BorisType/BorisType/blob/main/refs/dotnet/search.md).

### URL-модель

Tools принимают серверные `x-local://` адреса для преобразования в физический путь:

```
x-local://wt/web/app.bs          — файл в директории wt/web/
x-local://wt/web/                 — директория
x-local://wt/myapp/src/index.bs   — файл проекта
```

Результат `UrlToFilePath` используется для прямого System.IO. Это **операции
с диском**, которые не воспроизводят storage routing `LoadUrlData`/`PutUrlData`.
Например, на Linux HCM 2025.2.1333 `x-local://wt_data/...` с SQL hook читал
`spxml_blobs`, пока физический файл того же адреса содержал другие байты.
Изменение/удаление дискового файла не изменяет blob; readToken/hash покрывают
только диск. Для логических URL/blob ресурсов нужны отдельные операции.
[Проверка и границы](https://github.com/BorisType/BorisType/blob/main/refs/research/dotnet/15-url-storage-routing-research.md).

## Конфигурация

### Параметры подключения

Параметры можно передать через CLI-аргументы или переменные окружения (CLI приоритетнее):

| CLI аргумент                   | Env переменная   | Описание                                              | По умолчанию                     |
| ------------------------------ | ---------------- | ----------------------------------------------------- | -------------------------------- |
| `--host`                       | `WSHCM_HOST`     | Хост сервера                                          | `localhost`                      |
| `--port`                       | `WSHCM_PORT`     | Порт сервера                                          | `80`                             |
| `--username`                   | `WSHCM_USERNAME` | Имя пользователя                                      | `user1`                          |
| `--password`                   | `WSHCM_PASSWORD` | Пароль                                                | `user1`                          |
| `--https`                      | `WSHCM_HTTPS`    | Использовать HTTPS                                    | `false`                          |
| `--package-artifact-directory` | —                | Абсолютный каталог локальных ZIP и метаданных         | `~/.boristype/package-artifacts` |
| `--shared-directory`           | —                | Общий каталог ZIP и XML на машине MCP                 | `~/.boristype/shared`            |
| `--project-directory`          | —                | Запасной корень проекта при отсутствии корней клиента | —                                |
| `--connection-timeout-ms`      | —                | Deadline setup/probe на HTTP-запрос                   | `5000`                           |

### VS Code

Добавьте в `.vscode/mcp.json`:

```json
{
  "servers": {
    "wshcm": {
      "command": "boristype-mcp",
      "args": ["--host", "localhost", "--port", "80", "--username", "admin"],
      "env": {
        "WSHCM_PASSWORD": "secret"
      }
    }
  }
}
```

Или полностью через env:

```json
{
  "servers": {
    "wshcm": {
      "command": "boristype-mcp",
      "env": {
        "WSHCM_HOST": "localhost",
        "WSHCM_PORT": "80",
        "WSHCM_USERNAME": "admin",
        "WSHCM_PASSWORD": "secret"
      }
    }
  }
}
```

### Claude Desktop

Добавьте в `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "wshcm": {
      "command": "boristype-mcp",
      "args": ["--host", "localhost", "--port", "80", "--username", "admin"],
      "env": {
        "WSHCM_PASSWORD": "secret"
      }
    }
  }
}
```

## Разработка

```bash
# Из корня monorepo: сборка MCP и ws-client
pnpm --filter @boristype/mcp-server... build

# Локальные tests, без подключения к HCM
pnpm --filter @boristype/mcp-server --filter @boristype/ws-client test

# Реальный tarball: ресурсы, import, CLI help/version
# Использует workspace dependencies и системный tar; это не fresh install из registry.
pnpm --filter @boristype/mcp-server test:pack

# Inspector из lockfile (эта команда подключается к указанному HCM)
pnpm --filter @boristype/mcp-server inspector --host localhost --port 80 --username admin --password secret
```

`createServer(connection)` создаёт MCP server без открытия транспорта и HCM
connection; вызывающий код управляет их lifecycle. `startServer(options)`
запускает stdio и готовит HCM при первой операции, которой он нужен.
Обе функции принимают опцию `packageArtifactDirectory`: у
`createServer(connection, options)` она находится во втором аргументе.
`createConnection(options)` выполняет подключение сразу, а
`closeConnection(connection)` отвечает за очистку этой библиотеки.

### E2E на установленном локальном Docker-стенде

Из корня репозитория, на Linux Docker host с уже запущенным стендом:

```bash
pnpm --filter @boristype/mcp-server... build
WSHCM_E2E_CONTAINER=boristype-c-runtime-net9-wt-1 \
WSHCM_E2E_USERNAME=user1 WSHCM_E2E_PASSWORD=user1 \
pnpm --filter @boristype/mcp-server test:e2e
```

`user1/user1` — учётные данные только текущего изолированного demo-стенда.
Для другого локального стенда передать его credentials через environment.
E2E использует отдельные `WSHCM_E2E_*` переменные, определяет текущий IP контейнера,
подключается к порту 80 и отключает Node environment proxy только в дочернем CLI.
File e2e вызывают `wshcm_runtime_status`, автоматически подготавливают bundle
из ws-client и сверяют installed SHA256 и loaded MVID. При `restart_required`
серия останавливается; HCM автоматически не перезапускается. Пути fixtures
ожидаются под `/WebsoftServer/wt`. На Docker Desktop прямой IP
контейнера может быть недоступен; такой маршрут этим запуском не проверялся.

Тесты создают отдельный `x-local://wt/mcp-e2e-<UUID>/`, сравнивают реальные байты
через Docker, проверяют чтение/запись/перезапись/list/delete, ошибки и cleanup
после EOF, SIGTERM и SIGINT. Нужен эксклюзивный доступ к стенду на время запуска.
Они выполняются последовательно и прекращают native серию после первой ошибки.
Ошибка очистки проваливает тест; fallback может удалить только однозначно
определённую библиотеку этого запуска, никогда маску `unsafe_eval_*`.
Без параметров стенда команда завершается ошибкой, а не успешным skip.

Обычный `test` и CI не подключаются к HCM. E2E не скачивает, не разворачивает
и не перенастраивает стенд. Evidence и platform workarounds:
[local e2e report](https://github.com/BorisType/BorisType/blob/main/refs/research/mcp/04-local-e2e.md).

С теми же environment variables отдельно выполнить `test:e2e:edit` и
`test:e2e:read-aware`: второй проверяет диапазоны/чужой token/stale bytes,
guarded overwrite и mkdir/info/binary rename. Текущие результаты всех серий —
в [отчёте alpha.4](https://github.com/BorisType/BorisType/blob/main/refs/research/dotnet/13-read-aware-files-results.md).

Поиск имеет отдельную acceptance-команду с той же автоматической подготовкой
DLL и проверкой identity:

```bash
WSHCM_E2E_CONTAINER=boristype-c-runtime-net9-wt-1 \
WSHCM_E2E_USERNAME=user1 WSHCM_E2E_PASSWORD=user1 \
pnpm --filter @boristype/mcp-server test:e2e:search
```

Она создаёт своё ограниченное дерево, проверяет имена/содержимое/Unicode/newlines,
exclusions, links, binary, result limit, regex и quoted path/query через настоящий
CLI/stdio/SOAP/DLL, затем проверяет cleanup. Не запускает стенд; SDK автоматически подготавливает
DLL. Native test прошёл 2026-11-06 на Linux HCM 2025.2.1333 / CLR 9.0.11;
Windows, другие версии и полный path/permissions contract требуют своих проверок.

Targeted edit проверяется отдельно на том же запущенном стенде:

```bash
WSHCM_E2E_CONTAINER=boristype-c-runtime-net9-wt-1 \
WSHCM_E2E_USERNAME=user1 WSHCM_E2E_PASSWORD=user1 \
pnpm --filter @boristype/mcp-server test:e2e:edit
```

Проверены BOM/no-BOM, metadata SHA256, preview/apply, stale hash, ambiguous и
missing second edit без частичной записи, invalid UTF-8/NUL, link policy и cleanup.
Native команды не запускают стенд; общий SDK автоматически подготавливает DLL.

XQuery имеет отдельную команду с теми же `WSHCM_E2E_*` переменными:

```bash
pnpm --filter @boristype/mcp-server test:e2e:xquery
```

Она не требует BorisType DLL, не меняет данные БД и проверяет catalog XQuery,
`sql: SELECT`, Unicode/кавычки/control escapes, большие целые и SQL text cast,
row/output limit, большие CJK/emoji ответы, ошибки и cleanup evaluator.
Output acceptance использует PostgreSQL `repeat`/`generate_series`. Команда требует
уже запущенный эксклюзивный локальный стенд. На Linux HCM 2025.2.1333 / CLR 9.0.11
после перехода на общий typed adapter прошли 12/12 Node tests (11 сценариев и parent),
включая safe integer/real, необычные aliases и nonfinite errors, без skips. Большие ответы выявили
и помогли исправить UTF-8 decoding на границах HTTP chunks в ws-client.
Windows HCM, MSSQL, другие версии и полный контракт типов требуют отдельных проверок.
[Native отчёт](https://github.com/BorisType/BorisType/blob/main/refs/research/mcp/09-xquery-native.md).

XML objects имеют отдельную acceptance-команду с теми же `WSHCM_E2E_*`:

```bash
pnpm --filter @boristype/mcp-server test:e2e:objects
# Existing stand only; WSHCM_HOST/PORT/USERNAME/PASSWORD + WSHCM_PACKAGE_CONTAINER
pnpm --filter @boristype/mcp-server test:e2e:packages
```

BorisType DLL не требуется. Команда создаёт собственный `cost_center`, проверяет
form/create/read/full replace, плохие XML без изменения объекта, consumed token
и внешнее stale изменение. Удаляет свои объекты через независимый evaluator
и проверяет catalog/trash/OpenDoc и evaluator cleanup. На Linux HCM 2025.2.1333 /
CLR 9.0.11 / PostgreSQL 16 прошли **8/8** tests (семь сценариев и parent), без skips.
Это ограниченная вертикаль одного типа; остальные типы/hooks/провайдеры требуют
отдельных native проверок. [Evidence](https://github.com/BorisType/BorisType/blob/main/refs/research/mcp/10-object-model/first-implementation.md).

Для partial XML patch соберите SDK и MCP и запустите отдельный тест
на работающем эксклюзивном Docker stand. Он принимает `WSHCM_USERNAME`,
`WSHCM_PASSWORD`, `WSHCM_HOST`, `WSHCM_PORT` и `WSHCM_CONTAINER`.
Путь для результата выбирает `WSHCM_MCP_PATCH_RECEIPT`.

```bash
pnpm --filter @boristype/ws-client build
pnpm --filter @boristype/mcp-server build
NODE_USE_ENV_PROXY=0 pnpm --filter @boristype/mcp-server test:e2e:object-patch
```

Stdio acceptance проверяет состав tools, partial Save/readback, repeat без Save,
preview, invalid mode, расходование token и конфликт с независимым writer.
Проверка очистки охватывает только собственный `cost_center`, инвентарь
evaluator и XML списка пакетов. [Хеши и результаты Linux C HCM 2025.2.1333](https://github.com/BorisType/BorisType/blob/main/refs/research/mcp/object-patch/stdio-acceptance.json).

Системный отчёт проверяется отдельно с теми же `WSHCM_E2E_*`:

```bash
pnpm --filter @boristype/mcp-server test:e2e:system-info
```

Команда не подготавливает DLL и не меняет бизнес-записи. Она проверяет сводку,
полный отчёт относительно прямого SOAP-вызова, CRLF/CR/Unicode carrier и очистку
собственного evaluator. В диагностике выводятся только сводка, размер и hash.

Выполнение BorisScript имеет отдельную команду с теми же `WSHCM_E2E_*`:

```bash
pnpm --filter @boristype/mcp-server test:e2e:execute
```

Проверяются library call, typed result/Unicode, native ошибки с выводом, limits,
XML/date, nonfinite JSON и продолжение после короткого client timeout. Последняя
проба пишет два маркера только в собственный временный каталог и независимо
проверяет завершение перед cleanup. Бизнес-записи и конфигурация не меняются,
DLL не подготавливается. Linux C HCM 2025.2.1333: 10/10 tests без skips.

### Что остаётся проверить

- Создание evaluator записывает временный `.bs` на сервер даже для чтения.
- EOF/SIGINT/SIGTERM используют общий cleanup; неподтверждённое удаление evaluator
  даёт ненулевой exit code. Частичная ошибка создания evaluator и завершение
  во время активного SOAP вызова требуют отдельного исследования.
- Полный permissions/VFS contract, произвольные URL/пути и все control escapes
  на C-runtime требуют дальнейших проверок. Text read/edit поддерживают только
  strict UTF-8 в пределах 1 MiB; legacy encodings и binary text IO вне контракта.
  Для binary/large files доступны metadata и move с отдельными проверками.
- Read/list требуют string result; неожиданный тип возвращается как tool error.
  Общий SOAP parser пока допускает отсутствие ResultData как `undefined`.
