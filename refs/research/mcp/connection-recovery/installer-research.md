# Регистрация stdio MCP в клиентах

Исследование от 2026-11-18. Возможны штатные команды клиентов, тонкий адаптер
для нескольких клиентов или дистрибуция через plugin/deep link. Выбор клиентов
и реализация установщика остаются открытыми.

## Штатные команды и область регистрации

```sh
codex mcp add hcm-dev -- boristype-mcp --host hcm.example --port 443 --https
claude mcp add --transport stdio --scope local hcm-dev -- boristype-mcp --host hcm.example --port 443 --https
```

Это синтаксис из документации, команды регистрации здесь не запускались.
Подставьте параметры своего HCM и передайте `WSHCM_USERNAME` и
`WSHCM_PASSWORD` через приватное окружение запуска. Список tools доступен,
даже если HCM выключен.

- Codex. Установленный `codex mcp add --help` подтверждает форму
  `--env KEY=VALUE -- COMMAND ARGS` и не предлагает scope flag.
  Глобальная запись находится в `~/.codex/config.toml`. Trusted project может
  иметь собственный `.codex/config.toml`. Для передачи имён переменных
  окружения дочернему процессу в TOML предусмотрен `env_vars`.
  [Документация Codex](https://learn.chatgpt.com/docs/extend/mcp?surface=cli).
- Claude Code. `--scope local` — личная запись для текущего проекта в
  `~/.claude.json`, `--scope project` — общая `.mcp.json` в проекте,
  `--scope user` — личная глобальная запись. Флаги `--env` располагаются
  перед разделителем `--`. [Документация Claude Code](https://code.claude.com/docs/en/mcp#scope).
- Cursor. Проектная `.cursor/mcp.json` и личная `~/.cursor/mcp.json` поддерживают
  подстановку `${env:NAME}`. Install link содержит имя и base64 JSON и открывает
  регистрацию в клиенте. В общей ссылке должны быть только публичные параметры.
  [Настройка Cursor](https://cursor.com/docs/mcp), [install links](https://cursor.com/docs/mcp/install-links).
- VS Code. Записи привязаны к config destination и выбранному harness.
  Проверена документация интерфейса управления. Поддержка `--add-mcp`
  на конкретной версии здесь не проверялась.
  [Управление MCP](https://code.visualstudio.com/docs/agents/run/manage-mcp-servers),
  [настройки агентов](https://code.visualstudio.com/docs/agent-customization/mcp-servers).

## Возможный адаптер

Адаптер может принимать явные client, name и scope, показывать preview и
удалять точно названную запись. Несколько HCM используют разные имена.
Для scope, поддержанного клиентом, регистрацию можно делегировать его CLI.
Для прямой записи конфигурации потребуются правила обработки конфликтов и
сохранения соседних записей, а также выбор приватного источника credentials.

`fastmcp install claude-code server.py` формирует параметры запуска и вызывает
штатный `claude mcp add`. Это пример делегирования регистрации клиенту.
[Реализация подхода в FastMCP](https://gofastmcp.com/docs/integrations/claude-code),
[справочник команды](https://gofastmcp.com/docs/cli/install-mcp.md).
