### Описание проекта

Проект — это инструментарий для транспиляции **ограниченного подмножества TypeScript** в целевой язык **BorisScript (BS)**.
BorisScript синтаксически похож на JavaScript, но **не является JS** и работает в сильно ограниченной платформенной среде.
Цель проекта — расширить возможности программирования на BorisScript без изменения самой платформы.

---

### Основные компоненты

Проект организован как **pnpm monorepo** (все пакеты в `packages/`).

* **@boristype/bt-cli** (`packages/bt-cli/`)
  Основной транспилятор (BorisType Compiler).
  Использует TypeScript Compiler API и bt-ir для преобразования TS-кода в валидный BorisScript.
  
  Структура:
  * `cli/` — команды CLI (`build`, `dev`, `link`, `push`)
  * `core/building/` — BuildPipeline: компиляция, watch mode, DevCoordinator
  * `core/linking/` — линковка модулей и зависимостей
  * `core/pushing/` — push на WebSoft HCM сервер, реинициализация модулей

* **@boristype/bt-ir** (`packages/bt-ir/`)
  IR pipeline — транспиляция TypeScript → BorisScript через промежуточное представление.

* **@boristype/ws-client** (`packages/ws-client/`)
  Клиент WebSoft HCM для загрузки и реинициализации модулей.

* **@boristype/ws-version** (`packages/ws-version/`)
  Конверсия семантических версий в формат WebSoft.

* **botest** (`packages/botest/`)
  Утилита для:
  * эмуляции выполнения BorisScript внутри JavaScript;
  * тестирования корректности работы транспилятора.

* **@boristype/runtime** (`packages/builtin-runtime/`)
  Runtime-библиотека (polyfills) для BorisScript.

* **@boristype/botest-builtins** (`packages/builtin-botest/`)
  Встроенные функции для тестирования в BorisScript.

* **tests/** (`tests/`)
  Набор тестов:
  * каждая директория — отдельный тестовый набор;
  * `_suite.json` — оглавление и конфигурация набора;
  * остальные файлы — сами тесты.

* **examples/** (`examples/`)
  Примеры проектов:
  * `single/` — одиночный пакет
  * `multi/` — мультипакетный проект
  * `library/` — библиотека
  * `component/` — компонент

---

### Архитектурные особенности

* Проект находится в состоянии активной разработки.
* Все новые изменения **должны быть хорошо документированы** с использованием **JSDoc**.
* **Требуется Node.js 22+** и **pnpm 10+**.

#### Monorepo инструменты

* **pnpm workspaces** — управление пакетами, единый lockfile
* **Turborepo** — параллельная сборка с кэшированием (`npx turbo run build`)
* **syncpack** — выравнивание версий зависимостей
* **Changesets** — версионирование и changelog
* Межпакетные зависимости используют `workspace:*` протокол
* Подробнее: `ref/architecture/monorepo.md`

#### Watch mode (dev)

* **DevCoordinator** координирует multi-package сборку
* Ждёт initial build всех пакетов перед первой линковкой
* Инкрементальная линковка (только изменённые файлы)
* Auto-push с debounced queue (500ms)
* Persistent DeploySession на всё время dev mode
* TypeScript: `ts.createWatchProgram` с `noEmit: true`, emit через bt-ir
* Non-TS файлы отслеживаются через chokidar

---

### Целевой язык и ограничения

BorisScript — язык для **простых скриптов** с минимальными возможностями:
* Нет `let`/`const` — только `var`
* Нет стрелочных функций, деструктуризации, spread в runtime
* Нет `for...of`, только `for...in` и классический `for`
* Ограниченная поддержка объектов и массивов

Модульность:
* Реализован собственный `require`
* `import/export` преобразуются bt-ir lowering
* Результат компиляции — набор `.js` файлов в `build/`

---

### Linking (важный этап)

После транспиляции выполняется **linking**:
* Собираются все модули и зависимости
* Формируется итоговая структура в `dist/`
* `dist` копируется в директорию платформы

Конфигурация линковки: `btconfig.json`

---

### Общие требования к коду

* Учитывать ограничения BorisScript и платформы
* Не использовать неподдерживаемые возможности JS/TS
* Предпочитать явные и предсказуемые преобразования
* Поддерживать читаемость и документацию
* Писать JSDoc для всех публичных функций и типов

### Работа с репозиторием
* При запуске разных команд всегда четко указывай путь через cd или Set-Location - чтобы избежать проблем с тем, что текущая директория не там, где ожидается.

---

## Архитектура документации

### Структура

| Директория | Назначение | Аудитория | Обновляется когда |
|------------|------------|-----------|-------------------|
| **docs/** | External docs (future website) | Users | User-facing behavior changes |
| **docs/guides/** | User guides, tutorials | Users | Features change |
| **docs/reference/** | API reference, CLI options | Users | API/CLI changes |
| **ref/architecture/** | System internals | Developers | Implementation changes |
| **ref/decisions/** | ADR - why decisions made | Reviewers | Architectural decisions |
| **ref/algorithms/** | Algorithm details | Implementers | Algorithm changes |
| **ref/proposals/** | Future features | Contributors | New ideas |
| **{package}/README.md** | Package API + usage | Users | Public API changes |
| **ROADMAP.md** | Project status | All | Features added/completed |

### Правила обновления (ОБЯЗАТЕЛЬНО!)

При реализации фич/фиксов:
- [ ] **docs/** обновлены если user-facing behavior изменился
- [ ] **ref/decisions/** содержит ADR если было архитектурное решение
- [ ] **ROADMAP.md** обновлён (Backlog → In Progress → Done)
- [ ] **Package README** обновлён если публичный API изменился
- [ ] После завершения — проверить что вся документация актуальна

### ADR Format (ref/decisions/)

```markdown
# {Number}. {Title}

**Date:** YYYY-MM-DD  
**Status:** Accepted | Rejected | Superseded

## Context
Problem or decision context

## Decision
What we decided

## Consequences
Pros, cons, trade-offs

## Alternatives Considered
What else we looked at
```

### Ключевые файлы для контекста

При работе с btc/bt-ir/botest — читать:
- **ref/architecture/{component}.md** — как устроено
- **ref/decisions/*.md** — почему так решили  
- **docs/guides/*.md** — как пользователи это используют