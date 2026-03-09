# Структура документации BorisType

> Обновлено: 26 февраля 2026  
> Статус: Актуальна после реорганизации

## Обзор

Документация BorisType организована по принципу **разделения аудитории**:

- **docs/** — для пользователей (external documentation)
- **ref/** — для разработчиков и контрибьюторов (internal reference)

---

## docs/ — User Documentation

Документация для пользователей BorisType. Будет опубликована на сайте проекта.

### docs/guides/

Пошаговые руководства по использованию инструментария:

- **dev-mode.md** — работа в режиме разработки с автоматической пересборкой
- **push-deploy.md** — развертывание на платформу WebSoft HCM
- **testing.md** — тестирование BorisScript кода

### docs/reference/

API и CLI справочники:

- **artifact-command.md** — команда `btc artifact` для создания архивов
- **borisscript-constraints.md** — ограничения целевого языка
- **btconfig.md** — конфигурация проекта через `btconfig.json`
- **btconfig-properties.md** — детальное описание полей конфигурации
- **compile-modes.md** — режимы компиляции (build, watch, incremental)
- **package-types.md** — типы пакетов при линковке (standalone, component, system, library)

### docs/ (корень)

- **Linking.md** — пользовательское руководство по системе линковки

---

## ref/ — Developer Reference

Внутренняя документация для разработчиков и контрибьюторов.

### ref/architecture/

Архитектура системных компонентов:

- **build-pipeline.md** — конвейер сборки и компиляции
- **dev-mode.md** — архитектура watch mode и DevCoordinator
- **ir-pipeline.md** — промежуточное представление (IR) для транспиляции
- **ir-transformations.md** — реестр всех IR преобразований TypeScript → BorisScript
- **linking-system.md** — детальная архитектура системы линковки
- **monorepo.md** — организация monorepo (pnpm, turborepo, changesets)
- **push-system.md** — система деплоя на WebSoft HCM

### ref/decisions/

ADR (Architecture Decision Records) — почему были приняты те или иные решения:

- **001-ir-over-transformers.md** — переход на IR вместо TypeScript трансформеров
- **002-unified-linking.md** — объединение двух режимов линковки в один
- **003-nullish-check-optional-chaining.md** — реализация optional chaining
- **004-incremental-linking.md** — инкрементальная линковка для dev mode
- **005-pnpm-monorepo-migration.md** — миграция на pnpm workspaces
- **006-unified-env-resolution.md** — унифицированное разрешение env для функций
- **007-decouple-system-packages.md** — отвязка system-пакетов от зависимостей компилятора

### ref/proposals/

Предложения будущих фич:

- **github-actions-ci.md** — шаблон CI/CD для GitHub Actions

---

## Правила работы с документацией

### Где размещать новые документы

| Тип документа            | Директория          | Пример                               |
| ------------------------ | ------------------- | ------------------------------------ |
| Руководство пользователя | `docs/guides/`      | "Как настроить multi-package проект" |
| API/CLI справочник       | `docs/reference/`   | "Команда btc push"                   |
| Архитектура компонента   | `ref/architecture/` | "Как работает env resolution"        |
| Архитектурное решение    | `ref/decisions/`    | "Почему выбрали pnpm, а не yarn"     |
| Предложение фичи         | `ref/proposals/`    | "Source maps support"                |

### Когда обновлять документацию

Согласно `.github/copilot-instructions.md`:

- **docs/** — при изменении user-facing поведения
- **ref/decisions/** — при принятии архитектурного решения
- **ref/architecture/** — при изменении внутренней реализации
- **Package README** — при изменении публичного API пакета
- **ROADMAP.md** — при добавлении/завершении фич

### Cross-references

Используйте относительные пути:

```markdown
<!-- Из docs/guides/ на docs/reference/ -->

[Параметры btconfig](../reference/btconfig.md)

<!-- Из ref/architecture/ на docs/ -->

[Пользовательское руководство](../../docs/Linking.md)

<!-- Из ref/decisions/ на ref/architecture/ -->

[Архитектура линковки](../architecture/linking-system.md)
```

---

## История реорганизации

**Дата:** 26 февраля 2026

### Перемещенные файлы

| Было                                                      | Стало                                           | Причина                         |
| --------------------------------------------------------- | ----------------------------------------------- | ------------------------------- |
| `ref/linking.md`                                          | `ref/architecture/linking-system.md`            | Архитектурный документ          |
| `ref/dev.md`                                              | `ref/architecture/dev-mode.md`                  | Архитектурный документ          |
| `ref/transformations.md`                                  | `ref/architecture/ir-transformations.md`        | Архитектурный документ          |
| `ref/artifact.md`                                         | `docs/reference/artifact-command.md`            | CLI reference для пользователей |
| `docs/Linking-types.md`                                   | `docs/reference/package-types.md`               | API reference для пользователей |
| `ref/ci-template.md`                                      | `ref/proposals/github-actions-ci.md`            | Proposal будущей фичи           |
| `docs/btconfig.md`                                        | `docs/reference/btconfig.md`                    | API reference                   |
| `ref/proposals/decouple-system-packages-from-compiler.md` | `ref/decisions/007-decouple-system-packages.md` | Реализован как ADR              |

### Обновленные ссылки

Все cross-references обновлены для соответствия новой структуре.

---

## См. также

- [.github/copilot-instructions.md](.github/copilot-instructions.md) — правила работы с документацией
- [ROADMAP.md](ROADMAP.md) — статус проекта и планируемые фичи
