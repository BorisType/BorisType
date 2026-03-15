# @boristype/mcp-server

MCP сервер для WebSoft HCM — предоставляет AI-агентам доступ к файловой системе сервера через [Model Context Protocol](https://modelcontextprotocol.io/) (stdio transport).

Использует [@boristype/ws-client](../ws-client/) для соединения с WSHCM сервером.

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

Деструктивные операции (`write_file`, `delete_file`) помечены `destructiveHint: true` — клиент (VS Code, Claude Desktop) запросит подтверждение у пользователя перед выполнением.

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
| `--host`     | `WSHCM_HOST`     | Хост сервера       | —            |
| `--port`     | `WSHCM_PORT`     | Порт сервера       | `80`         |
| `--username` | `WSHCM_USERNAME` | Имя пользователя   | —            |
| `--password` | `WSHCM_PASSWORD` | Пароль             | —            |
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
# Сборка
pnpm build

# Тестирование через MCP Inspector
npx @modelcontextprotocol/inspector node packages/mcp-server/build/cli.js -- --host localhost --port 80 --username admin --password secret
```
