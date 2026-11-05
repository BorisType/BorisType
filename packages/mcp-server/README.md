# @boristype/mcp-server

MCP сервер для WebSoft HCM — предоставляет AI-агентам доступ к файловой системе сервера через [Model Context Protocol](https://modelcontextprotocol.io/) (stdio transport).

Использует [@boristype/ws-client](../ws-client/) для соединения с WSHCM сервером.

Статус: прототип. Требуется Node.js >=24.22.2. Сборка, упаковка и MCP protocol
проверяются локально; работа на конкретной версии HCM этим шагом не подтверждена.

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

| Tool                   | Описание                       | Annotations                         |
| ---------------------- | ------------------------------ | ----------------------------------- |
| `wshcm_read_file`      | Чтение файла по x-local:// URL | `readOnlyHint: true`                |
| `wshcm_write_file`     | Запись файла по x-local:// URL | `destructiveHint: true, idempotent` |
| `wshcm_list_directory` | Листинг директории             | `readOnlyHint: true`                |
| `wshcm_delete_file`    | Удаление файла                 | `destructiveHint: true`             |

Деструктивные операции (`write_file`, `delete_file`) помечены `destructiveHint: true`.
Это подсказка MCP-клиенту; необходимость и способ пользовательского подтверждения
определяет клиент. Сервер не реализует отдельный механизм подтверждения.

Семь заготовок (move/edit/multiple-read/create-directory/search/tree/get-info)
сохранены в исходниках для дальнейшей работы, но не регистрируются как tools.

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

### Что остаётся проверить

- Создание evaluator записывает временный `.bs` на сервер даже для чтения.
- Cleanup пока привязан к SIGINT/SIGTERM; завершение по EOF и ошибки
  инициализации требуют отдельной доработки.
- Native поведение путей, кодировок, прав, удаления и записи ещё не аттестовано.
  Локальные JS-проверки экранирования не доказывают обработку всех control escapes
  в C-runtime.
- Read/list требуют string result; неожиданный тип возвращается как tool error.
  Общий SOAP parser пока допускает отсутствие ResultData как `undefined`.
