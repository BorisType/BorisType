# 005. Миграция на pnpm monorepo

**Date:** 2026-02-23  
**Status:** Accepted

## Context

Проект BorisType состоит из 7+ пакетов (bt-cli, bt-ir, ws-client, ws-version, botest, builtin-runtime, builtin-botest) и 5 примеров. До миграции каждый пакет имел отдельный `package-lock.json`, зависимости между пакетами указывались через `file:../../path` ссылки, а сборка шла через ручные последовательные скрипты в root package.json.

Проблемы:

- **14 lockfile-ов** — невозможно гарантировать консистентность зависимостей
- **`file:` ссылки** — хрупкие, ломаются при перемещении пакетов, не поддерживают версионирование
- **Ручной порядок сборки** — root `build` скрипт последовательно вызывал `cd ./dir && npm run build` для каждого пакета
- **Нет кэширования сборок** — каждый билд пересобирал всё с нуля
- **Нет инструментов для синхронизации версий** и публикации

## Decision

Мигрировать на **pnpm workspaces** с Turborepo, syncpack и Changesets.

### Структура

```
packages/
├── bt-cli/          → @boristype/bt-cli (CLI компилятор)
├── bt-ir/           → @boristype/bt-ir (IR pipeline)
├── ws-client/       → @boristype/ws-client (WebSoft HCM клиент)
├── ws-version/      → @boristype/ws-version (семантическое версионирование)
├── botest/          → botest (тест-раннер, private)
├── builtin-runtime/ → @boristype/runtime (BS polyfills)
└── builtin-botest/  → @boristype/botest-builtins (BS тест-утилиты, private)
```

### Инструменты

| Инструмент | Версия  | Назначение                                          |
| ---------- | ------- | --------------------------------------------------- |
| pnpm       | 10.30.1 | Workspace manager, единый lockfile                  |
| Turborepo  | 2.7.5   | Параллельная сборка, кэширование, граф зависимостей |
| syncpack   | 13.0.4  | Выравнивание версий зависимостей                    |
| Changesets | 2.29.8  | Версионирование и changelog                         |

### Ключевые решения

1. **Scope convention:** публикуемые пакеты → `@boristype/*`, приватные → без scope (но с `private: true`)
2. **`workspace:*` протокол** для всех межпакетных зависимостей
3. **Циклическая зависимость bt-cli ↔ runtime** разорвана переносом `@boristype/runtime` в `peerDependencies` bt-cli (runtime использует bt-cli для сборки, bt-cli резолвит runtime при линковке)
4. **Exact versions** для критических зависимостей bt-cli (bt-ir, runtime) — postversion скрипт убирает `^` после `changeset version`
5. **Linked versioning** — bt-cli, bt-ir, runtime версионируются вместе через Changesets linked group

## Consequences

### Плюсы

- Единый `pnpm-lock.yaml` — детерминированные установки
- `turbo build` — параллельная сборка с кэшированием (2.7s cached vs 6s cold)
- `syncpack list-mismatches` — мгновенная проверка консистентности версий
- `workspace:*` — зависимости всегда резолвятся на локальные пакеты
- Changesets — структурированный процесс версионирования и публикации

### Минусы

- pnpm strict mode может требовать явного указания зависимостей (нет phantom deps)
- Turbo не поддерживает циклические зависимости — пришлось переносить runtime в peerDependencies
- Разработчикам нужно установить pnpm (`corepack enable` или `npm i -g pnpm`)

### Риски

- `fast-xml-parser` был обновлён с v4 → v5 через syncpack — возможны breaking changes в ws-client (требует проверки)
- `@boristype/types` остаётся внешним npm пакетом — при обновлении нельзя использовать workspace протокол

## Alternatives Considered

1. **npm workspaces** — рассматривался, но нет strict isolation, нет единого lockfile quality как у pnpm, хуже поддержка monorepo tooling
2. **Yarn Berry (PnP)** — слишком агрессивный подход (PnP), плохая совместимость с некоторыми инструментами
3. **Nx** — более тяжеловесный, избыточен для текущего размера проекта
4. **Оставить как есть** — не решает ни одной из описанных проблем
