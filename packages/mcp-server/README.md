# @boristype/mcp-server

MCP сервер для WebSoft HCM — предоставляет AI-агентам доступ к файловой системе сервера через [Model Context Protocol](https://modelcontextprotocol.io/) (stdio transport).

Использует [@boristype/ws-client](../ws-client/) для соединения с WSHCM сервером.

Статус: прототип. Требуется Node.js >=24.22.2 и отдельно установленная
`BorisType.FileSystem.dll` **0.1.0-alpha.3 / API 1** на HCM для всех шести tools.
Все операции используют BS URL resolver и managed filesystem API, без Datex
callbacks. Read/write/list/delete, targeted edit и search прошли native e2e на
Linux C-runtime `websoft/hcm:2025.2.1333` / CLR 9.0.11.
Это evidence одной сборки; другие ОС/версии и полный permissions/VFS contract
требуют отдельных проверок. [Отчёт](../../plans/dotnet/09-file-tools-results.md).

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

| Tool                   | Описание                                             | Annotations                         |
| ---------------------- | ---------------------------------------------------- | ----------------------------------- |
| `wshcm_read_file`      | Чтение файла по x-local:// URL                       | `readOnlyHint: true`                |
| `wshcm_write_file`     | Запись файла по x-local:// URL                       | `destructiveHint: true, idempotent` |
| `wshcm_list_directory` | Листинг директории                                   | `readOnlyHint: true`                |
| `wshcm_delete_file`    | Удаление файла                                       | `destructiveHint: true`             |
| `wshcm_edit_file`      | Точные последовательные замены, preview и hash guard | `destructiveHint: true`             |
| `wshcm_search_files`   | Поиск имён и UTF-8 содержимого через .NET DLL        | `readOnlyHint: true`                |

Деструктивные операции (`write_file`, `delete_file`, `edit_file`) помечены `destructiveHint: true`.
Это подсказка MCP-клиенту; необходимость и способ пользовательского подтверждения
определяет клиент. Сервер не реализует отдельный механизм подтверждения.

Пять заготовок (move/multiple-read/create-directory/tree/get-info)
сохранены в исходниках для дальнейшей работы, но не регистрируются как tools.

Текстовые файлы читаются как strict UTF-8, с удалением одного начального BOM.
NUL, invalid UTF-8 и файлы больше 1 MiB дают ошибку. Write создаёт UTF-8 с BOM,
включая пустой файл; edit сохраняет исходный BOM. CR/LF/CRLF и whitespace
сохраняются буквально. Parent должен существовать, symlink/junction paths
отвергаются. List возвращает immediate entries ordinal, links отмечаются
`isSymbolicLink: true`; больше 10000 entries — ошибка. Это tightened contract
после миграции с платформенных BS функций, без fallback на них.

Установка DLL — в [.NET README](../dotnet/README.md#установка-для-mcp). CLI/npm
не устанавливают её автоматически. JSON request/response ограничены 8 MiB.

### Точечное редактирование

`wshcm_edit_file` принимает до 100 последовательных exact replacements:

```json
{
  "path": "x-local://wt/web/app.bs",
  "edits": [{ "oldText": "var count = 1;", "newText": "var count = 2;" }],
  "dryRun": true
}
```

Каждый oldText непустой и должен встретиться ровно один раз в промежуточном
тексте. Нет fuzzy/regex matching; overlapping occurrences тоже неоднозначны.
Если любой edit не проходит, файл не изменяется. Пустые edits/no-op не пишут файл.
Ответ JSON: apiVersion, status applied/dry_run/unchanged, editsCount,
previousSha256, sha256 и content только для dryRun.

Для защиты от устаревшего содержимого прочитать `wshcm_read_file` с
`includeMetadata: true`: ответ JSON содержит content, sha256 исходных bytes
(включая BOM) и bom. Передать sha256 как expectedSha256 в edit. Альтернатива —
previousSha256 из dryRun. Несовпадение даёт Conflict. Без includeMetadata read
по-прежнему возвращает raw text. Edit не является идемпотентным запросом.

Write/edit используют temp в том же каталоге и rename после валидации; edit
повторно проверяет bytes перед commit. Внешняя запись между проверкой и rename
остаётся возможной — это не строгий CAS. Новые Unix файлы получают mode 0600 (с учётом umask).
Existing Unix rwx сохраняются; owner/ACL и
inode/hardlinks могут измениться. Readonly targets отвергаются. Ошибка доставки
ответа после commit не откатывает запись. Подробный [контракт](../../plans/dotnet/07-file-tools-design.md).

### Поиск

`wshcm_search_files` использует ту же отдельно установленную `BorisType.FileSystem.dll`
версии `0.1.0-alpha.3` / API 1. Installation ZIP собирается
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

Все пути используют серверную URL-схему `x-local://`. Это относительные URL серверной файловой системы:

```
x-local://wt/web/app.bs          — файл в директории wt/web/
x-local://wt/web/                 — директория
x-local://wt/myapp/src/index.bs   — файл проекта
```

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
Для всех file e2e требуется установленная alpha.3 DLL в
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
