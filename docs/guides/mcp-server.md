# Подключить MCP к WebSoft HCM

`@boristype/mcp-server` запускается локально как stdio-сервер. MCP-клиент передаёт ему вызовы инструментов, а сервер обращается к настроенному стенду HCM. Для запуска нужен Node.js версии 24.22.2 или новее. Для девяти операций с физическими файлами дополнительно требуется HCM с .NET 9 и доступом к `dotnetcore/shared`. SDK доставляет DLL при первом файловом вызове. [Подготовка файлового runtime](./dotnet)

## Справочник инструментов

| Задача                                                                                    | Точка входа                                                     |
| ----------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Узнать версию стенда, выполнить XQuery, вызвать библиотеку или запустить агента           | [Стенд, запросы и выполнение кода](../reference/mcp-execution)  |
| Найти тип и каталог, посмотреть XMD, прочитать, изменить или удалить документ             | [Каталоги, формы и документы](../reference/mcp-objects)         |
| Определить шаблон заявки, добавить поле со списком вариантов или изменить порядок страниц | [Настраиваемые поля и страницы](../reference/mcp-custom-fields) |
| Найти физический файл, прочитать строки и применить точную замену                         | [Файлы и каталоги HCM](../reference/mcp-files)                  |
| Собрать ZIP, перенести его на другой стенд и проверить результат импорта                  | [Пакеты объектов и ZIP](../reference/mcp-packages)              |

## Установка и подключение

Установите MCP сервер:

```sh
npm install -g @boristype/mcp-server@next
```

Для Codex CLI или Claude Code выполните в Bash команду для своего клиента. Подставьте адрес и имя пользователя HCM. Пароль вводится скрыто и сохраняется в личных настройках клиента. Для HTTP укажите нужный порт и уберите `--https`.

::: code-group

```bash [Codex CLI]
read -r -s -p 'Пароль HCM: ' hcm_password
printf '\n'
codex mcp add wshcm --env "WSHCM_PASSWORD=$hcm_password" -- \
  boristype-mcp --host hcm.example --port 443 --https --username hcm-user
unset hcm_password
codex mcp list
```

```bash [Claude Code]
read -r -s -p 'Пароль HCM: ' hcm_password
printf '\n'
claude mcp add --env "WSHCM_PASSWORD=$hcm_password" --transport stdio --scope local wshcm -- \
  boristype-mcp --host hcm.example --port 443 --https --username hcm-user
unset hcm_password
claude mcp list
```

:::

У Claude Code `--scope local` привязывает запись к текущему проекту. Выполняйте команду в его каталоге. Для личного подключения во всех проектах укажите `--scope user`.

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

Откройте `tools/list` в клиенте. В версии `0.1.0-alpha.9` зарегистрированы **33 инструмента**. Для проверки связи с HCM вызовите `wshcm_get_system_info` с `{}` и найдите `summary.hcmVersion`. Если нужны физические файлы, отдельно вызовите `wshcm_runtime_status` с `{}` и проверьте `status`. [Значения статусов](../reference/mcp-execution#wshcm-runtime-status)

В сыром ответе MCP смотрите сначала на `isError`, затем на `content[0].text`. Обычно внутри находится JSON. Например, успешные `wshcm_write_file` и `wshcm_delete_file` возвращают обычную строку, как и некоторые ошибки файловых операций. В справочнике показаны аргументы для `tools/call` и содержимое результата после чтения этой оболочки.

## Восстановление соединения

С корректной конфигурацией MCP инициализируется, показывает все 33 tools и
отвечает на `ping` при выключенном HCM. Эти действия не обращаются к HCM.
При вызове инструмента `isError: true` и код `HcmUnavailable` означают проблему
доступности. Следующий вызов, которому нужен HCM, сам проверит готовность.
Read tokens и package handles в том же процессе MCP сохраняют обычные сроки
действия. Локальный ZIP остаётся доступен на диске MCP. Preview и страницы
`wshcm_inspect_package` требуют соединения для проверки на HCM.
При `HcmAuthenticationFailed` (HTTP 401/403) измените учётные данные и
перезапустите MCP через клиент.

Подготовка использует 5000 мс на каждый HTTP-запрос. Значение можно изменить
через `--connection-timeout-ms <ms>`. Обычный запрос сохраняет
30000 мс socket timeout. У MCP-клиента может быть отдельный таймаут.
Фоновых запросов для восстановления нет.

Если подготовка прервалась до отправки кода, одиночный execute сообщает
`not_started`, одиночная XML-запись — `not_attempted`. При потерянном
ответе после отправки исход неизвестен. Восстановление не повторяет
предыдущую операцию. Перед новой записью проверьте её результат, а для пакета
используйте `wshcm_get_package_operation` с сохранённым ID. Если подготовка
сорвалась на очередном шаге пакета, результаты предыдущих шагов сохраняются.
Общий статус может остаться `unknown` с `lastKnownOperation`. При закрытии
MCP пытается удалить свою временную библиотеку. Сбой очистки виден в stderr.

## Руководство для агента

Сервер передаёт короткие общие `instructions` при MCP initialization, а каждый
tool публикует свои schema и description. Для подробных workflow можно установить
skill `boristype-mcp`: чтение/правка с readToken, хранилища, XQuery/SQL,
потери типов и обработка неизвестного исхода. Установка и границы доставки
инструкций клиентом — в [руководстве по skills](agent-skills.md).
Skill не устанавливает сервер или DLL и не добавляет новых гарантий.

## Экспорт и импорт пакетов объектов

Для разового переноса передайте ID объектов в `wshcm_export_package` на исходном стенде. Проверьте состав и `missingCount`. Скопируйте ZIP из `artifact.localPath` во входной каталог целевого MCP (по умолчанию `~/.boristype/package-inbox`), выполните `wshcm_inspect_package` и сохраните его `inspectionId`. Только теперь вызывайте `wshcm_import_package`. Запишите UUID импорта до отправки, чтобы после обрыва узнать исход через `wshcm_get_package_operation`. Для повторяемого набора сначала создайте именованную схему. [Все десять операций с пакетами](../reference/mcp-packages)

## Сведения о стенде

Для карточки стенда достаточно `summary` от `wshcm_get_system_info({})`. Если нужно проверить конкретную настройку, например `REAL-PRECISION`, запросите `includeReport: true` и ищите строку в `report`. Она относится к ответившему процессу. [Состав отчёта](../reference/mcp-execution#wshcm-get-system-info)

## XML объектов

Если известен только тип документа, запросите `wshcm_list_object_types` с `objectType`. Возьмите имя каталога, найдите запись по коду через `wshcm_xquery` и передайте её ID десятичной строкой в `wshcm_get_object`. Если нужна структура, передайте `formUrl` в `wshcm_get_form`. [Реестр и чтение XML](../reference/mcp-objects)

### Изменение отдельных полей

Чтобы переименовать центр затрат, прочитайте его через `wshcm_get_object`. Передайте `id`, `readToken` и XML только с корнем и новым названием в `wshcm_patch_object` с `dryRun: true`. Сравните кандидат с исходным документом. Для применения снова прочитайте объект и используйте свежий токен. [Правила patch для скаляров, массивов и дат](../reference/mcp-objects#wshcm-patch-object)

### Реестр типов и удаление объекта

Строка каталога из XQuery помогает выбрать документ. До удаления прочитайте весь документ, сверьте тип, код и название, затем передайте ID и токен в `wshcm_delete_object`. Ответ подтверждает перемещение в корзину. [Контракт удаления](../reference/mcp-objects#wshcm-delete-object)

### Типы данных объектов

Чтобы узнать, в каких связях участвует подразделение, вызовите `wshcm_list_object_data_types` с `{"objectType":"subdivision"}`. Строка результата указывает обе стороны. Используйте ID найденного определения для запроса записей `object_datas` или для чтения полей самого типа данных. [Фильтры и пагинация](../reference/mcp-objects#wshcm-list-object-data-types)

### Настраиваемые поля

У заявки набор полей зависит от типа. Вызовите `wshcm_get_custom_field_definitions` с `mode: "list"` и `objectType: "request"`, затем по селектору документа выберите нужный шаблон и прочитайте его `scope`. Для изменения набора полей нужна его `revision`. Для заполнения поля в одной заявке нужны ID и токен документа. [Пример создания поля со списком и заполнения заявки](../reference/mcp-custom-fields)

## Запуск серверного агента

Для настроенного серверного агента выберите `wshcm_run_agent`. Передайте объявленные параметры и ID объектов, которые ожидает его код. Например, для запуска по выбранным в каталоге сотрудникам передайте их ID в `objectIds`. Даже в режиме ожидания прикладной результат проверяется отдельно. [Режимы запуска и значения статусов](../reference/mcp-execution#wshcm-run-agent)

## Выполнение BorisScript

Для одиночного библиотечного вызова выберите `wshcm_execute`. Передайте фрагмент с `return`, чтобы получить `value`. Экспериментальный `print(value)` возвращает диагностику в `output` этого вызова. [Пример вызова, ограничения и ошибки](../reference/mcp-execution#wshcm-execute)

## Серверные запросы

Для подбора записей по условию используйте `wshcm_xquery`. Ограничьте запрос на стороне каталога или SQL и проверьте `truncated` перед выводами обо всей выборке. Для следующего чтения документа передавайте точный ID строкой. [Примеры XQuery и SQL](../reference/mcp-execution#wshcm-xquery) · [Матрица типов](../reference/ws-client-values)

## Чтение перед изменением

Для правки физического файла найдите строку через `wshcm_search_files`, затем прочитайте её через `wshcm_read_file`. Передайте текст, замену и `readToken` в `wshcm_edit_file` с `dryRun: true`. Здесь предпросмотр сохраняет токен для применения тех же замен. При `Conflict` перечитайте фактические байты. [Чтение и точечная правка](../reference/mcp-files#wshcm-edit-file)

## Файловые операции и ограничения

Сначала определите, где приложение хранит ресурс. Файловые операции читают и изменяют физический диск HCM. При включённом SQL-хранилище тот же URL в `LoadUrlData` может вернуть содержимое из БД. Для бинарных файлов доступны получение метаданных и перемещение. Чтение и правка текста поддерживают UTF-8, до 1 MiB на весь файл. [Файловый справочник](../reference/mcp-files) · [Исследование путей и хранилищ](https://github.com/BorisType/BorisType/blob/main/refs/research/dotnet/15-url-storage-routing-research.md)

## Проверки

XML object suite `test:e2e:objects` не требует BorisType DLL и проверяет
form/create/read/whole replace, XML negatives и stale/consumed token на одном
собственном `cost_center`, с независимым удалением/cleanup. На Linux HCM
2025.2.1333 / CLR 9.0.11 / PostgreSQL 16 прошло 8/8 tests без skips.
При проверке create/replace 2026-11-10 общий локальный MCP suite прошёл 218/218 тестов.
[Отчёт и границы](https://github.com/BorisType/BorisType/blob/main/refs/research/mcp/10-object-model/first-implementation.md).

Для patch команда `test:e2e:object-patch` проверяет собранный MCP CLI по stdio
на собственном `cost_center`. Проверены сохранение и readback, сохранность
соседних полей, повтор без Save, preview, недопустимые режимы, расходование token
и конфликт при независимом изменении. Отчёт содержит хеши исходников и сборки,
а также проверку удаления fixture и сохранности evaluator inventory и схемы пакетов.
[Native stdio receipt](https://github.com/BorisType/BorisType/blob/main/refs/research/mcp/object-patch/stdio-acceptance.json).

Есть managed, MCP protocol/VM, stdio и pack проверки, а также отдельные native
команды test:e2e, test:e2e:edit, test:e2e:read-aware, test:e2e:search. Native suites
требуют уже установленного локального stand/DLL и ограничиваются своими fixtures.
Все четыре серии прошли на Linux HCM 2025.2.1333 / CLR 9.0.11 с alpha.4/API 2:
28/28 + 1/1 + 1/1 + 1/1, без skips. Байты и cleanup проверены независимо.
Это evidence одной C-сборки; JS runtime и Windows HCM этим не проверены.
[Контракт и границы](https://github.com/BorisType/BorisType/blob/main/refs/dotnet/files-and-read-grants.md),
[результаты](https://github.com/BorisType/BorisType/blob/main/refs/research/dotnet/13-read-aware-files-results.md).
