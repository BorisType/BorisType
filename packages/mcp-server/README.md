# @boristype/mcp-server

MCP сервер для WebSoft HCM — предоставляет AI-агентам доступ к файловой системе сервера через [Model Context Protocol](https://modelcontextprotocol.io/) (stdio transport).

Использует [@boristype/ws-client](../ws-client/) для соединения с WSHCM сервером.

Статус: прототип. Требуется Node.js >=24.22.2 и отдельно установленная
`BorisType.FileSystem.dll` **0.1.0-alpha.4 / API 2** на HCM для всех девяти tools.
Все операции используют BS URL resolver и managed filesystem API, без Datex
callbacks. Все девять tools и защита чтений прошли native e2e на Linux
C-runtime `websoft/hcm:2025.2.1333` / CLR 9.0.11. Это evidence одной сборки;
другие ОС/версии и полный permissions/VFS contract требуют отдельных проверок.
[Отчёт](../../plans/dotnet/13-read-aware-files-results.md).

Используется стабильная линия MCP TypeScript SDK 2.x: runtime-пакет
`@modelcontextprotocol/server`; `@modelcontextprotocol/client` нужен только тестам.
Схемы инструментов передаются как Zod 4 `z.object(...)` (Standard Schema).
Версии SDK зафиксированы lockfile с учётом 14-дневного `minimumReleaseAge`.

TypeScript 6.0.3 следует общему Compiler API baseline workspace. Это не latest
TypeScript CLI: версия 7 использует новый native compiler и другой API.
Обоснование и отставшие зависимости перечислены в
[dependency review](../../plans/mcp-server/03-dependency-review.md).

## Установка

```bash
npm install -g @boristype/mcp-server
```

## Tools

| Tool                     | Назначение                                       |
| ------------------------ | ------------------------------------------------ |
| `wshcm_read_file`        | UTF-8 текст или диапазон строк, hash и readToken |
| `wshcm_write_file`       | Create-only либо перезапись после полного чтения |
| `wshcm_edit_file`        | Точные замены внутри прочитанных диапазонов      |
| `wshcm_list_directory`   | Immediate entries, без recursion                 |
| `wshcm_search_files`     | Поиск по именам и UTF-8 содержимому              |
| `wshcm_delete_file`      | Удаление отдельного файла                        |
| `wshcm_create_directory` | Создание каталога и missing parents              |
| `wshcm_move_file`        | Rename без overwrite и copy/delete fallback      |
| `wshcm_get_file_info`    | Metadata файла/каталога без чтения содержимого   |

Read/list/search/info помечены readOnlyHint. Write/edit/delete/move имеют
`destructiveHint: true`, `idempotentHint: false`; create_directory —
`destructiveHint: false`, `idempotentHint: true`. Это подсказки MCP-клиенту;
сервер не реализует отдельное пользовательское подтверждение.

Отложенные read-multiple/tree не зарегистрированы; их TS stubs и пять старых BS
stubs удалены. Два действующих BS resources — URL bridges к DLL — необходимы.

Это несовместимое обновление прототипа: read всегда возвращает JSON,
includeMetadata удалён; edit требует readToken, write по умолчанию create-only.
Установить DLL alpha.4/API 2 и обновить MCP вместе. Старые ответы API 1 отвергаются.
Установка — в [.NET README](../dotnet/README.md#установка-для-mcp); npm не содержит DLL.

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
Подробный [контракт](../../plans/dotnet/11-read-aware-files-design.md).

### Поиск

`wshcm_search_files` использует ту же отдельно установленную `BorisType.FileSystem.dll`
версии `0.1.0-alpha.4` / API 2. Installation ZIP собирается
командой `pnpm pack:dotnet`; установка и версия CLR описаны в
[.NET README](../dotnet/README.md#установка-для-mcp). npm package не содержит DLL.
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
[спецификации](../../plans/dotnet/04-search-design.md).

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
[Проверка и границы](../../plans/dotnet/15-url-storage-routing-research.md).

## Конфигурация

### Параметры подключения

Параметры можно передать через CLI-аргументы или переменные окружения (CLI приоритетнее):

| CLI аргумент | Env переменная   | Описание           | По умолчанию |
| ------------ | ---------------- | ------------------ | ------------ |
| `--host`     | `WSHCM_HOST`     | Хост сервера       | `localhost`  |
| `--port`     | `WSHCM_PORT`     | Порт сервера       | `80`         |
| `--username` | `WSHCM_USERNAME` | Имя пользователя   | `user1`      |
| `--password` | `WSHCM_PASSWORD` | Пароль             | `user1`      |
| `--https`    | `WSHCM_HTTPS`    | Использовать HTTPS | `false`      |

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
инициализирует соединение с HCM и запускает stdio transport.

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
Для всех file e2e требуется установленная alpha.4/API 2 DLL в
`/WebsoftServer/dotnetcore/shared/`. Пути fixtures ожидаются под `/WebsoftServer/wt`. На Docker Desktop прямой IP
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
[local e2e report](../../plans/mcp-server/04-local-e2e.md).

С теми же environment variables отдельно выполнить `test:e2e:edit` и
`test:e2e:read-aware`: второй проверяет диапазоны/чужой token/stale bytes,
guarded overwrite и mkdir/info/binary rename. Текущие результаты всех серий —
в [отчёте alpha.4](../../plans/dotnet/13-read-aware-files-results.md).

Поиск имеет отдельную acceptance-команду, которая дополнительно требует уже
установленную DLL в `/WebsoftServer/dotnetcore/shared/`:

```bash
WSHCM_E2E_CONTAINER=boristype-c-runtime-net9-wt-1 \
WSHCM_E2E_USERNAME=user1 WSHCM_E2E_PASSWORD=user1 \
pnpm --filter @boristype/mcp-server test:e2e:search
```

Она создаёт своё ограниченное дерево, проверяет имена/содержимое/Unicode/newlines,
exclusions, links, binary, result limit, regex и quoted path/query через настоящий
CLI/stdio/SOAP/DLL, затем проверяет cleanup. Не запускает стенд и не устанавливает
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
Ни одна из трёх native команд не запускает стенд и не устанавливает DLL.

### Что остаётся проверить

- Создание evaluator записывает временный `.bs` на сервер даже для чтения.
- EOF/SIGINT/SIGTERM используют общий cleanup; неподтверждённое удаление evaluator
  даёт ненулевой exit code. Частичная ошибка создания evaluator и завершение
  во время активного SOAP вызова требуют отдельного исследования.
- Не аттестованы права, произвольные URL/пути, legacy encodings, бинарные данные,
  большие файлы и все control escapes на C-runtime.
- Read/list требуют string result; неожиданный тип возвращается как tool error.
  Общий SOAP parser пока допускает отсутствие ResultData как `undefined`.
