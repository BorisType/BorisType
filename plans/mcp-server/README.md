# MCP server: исходное состояние и направление работы

Дата: 2026-11-05. Статус: **первичный аудит, без изменения реализации**.

Следующий шаг: [dependency refresh и локальные исправления](01-dependency-refresh.md).
Продолжение: [переход на стабильный SDK v2](02-sdk-v2-migration.md).
Ниже сохранено исходное состояние до исправлений.

Изучен `@boristype/mcp-server` из `origin/feat/mcp-server`, commit
`ec588a9595a5576d45ecd748b2302c2430e6f438`. В актуальном `main` (`ed8935d`,
после PR #47) этого пакета нет. Это существующий прототип в отдельной ветке,
а не уже интегрированная возможность main.

Дополнительный референс: [wshcmx/types](https://github.com/wshcmx/types), revision
`a3b1e43d0b2add53bbc1f2acc2c5128360e8c97b`, package version `14.1.0`.
Предупреждение пользователя о ненадёжности Datex сохранено в [AGENTS.md](../../AGENTS.md).
Документация, декларации и результаты локальных проверок ниже разделены;
доступность функций на конкретной C-платформе не аттестована этим аудитом.

## Назначение и архитектура

Это Node.js MCP server с **stdio transport**, предоставляющий доступ к файлам
HCM-сервера. Добавленный пользователем `wshcm-docs` — отдельный HTTPS/OAuth MCP
для поиска и чтения документации; он не является этим пакетом.

Основной путь: MCP client → stdio → `McpServer` → `@boristype/ws-client` →
SP-XML SOAP `/api/spxml/CallMethod` → WebSoft server.

- CLI `boristype-mcp`: host/port/username/password/https из CLI или `WSHCM_*` env.
- `createConnection`: проверка подключения, создание и initialization `Evaluator`.
- `Evaluator` записывает временный `x-local://wt/unsafe_eval_<random>.bs` с
  `execute(code)` и `drop_self()`. Read/list/delete используют выполнение BS.
- Write вызывает `tools.put_url_text_server(path, content)` напрямую, передавая
  content отдельным SOAP argument вместо вставки в исполняемый код.
- Вызов `closeConnection` удаляет временный evaluator через `drop_self()`.
- Результаты tools возвращаются текстовыми MCP content blocks; четыре реализованных
  handlers переводят caught errors в `isError: true`.

`tsc` собирает обычный Node TypeScript; платформенные фрагменты — ручные `.bs`.
Зависимости от `bt-ir`, script/module lowering или descriptor ABI у пакета нет.
Его развитие возможно при действующей заморозке compiler script/module.

## Inventory инструментов

Все 11 tools регистрируются в `server.ts`. «Реализован» здесь означает наличие
тела handler; запуск на реальном HCM и published-package acceptance не заявляются.

| Tool                        | Текущее состояние | Механизм / контракт                                              |
| --------------------------- | ----------------- | ---------------------------------------------------------------- |
| `wshcm_read_file`           | Handler + BS      | `tools.load_url_text_server`, затем `String(value ?? "")`        |
| `wshcm_write_file`          | Handler           | Прямой `tools.put_url_text_server`; создаёт/перезаписывает текст |
| `wshcm_list_directory`      | Handler + BS      | `ReadDirectory`, `FileName`, `IsDirectory`, JSON text            |
| `wshcm_delete_file`         | Handler + BS      | `DeleteFile`, затем сообщение об успехе                          |
| `wshcm_move_file`           | Заглушка          | `throw new Error("Not implemented")`                             |
| `wshcm_edit_file`           | Заглушка          | Запланированы exact edits / dry-run                              |
| `wshcm_read_multiple_files` | Заглушка          | Запланированы независимые результаты для каждого файла           |
| `wshcm_create_directory`    | Заглушка          | Запланирован `ObtainDirectory`                                   |
| `wshcm_search_files`        | Заглушка          | Запланирован glob search по именам                               |
| `wshcm_directory_tree`      | Заглушка          | Запланирован ограниченный обход                                  |
| `wshcm_get_file_info`       | Заглушка          | Запланированы size/type/date metadata                            |

Семь соответствующих BS resources тоже содержат только описание/TODO. Числа
лимитов из комментариев (20 files, 500 tree items, 1000 search results) не являются
реализованными гарантиями. README перечисляет лишь четыре tools. MCP resources
и prompts в исходном пакете не зарегистрированы; транспорт HTTP не реализован.
Тестовых файлов и package test script нет.

## Найденные проблемы

### MCP-R01. SOAP transport меняет содержимое текстовых файлов

**Подтверждено локально на актуальном main**, не только старой MCP-ветке.
`packages/ws-client/src/soap-utils.ts` использует `trimValues: true` и default
преобразование XML text values в numbers. Последующий `String(text)` не может
восстановить исходные пробелы или ведущие нули.

Synthetic SOAP `Result VALUE-TYPE="string"` → фактический `parseResponse`:

| Входной string        | Результат       | Итог                            |
| --------------------- | --------------- | ------------------------------- |
| `"  first\nlast  \n"` | `"first\nlast"` | Потеря whitespace               |
| `"000123"`            | `"123"`         | Изменение содержимого           |
| `"\n\t"`              | `""`            | Непустой файл становится пустым |
| `"true"`              | `"true"`        | Control PASS                    |
| `"normal text"`       | `"normal text"` | Control PASS                    |

Для MCP это prerequisite перед edit/move через чтение и повторную запись: иначе
операция может сохранить уже искажённый текст. Исправлять нужно wire string
contract, сохраняя отдельные typed bool/integer/real rules и SOAP Fault handling.

### MCP-R02. Невалидный ответ может выглядеть как пустой файл

`parseResponse("<html>Login required</html>")` возвращает `undefined` из-за
отсутствия ResultData. Read handler превращает его в `""`, как и настоящий пустой
string result. Это подтверждено локальной композицией существующих функций.
В будущем различать malformed/non-SOAP response, legitimate void result и
обязательный string result файлового чтения; не менять все void calls вслепую.

### MCP-R03. Опубликованный пакет не содержит runtime BS templates

`package.json#files` включает только `build` и `README.md`, но tool modules при
импорте читают `../../resources/*.bs` через `readFileSync`. Это блокирует загрузку
пакета, даже если отдельные tools не вызываются.

Проверен `npm pack --dry-run --ignore-scripts --json` на временной копии исходников
ветки с JS, emitted через TypeScript transpileModule: 20 files, CLI есть,
**resources отсутствуют**. Эта проверка подтверждает packlist, а не успешный
project type-check или MCP handshake. Нужен отдельный pack/install/start smoke.

### MCP-R04. Семь неготовых tools объявлены доступными

Они имеют полноценные descriptions/schemas и включены в регистрацию, но каждый
handler немедленно выбрасывает `Not implemented`. Нужен честный capability list:
заглушка не должна считаться supported operation.

### MCP-R05. `buildScript` не сохраняет произвольные параметры

В `src/load.ts` значение используется как **replacement string** в `replaceAll`,
поэтому `$&` интерпретируется самим JavaScript. Воспроизведение реальной функции:

```text
template: return read('${path}');
path:     x-local://wt/a$&b.bs
observed: x-local://wt/a${path}b.bs
```

Параметр с literal newline порождает SyntaxError при локальном JS parsing.
Single quote/backslash escaping не является полным string serializer.
Это подтверждение порчи значения/синтаксиса; произвольное выполнение чужого кода
и поведение C этим тестом не доказаны. Предпочтительно передавать arguments
отдельно; если нужен generated code, определить и проверить BS serialization.

### MCP-R06. Lifetime и границы вызовов не доведены до контракта

Cleanup connection привязан к SIGINT/SIGTERM. Обработчиков cleanup для normal
transport close/EOF и ошибки после создания evaluator нет. Результат
`Evaluator.close()` может быть false, но shutdown всё равно завершает process
с exit 0. Нужны тесты startup failure, disconnect, повторного shutdown и cleanup.

Начало даже read-only session записывает временный evaluator на HCM-сервер.
Входные пути в schemas — просто `z.string()`: заявленный `x-local://` формат
не проверяется MCP-слоем. Политика допустимых путей и режим read-only пока не
определены; права некоторых platform helpers нельзя автоматически переносить
на raw `ReadDirectory`/`DeleteFile`.

README обещает обязательное пользовательское подтверждение по `destructiveHint`.
В коде нет такого механизма: annotations — подсказки клиенту, не реализация
проверки прав или гарантированного UI подтверждения.

### MCP-R07. Старую feature-ветку нельзя считать текущим build baseline

Она содержит старые root/tool versions и большой отдельный lockfile diff.
В её `packages/ws-client/src/soap-utils.ts` два свойства `htmlEntities` в одном
object literal; TypeScript semantic check дал **TS1117**. Это отдельный дефект
ветки, в main двойного свойства нет.

Полный MCP project build с SDK dependencies не запускался. Исследование не
устанавливало старые зависимости в основной workspace. Для начала разработки
предпочтителен перенос scoped MCP sources на актуальный main с повторной
проверкой dependency/API compatibility, а не перенос старого root lockfile.

## Сверка platform API

Подтверждение декларацией не заменяет native probe. Комментарии заготовок
MCP содержат предположения, которые нужно перепроверить.

| Ветка MCP предполагает                                    | Дополнительный референс                                                                                                                                                                                                     | Что остаётся проверить                                                                               |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Встроенного `MoveFile` нет, нужен text copy/delete        | `wshcmx/types` core:2048 и [статья MoveFile](https://wshcm-docs.boristype.dev/news/monolith/6722114747369980167.html#movefile) описывают native API                                                                         | Реальная версия/доступность, URL mapping, existing destination, binary fidelity, гарантии операции   |
| `ObtainDirectory(path)` автоматически создаёт всю цепочку | types core:2056: `ObtainDirectory(path, isRecursive?)`; [Datex](https://wshcm-docs.boristype.dev/datex/common/5620276892448878688.html#obtaindirectory) тоже описывает второй аргумент                                      | Проверить recursion flag и ошибки file-vs-directory на целевой платформе                             |
| Metadata через `FileModDate` и `FileSize`                 | types core:1989 содержит `GetFileModDate`, core:2329 — `UrlFileSize`                                                                                                                                                        | Не считать имена из TODO корректными; проверить metadata calls и формат date                         |
| Текст всегда UTF-8 без дополнительных правил              | [LoadUrlText](https://wshcm-docs.boristype.dev/datex/common/7172076235998782839.html#%D1%81%D0%B8%D0%BD%D1%82%D0%B0%D0%BA%D1%81%D0%B8%D1%81) описывает BOM/default charset/detection; types core:2185 тоже содержит options | Поведение именно `tools.load_url_text_server` / write helper, BOM, UTF-8 без BOM, Windows-1251, CRLF |

Declaration source для таблицы:
[lib/core/index.d.ts на зафиксированном revision](https://github.com/wshcmx/types/blob/a3b1e43d0b2add53bbc1f2acc2c5128360e8c97b/lib/core/index.d.ts).
Tools helpers:
[lib/tools/index.d.ts](https://github.com/wshcmx/types/blob/a3b1e43d0b2add53bbc1f2acc2c5128360e8c97b/lib/tools/index.d.ts)
содержит `load_url_text_server` и `put_url_text_server`, включая overloads с
unknown result; это не основание считать любой write return подтверждением записи.
Отсутствие `FileSize`/`FileModDate` в этом референсе не доказывает их отсутствия
во всех версиях HCM.

## Предлагаемые следующие измеримые шаги

1. **MCP-01, integration/packaging baseline:** перенести пакет на текущий main,
   согласовать dependencies/toolchain, получить green tsc + pack/install/import
   smoke и MCP initialize/tools-list с fake connection. Не объявлять TODO tools
   рабочими. Реальная HCM connection не нужна для первого protocol/packaging gate.
2. **MCP-02, точный SOAP string contract:** regression cases для whitespace,
   numeric-looking text, Unicode/entities, empty/void/error responses; исправить
   R01/R02 с проверкой остальных typed SOAP values.
3. **MCP-03, параметры и lifecycle:** явный path/argument contract, error model,
   disconnect/cleanup, request/output limits; небольшие отдельные задачи.
4. **MCP-04, четыре текущих операции:** подтвердить read/write/list/delete на
   согласованном тестовом HCM с выделенными fixtures, без действий с рабочими
   файлами. Отдельно Unicode/BOM/line endings, missing paths, права, отмена.
5. **MCP-05+, новые tools по одному:** сначала get-info/multi-read/create-directory,
   затем native move после проверки semantics, exact edit/dry-run, bounded tree
   и search. Для каждой функции отдельный contract, tests и native acceptance.

Это направление работы, не принятые implementation specs. До начала leaf уточнить
его входы, observable outputs, ошибки, native assumptions и критерий завершения.
В рамках этого аудита реализации не менялись, подключений к HCM и C executions
не было. Локальная среда: Node 24.22.2, pnpm 12.16.1, TS 6.0.3 из workspace.
