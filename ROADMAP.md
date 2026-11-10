# BorisType Roadmap

**Статус проекта:**  
**Текущая версия:** v0.2.x (компиляция на IR, push система, dev mode)  
**Этап:** Alpha - основные функции работают, активная разработка

---

## Текущий спринт (В процессе)

### MCP: XML object MVP (2026-11-10)

- [x] Раскрытая XMD через `wshcm_get_form`, полный XML объекта через `wshcm_get_object`
- [x] `wshcm_save_object`: create либо whole replace из исходного XML, без typed JSON mapping/DLL
- [x] Full-read tokens, bounded XML и строгий XML parser, native form/root/identity/cardinality/integer guards
- [x] Protocol/state/XML negatives и CLI/stdio/SOAP native acceptance на собственном `cost_center`
- [ ] Расширить native matrix на custom lifecycle/types, Windows/MSSQL, новую модель, external data и CAS/authorization

[Контракт](packages/mcp-server/README.md#xml-объектов-форма-чтение-сохранение),
[первая реализация и acceptance](plans/mcp-server/10-object-model/first-implementation.md).

### MCP: серверный XQuery (2026-11-07)

- [x] Один `wshcm_xquery` поверх существующего evaluator, включая `sql:`, без новой DLL
- [x] Ограниченный ответ, метаданные усечения, protocol/JS проверки и отсутствие автоматических повторов
- [x] Описать отсутствие read-only/rollback/cancellation гарантий и границы платформенной сериализации
- [x] `test:e2e:xquery` 10/10 на Linux C-runtime; повторить четыре файловые native серии после UTF-8 transport fix
- [x] Исправить разрезанные UTF-8 символы HTTP chunks; задокументировать negative integer formatting/SQL mapping и NULL/empty
- [ ] Полный контракт SQL типов, Windows/MSSQL и другие версии проверить отдельно

[Контракт и команда native acceptance](packages/mcp-server/README.md#серверный-xquery-и-sql).
[Результаты и platform quirks](plans/mcp-server/09-xquery-native.md).

### Ручное сопровождение зависимостей (2026-11-07)

- [x] Убрать Dependabot config и закрыть 14 накопившихся dependency PR
- [x] Обновить npm/NuGet и SHA pins Actions, включая Chokidar 6 и xUnit v3
- [x] Сохранить TypeScript 6 Compiler API, 14-дневный cooldown и provenance policy
- [x] Подтвердить Windows/Linux CI для watch events и нового test runner
- [ ] Вернуться к minimatch GHSA-g3hv-75wg-m249 после cooldown исправления

[Выбор версий, ограничения и проверки](plans/maintenance/2026-11-07-dependency-refresh.md).

### MCP: файловый checkpoint (2026-11-07)

- [x] Девять реализованных tools на standalone DLL alpha.4/API 2, без зарегистрированных заглушек
- [x] Native Linux acceptance, локальные regression suites и проверки npm/ZIP артефактов
- [x] Свести release notes к итоговому контракту; отделить известные ограничения от готового файлового шага

[Граница checkpoint, проверка PR и дальнейшие работы](plans/mcp-server/08-filesystem-checkpoint.md).

### Agent skills (2026-11-06)

- [x] Каталог `skills/` в текущем репозитории, независимый выбор через `npx skills add`
- [x] Первый `websoft-hcm`: переносимые правила evidence и справочник URL/ini без зависимости от компилятора/MCP
- [x] `boristype-mcp`: самостоятельная установка, файловые workflow/readToken и XQuery/SQL; общие instructions через MCP initialization
- [x] Добавить в `websoft-hcm` числовой справочник и исходники native probes; проверить применение установленного skill отдельно
- [ ] Развивать тематические справочники по подтверждённым наблюдениям и документации
- [x] Исследовать SQL storage routing на Linux C-runtime: x-local читает blob, x-app/file — диск; импорт локального файла при URL-чтении и границы физических tools
- [ ] Установить полный механизм регистрации корней: добавление DESIGN-DB/DATA-DB не разрешило новые hosts в Linux evaluator; Windows и другие runtime требуют своих проверок

[Каталог](skills/README.md), [установка](docs/guides/agent-skills.md),
[первый измеримый шаг и проверки](plans/skills/01-websoft-hcm.md).
[MCP usage и числовое дополнение](plans/skills/02-mcp-and-numbers.md).

### Обновление toolchain (2026-11-05)

- [x] Node.js 24.22.2: последние исправления ветки 24 LTS, включая TLS/certificate security fixes 24.22.1
- [x] pnpm 12.16.1; единые pins для разработки и обоих GitHub workflows
- [x] MCP dependency follow-up: fast-xml-parser 5.11.2 и @types/node 24.19.2, единые ranges и syncpack pins

Node закреплён в `.node-version`, pnpm — в `package.json#packageManager`.

### MCP: native e2e (2026-11-06)

- [x] Отдельная последовательная e2e-команда для четырёх tools через CLI/stdio/SOAP на локальном HCM 2025.2.1333; независимая проверка байтов и очистки
- [x] Исправить подтверждённые e2e ошибки: trailing SOAP whitespace, CRLF ответа, UTF-8 без BOM и утечку evaluator по EOF
- [ ] Полный path/encoding/limits contract, permissions, partial initialization и shutdown при активном SOAP

Evidence и границы: [MCP local e2e](plans/mcp-server/04-local-e2e.md).

### .NET workspace (2026-11-06)

- [x] Общая solution в packages/dotnet, отдельные C# проекты, SDK pin и locked NuGet restore
- [x] Первая BorisType.FileSystem DLL с metadata JSON API, без Datex dependency
- [x] Unit и installation ZIP checks, manifest hashes, отдельный Windows/Linux CI workflow
- [x] Перенести native probes из MCP, сохранить известное callback-падение и vendor reference boundary
- [x] Контракт ограниченного поиска: BS URL resolver, физические paths, UTF-8, glob/literal/regex и budgets
- [x] Поиск имён/содержимого в DLL и MCP adapter; managed/VM tests и отдельный bounded native runner
- [x] Ограниченная native acceptance поиска на Linux HCM 2025.2.1333 / CLR 9.0.11: resolver, bridge ABI, names/content/regex и cleanup
- [x] Read/write/list/delete через standalone DLL alpha.3, общий JSON bridge и explicit UTF-8/link/limits contract
- [x] Targeted edit: unique sequential replacements, preview/hash guard, BOM preservation; managed/protocol/native acceptance
- [x] Учёт выданных диапазонов и версий для edit/overwrite; границы MCP-сессии без гарантии разделения чатов агента
- [x] Довести файловое ядро до девяти tools: create_directory, move_file без overwrite, get_file_info
- [ ] Отложенное исследование атомарного compare-and-replace с внешними writers на Linux/Windows; текущая повторная проверка этой гарантии не даёт
- [ ] Acceptance поиска на Windows/других версиях HCM, permissions и полный path/encoding/limits contract

Структура: [workspace README](packages/dotnet/README.md),
[дизайн и критерии первого шага](plans/dotnet/01-workspace-design.md).
CI workflow настроен для двух ОС; это не свидетельство запусков HCM на Windows.
Поиск реализован без Datex callbacks и прошёл native e2e на одной Linux C-сборке.
[Контракт](plans/dotnet/04-search-design.md), [evidence](plans/dotnet/06-search-results.md).
Миграция file tools и edit: [contract](plans/dotnet/07-file-tools-design.md),
[native evidence](plans/dotnet/09-file-tools-results.md).
Учёт чтений и девять tools: [контракт](plans/dotnet/11-read-aware-files-design.md),
[результаты](plans/dotnet/13-read-aware-files-results.md).

### Граница поддержки и память (2026-11-05)

- [x] Сохранить F-02a/E-01 research/test checkpoint: cases, baseline, prototypes, draft spec
- [x] Зафиксировать приостановку развития script/module до решения lifetime/циклов на C
- [x] Сохранить реализации, defaults и regression checks всех трёх режимов
- [ ] Исследовать и принять стратегию памяти, затем подтвердить её ограниченными C memory tests

Поддерживаемое направление развития сейчас — **bare**; это не гарантия отсутствия
пользовательских циклов или полная JS-семантика.
[ADR и условия возобновления](ref/decisions/2026-11-05-script-module-memory-freeze.md),
[checkpoint](plans/ts-bs-semantics/results/2026-11-05-research-checkpoint.md).

### Миграция на pnpm monorepo

- [x] Структура packages/ (bt-cli, bt-ir, ws-client, ws-version, botest, builtin-runtime, builtin-botest)
- [x] pnpm workspaces + единый lockfile
- [x] Turborepo (параллельная сборка, кэширование)
- [x] syncpack (выравнивание версий)
- [x] Changesets (версионирование)
- [x] Разрыв цикла bt-cli ↔ runtime (peerDependencies)
- [x] postversion script (exact versions)
- [x] ADR-005: monorepo migration
- [ ] CI/CD pipeline (GitHub Actions)
- [ ] Обновление @boristype/types (LoadUrlText optional arg)

### Консолидация документации

- [x] Комплексная структура документации (docs/ vs ref/)
- [x] Документация push системы
- [x] Документация dev mode
- [x] Справка по режимам компиляции
- [x] Package-level README (файлы bt-ir, botest)
- [x] ADR (записи архитектурных решений)
- [x] Архив устаревшей документации
- [x] Технический контракт ограничений BorisType: compile modes, JS/C evidence, output invariants и known miscompilations (2026-10-07)

### BT-IR Multi-Pass Refactoring (2026-03)

- [x] Phase 1: Extract helpers, split expressions/statements/emitter
- [x] Phase 2: IR passes (try-finally desugar, hoist), walker infrastructure
- [x] Phase 3: ModeConfig, замена ctx.mode проверок
- [x] ADR-011: Multi-pass refactoring

### Structured control flow (#13, 2026-10)

- [x] Synchronous labels, lexical target resolver и unified try/finally pass
- [x] Catch shadowing/capture, strict Node ↔ JS BorisScript matrix, output fast paths
- [x] Superseding ADR, diagnostics и обновление recommended ESLint preset
- [x] IR workaround для comma-update в C for: native continue/finalizer timing, output invariant
- [x] Независимая C smoke проверка: Check27Fixed `0FU1FU2FU|E`, полный pack `OK: 60/60` (2026-10-07)
- [x] PR review: positional BT90018, checked pass dependency, labelled collector traversal, mandatory manual execution gates
- [ ] Multiple declarations в classic for initializer без silent loss ([#28](https://github.com/BorisType/BorisType/issues/28))
- [ ] Безопасное CI provisioning JS runtime и required execution gates ([#29](https://github.com/BorisType/BorisType/issues/29))
- [ ] Fail-closed botest на пустой выборке/неизвестных фильтрах ([#30](https://github.com/BorisType/BorisType/issues/30))

### TS → BS semantic correctness (2026-10)

- [x] Иерархический research/spec/task/evidence план в `plans/ts-bs-semantics`
- [x] Первый expression baseline: 23 cases / 48 comparisons, exact XFAIL и процессный watchdog
- [x] Pending producer/consumer audit; A/B/C/inline prototypes и structural cost report
- [ ] Два C expression shape probes (готовы, ожидают ручного запуска)
- [ ] После решения памяти: принять evaluation spec/ADR и выполнить первый маленький production slice
- [ ] Остальные family inventories, interactions и JS/C acceptance (script/module on hold)

Результаты и границы: [expression research](plans/ts-bs-semantics/research/01-expression-evaluation-results.md).
38 наблюдаемых miscompilations пока не исправлены; это evidence, не новая feature guarantee.

### Опыт разработчика

- [ ] Лучшие сообщения об ошибках в bt-ir компиляторе
- [ ] Поддержка source map для отладки
- [ ] Команда btc init для скаффолдинга проектов

---

## Вехи

### v0.3.0 - Производительность и инструменты

**Цель:** Q1 2025  
**Фокус:** Опыт разработчика и производительность сборки

#### Функции

- [ ] Инкрементальная компиляция (только изменённые файлы)
- [x] Параллельная сборка для multi-package проектов (Turborepo)
- [ ] Оптимизация btc watch (более быстрые пересборки)
- [ ] Индикаторы прогресса для долгих операций
- [ ] Лучшее отображение TypeScript диагностики

#### Push система

- [ ] Параллельная загрузка чанков
- [ ] Оптимизация file handle (повторное использование открытых файлов для чанков)
- [ ] Возобновление загрузки при ошибках сети
- [ ] Dry-run режим (проверка изменений без загрузки)

#### Линковка

- [ ] Обнаружение осиротевших пакетов (удаление старых пакетов из dist/)
- [ ] Умная инвалидация кеша для `file:` зависимостей (отслеживание mtime)
- [ ] Сводка результатов линковки (что было скопировано/пропущено)

#### CLI

- [x] btc push (реализовано)
- [x] btc dev (реализовано)
- [ ] btc init (скаффолдинг нового проекта)
- [ ] btc doctor (диагностика распространённых проблем)
- [ ] btc clean (удаление build/dist/cache)

#### Тестирование

- [ ] Отчёты о code coverage
- [ ] Watch режим для тестов
- [ ] Параллельное выполнение тестов

---

### v0.4.0 - Языковые возможности

**Цель:** Q2 2025  
**Фокус:** Расширение поддерживаемых возможностей TypeScript

#### Поддержка TypeScript

- [ ] Приватные поля класса (`#field`)
- [ ] Декораторы (базовая поддержка)
- [ ] Async/await (если возможно в BorisScript)
- [ ] Генераторы (ограниченная поддержка)
- [ ] Symbol (полифил)

#### Ограничения BorisScript

- [ ] Комплексное руководство по исправлению приоритета операторов
- [ ] Best practices для for-in итерации массивов
- [ ] Бенчмарки производительности замыканий

#### Runtime Polyfill

- [ ] Map/Set polyfill
- [ ] Promise polyfill (базовый)
- [ ] Дополнительные методы Array (flatMap, at и т.д.)
- [ ] Методы Object (fromEntries, entries и т.д.)

---

### v0.5.0 - Экосистема

**Цель:** Q3 2025  
**Фокус:** Распространение пакетов и повторное использование

#### Управление пакетами

- [ ] bt-registry - централизованный репозиторий пакетов
- [ ] btc publish команда
- [ ] Версионирование и semver-совместимость
- [ ] Улучшения разрешения зависимостей

#### Стандартная библиотека

- [ ] std/collections - продвинутые структуры данных
- [ ] std/async - асинхронные утилиты
- [ ] std/testing - тестовые утверждения
- [ ] std/fs - утилиты файловой системы (если платформа поддерживает)

#### Примеры

- [ ] Примеры реальных приложений
- [ ] Руководство по best practices
- [ ] Руководство по миграции (JS → BorisType)
- [ ] Руководство по оптимизации производительности

---

### v1.0.0 - Production Ready

**Цель:** Q4 2025  
**Фокус:** Стабильность, документация, долгосрочная поддержка

#### Стабильность

- [ ] Полное тестовое покрытие (>90%)
- [ ] Нет известных критических ошибок
- [ ] Бенчмарки производительности
- [ ] Оптимизация использования памяти

#### Документация

- [ ] Полный API reference
- [ ] Интерактивный туториал
- [ ] Видео-руководства
- [ ] Руководство по устранению неполадок

#### Инструменты

- [ ] VS Code расширение (синтаксис, отладка)
- [ ] Улучшения ESLint plugin
- [ ] Prettier plugin
- [ ] Шаблоны CI/CD

#### MCP Server (`@boristype/mcp-server`)

- [x] Пакет mcp-server: файловые операции (read/write/list/delete) через x-local:// URL
- [x] MCP maintenance baseline: зависимости актуального main, runtime resources в tarball, только реализованные tools, локальные protocol/SOAP regression tests
- [x] MCP native acceptance: девять tools и read guards на Linux HCM 2025.2.1333 / CLR 9.0.11; byte/hash и lifecycle/EOF checks
- [ ] Acceptance на Windows HCM и полный permissions/VFS/shutdown-during-SOAP contract
- [ ] Tool: выполнение произвольного BorisScript кода (`execute_bs`)
- [ ] Tool: XQuery запросы к каталогам БД
- [ ] Tool: чтение/обновление XML объектов в БД

---

## Известные проблемы

### Линковка

- **Осиротевшие пакеты в dist/** - Удалённые пакеты остаются до `--clean`
  - **Workaround (решение):** Используйте `--clean` или удалите вручную
  - **Статус:** Запланировано для v0.3.0
- **Инвалидация кеша для `file:` зависимостей** - На основе `package-lock.json` / `pnpm-lock.yaml`
  - **Workaround (решение):** Используйте `--no-cache` или удалите `.btc/linking-cache.json`
  - **Статус:** Запланировано для v0.3.0

### Push система

- Последовательная загрузка чанков (медленно для больших файлов)
  - **Статус:** Запланировано для v0.3.0

---

## Backlog (Не запланировано)

### Возможности

- [ ] Удалённые зависимости пакетов (как npm)
- [ ] BorisScript REPL
- [ ] Протокол отладчика (подключение Node.js debugger к BorisScript)
- [ ] Hot module replacement (HMR)
- [ ] Tree shaking (удаление мёртвого кода)
- [ ] Минификация/обфускация

### Исследования

- [ ] WebAssembly target (компиляция TS → WASM → BorisScript FFI)
- [ ] Альтернативные backend (LLVM IR, другие VM)
- [ ] JIT компиляция для BorisScript
- [ ] Статический анализ (неиспользуемые переменные, ошибки типов)

### Экосистема

- [ ] Комьюнити реестр пакетов
- [ ] Поиск/обнаружение пакетов
- [ ] Автоматизированный сервис тестирования
- [ ] Интеграции CI/CD (GitHub Actions и т.д.)

---

## Завершённые вехи

### v0.2.0 (ноябрь 2024) ✅

**Компиляция на IR**

- [x] Замена trансformers на IR pipeline
- [x] Единый анализ scope
- [x] BindingManager для отслеживания переменных
- [x] Система CompileMode (bare/script/module)
- [x] Комплексный набор тестов

**Система сборки**

- [x] Архитектура BuildPipeline
- [x] DevCoordinator (multi-package сборки)
- [x] Watch режим с инкрементальной линковкой
- [x] Команда btc dev

**Push система**

- [x] Интеграция с WebSoft HCM (@boristype/ws-client)
- [x] Жизненный цикл DeploySession
- [x] Механизм Reinit (hot reload)
- [x] Команда btc push
- [x] Авто-push в dev режиме
- [x] Поддержка btconfig.properties

**Линковка**

- [x] Единый механизм линковки
- [x] Виртуальный btconfig для single-package проектов
- [x] Инкрементальная линковка (только изменённые файлы)
- [x] Конверсия Semver → .NET версия

### v0.1.0 (март 2024) ✅

**Первый релиз**

- [x] Базовая транспиляция TypeScript → BorisScript
- [x] Подход на transformer
- [x] Команда btc build
- [x] Команда btc link
- [x] Поддержка multi-package
- [x] Базовые polyfill (Array, String)
- [x] Test runner (botest)

---

## Участие в Roadmap

Есть идеи для функций или улучшений? См. [Руководство по участию](CONTRIBUTING.md) _(будущий файл)_.

**Формула приоритета:**

1. **Запросы пользователей** - что разработчикам действительно нужно
2. **Блокеры** - проблемы, препятствующие использованию
3. **Quick wins** - высокая польза, низкие затраты
4. **Фундамент** - возможности, необходимые для будущей разработки

---

## История версий

| Версия | Дата    | Основное                                         |
| ------ | ------- | ------------------------------------------------ |
| v0.2.2 | 2026-02 | Миграция на pnpm monorepo, Turborepo, Changesets |
| v0.2.1 | 2024-12 | Единая линковка, обновление документации         |
| v0.2.0 | 2024-11 | IR pipeline, push система, dev mode              |
| v0.1.0 | 2024-03 | Первый релиз, transformer-based                  |

---

## Статусные значки

**Легенда:**

- ✅ **Done (Готово)** - Реализовано и задокументировано
- 🚧 **In Progress (В процессе)** - Активно ведётся работа
- 📋 **Planned (Запланировано)** - В конкретной вехе
- 💡 **Backlog** - Хорошая идея, не запланировано
- 🔬 **Research (Исследование)** - Требует изучения

---

**Последнее обновление:** 2026-02  
**Поддерживается:** BorisType Core Team

Для детального статуса реализации, см.:

- [Project Issues](https://github.com/user/BorisType/issues) _(когда публичный)_
- [Changelog](CHANGELOG.md)
- [Архитектурные решения](ref/decisions/)
