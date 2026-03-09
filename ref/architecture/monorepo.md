# Архитектура monorepo

## Обзор

BorisType использует **pnpm workspaces** с Turborepo для управления сборкой.  
Все пакеты расположены в `packages/`, тесты в `tests/`, примеры в `examples/`.

**Инструменты:**

- **pnpm 10** — workspace manager, единый lockfile
- **Turborepo** — параллельная сборка, кэширование, граф `^build`
- **syncpack** — выравнивание версий зависимостей
- **Changesets** — версионирование и changelog

**ADR:** [005-pnpm-monorepo-migration](../decisions/005-pnpm-monorepo-migration.md)

## Структура

```
BorisType/
├── packages/
│   ├── bt-cli/            # @boristype/bt-cli — CLI компилятор
│   ├── bt-ir/             # @boristype/bt-ir — IR pipeline
│   ├── ws-client/         # @boristype/ws-client — WebSoft HCM клиент
│   ├── ws-version/        # @boristype/ws-version — конверсия версий
│   ├── botest/            # botest — тест-раннер (private)
│   ├── builtin-runtime/   # @boristype/runtime — BS polyfills
│   └── builtin-botest/    # @boristype/botest-builtins — BS тест-утилиты (private)
├── tests/                 # boristype-tests — набор тестов (private)
├── examples/
│   ├── single/            # Одиночный пакет
│   ├── multi/             # Мульти-пакетный проект
│   ├── library/           # Библиотека
│   └── component/         # Компонент
├── turbo.json             # Turborepo pipeline
├── pnpm-workspace.yaml    # Workspace definition
├── .syncpackrc.json       # Syncpack rules
└── .changeset/            # Changesets config
```

## Граф зависимостей

```
ws-version ─────────┐
ws-client ──────────┤
bt-ir ──────────────┤
                    ▼
              bt-cli (CLI)
                │
      ┌─────────┼──────────┐
      ▼         ▼          ▼
   runtime  builtin-   examples/
   (peer)   botest     tests
```

**Порядок сборки (Turborepo `^build`):**

1. **Параллельно:** bt-ir, ws-client, ws-version, botest (нет зависимостей)
2. **bt-cli** (зависит от bt-ir, ws-client, ws-version)
3. **Параллельно:** runtime, builtin-botest, tests, library, multi (зависят от bt-cli)
4. **Параллельно:** single, component, backend (зависят от bt-cli + library)

## Циклическая зависимость bt-cli ↔ runtime

Runtime использует `btc build` для компиляции в BorisScript.  
bt-cli резолвит runtime при линковке пользовательских проектов.

**Решение:** `@boristype/runtime` в `peerDependencies` bt-cli.  
Turbo видит только production-зависимости → граф ацикличен.

**Proposal:** [decouple-system-packages-from-compiler](../proposals/decouple-system-packages-from-compiler.md)

## Workspace протокол

Все межпакетные зависимости используют `workspace:*`:

```json
{
  "dependencies": {
    "@boristype/bt-ir": "workspace:*"
  },
  "devDependencies": {
    "@boristype/bt-cli": "workspace:*"
  }
}
```

При публикации pnpm автоматически заменяет `workspace:*` на конкретную версию.

## Версионирование

- **Changesets** — linked group: bt-cli, bt-ir, runtime (версии синхронизированы)
- **postversion script** (`scripts/postversion.js`) — пинит bt-ir и runtime к exact версиям в bt-cli
- **syncpack** — выравнивает typescript, @types/node, fast-xml-parser

### Процесс релиза

```sh
pnpm changeset          # Создать changeset (описание изменений)
pnpm version            # changeset version + postversion script
pnpm publish -r         # Публикация всех изменённых пакетов
```

## Команды

```sh
# Сборка всех пакетов (с кэшированием)
npx turbo run build

# Запуск тестов
npx turbo run test

# Проверка консистентности версий
pnpm check-versions

# Добавить пакет в workspace
pnpm add -D <pkg> --filter @boristype/bt-cli

# Установить все зависимости
pnpm install
```

## Конфигурационные файлы

| Файл                     | Назначение                                   |
| ------------------------ | -------------------------------------------- |
| `pnpm-workspace.yaml`    | Список workspace-пакетов                     |
| `turbo.json`             | Pipeline задач (build, test, dev)            |
| `.syncpackrc.json`       | Правила выравнивания версий                  |
| `.changeset/config.json` | Linked groups, ignore list                   |
| `.npmrc`                 | pnpm settings (ignore-scripts, etc.)         |
| `scripts/postversion.js` | Пиннинг exact-версий после changeset version |
