# Стратегия версионирования

## Обзор

Проект использует **Changesets** для управления версиями в monorepo.
Версии обновляются **только через changesets**, никогда вручную.

---

## Группы пакетов

### Fixed-группа (user-facing пакеты)

Все пакеты, которые пользователь ставит напрямую, имеют **одинаковую версию**:

| Пакет                      | Роль                       |
| -------------------------- | -------------------------- |
| `@boristype/bt-cli`        | Основной CLI транспилятора |
| `@boristype/runtime`       | Polyfills для BorisScript  |
| `@boristype/eslint-plugin` | ESLint правила             |

**`fixed`** означает: если хоть один пакет из группы получил changeset — все бампятся до одной версии. Это гарантирует, что у пользователя всегда совместимый набор.

### Независимые пакеты (internal)

Версионируются самостоятельно, бампятся только при реальных изменениях:

| Пакет                   | Роль                                    |
| ----------------------- | --------------------------------------- |
| `@boristype/bt-ir`      | Ядро транспилятора (зависимость bt-cli) |
| `@boristype/ws-client`  | Клиент WebSoft HCM                      |
| `@boristype/ws-version` | Конверсия версий                        |

### Игнорируемые пакеты

Не публикуются, не участвуют в версионировании:

- `botest`, `botest-builtins` — тестовая инфраструктура
- `boristype-tests` — тесты
- Все examples

---

## Конфигурация (.changeset/config.json)

```json
{
  "fixed": [["@boristype/bt-cli", "@boristype/runtime", "@boristype/eslint-plugin"]],
  "linked": [],
  "access": "public",
  "updateInternalDependencies": "patch",
  "ignore": ["botest", "botest-builtins", "boristype-tests", ...]
}
```

### Ключевые параметры

- **`fixed`** — пакеты в массиве всегда имеют одинаковую версию.
- **`linked`** — пустой (не нужен при `fixed`).
- **`updateInternalDependencies: "patch"`** — если внутренняя зависимость бампится, зависящий от неё пакет тоже получает patch bump. Например: bt-ir бампится → bt-cli автоматически бампится → вся fixed-группа бампится.

---

## Рабочий процесс (workflow)

### 1. Создание changeset (во время разработки)

```bash
npx changeset
```

Интерактивно:

1. Выбираешь затронутые пакеты
2. Выбираешь тип бампа: `patch` / `minor` / `major`
3. Пишешь описание изменения

Результат: файл `.changeset/<random-name>.md` — **коммитишь вместе с кодом**.

> Версии в `package.json` **не меняются** на этом этапе.

### 2. Накопление changesets

Можно создать много changesets за несколько коммитов/PR. Каждый фиксирует отдельное изменение. Версии всё ещё не меняются.

### 3. Релиз — применение changesets

```bash
npx changeset version
```

Что происходит:

- Все накопленные `.changeset/*.md` применяются
- Версии в `package.json` обновляются
- `CHANGELOG.md` обновляется
- `.changeset/*.md` файлы удаляются
- Fixed-группа получает единую версию

### 4. Публикация

```bash
git add -A
git commit -m "chore: release"
npx changeset publish
```

Что происходит:

- `npm publish` для каждого бампнутого пакета
- Git-теги создаются автоматически (формат: `@boristype/bt-cli@0.2.0`)

---

## Цепочка автоматических бампов

Пример: изменили только `bt-ir`:

```
bt-ir changeset (patch)
  → bt-ir: 0.2.0-alpha.1 → 0.2.0-alpha.2
  → updateInternalDependencies: "patch"
    → bt-cli зависит от bt-ir → bt-cli получает patch bump
    → bt-cli в fixed-группе → runtime и eslint-plugin тоже бампятся
  → Итог: bt-ir @ alpha.2, fixed-группа @ единая новая версия
```

Пример: изменили только `runtime`:

```
runtime changeset (minor)
  → runtime в fixed-группе
  → Все пакеты fixed-группы бампятся до одной minor версии
  → bt-ir НЕ затрагивается
```

---

## Git-теги

- **Fixed-группа:** `changeset publish` создаёт теги `@boristype/bt-cli@X.Y.Z`, `@boristype/runtime@X.Y.Z` и т.д. — все с одинаковой версией.
- **Независимые:** `@boristype/ws-client@X.Y.Z` — своя версия.
- Опционально можно добавлять короткий тег `vX.Y.Z` для core-релизов (вручную или через CI).

---

## Правила

1. **Никогда** не меняй `version` в `package.json` вручную (кроме разового выравнивания).
2. **Всегда** создавай changeset для значимых изменений.
3. Один changeset = одно логическое изменение (может затрагивать несколько пакетов).
4. Тип бампа выбирай по semver:
   - `patch` — исправления, внутренние улучшения
   - `minor` — новая функциональность (обратно совместимая)
   - `major` — breaking changes
5. На alpha-стадии: используй `patch` для большинства изменений.

---

## Pre-release режим (alpha)

Текущие версии имеют формат `0.1.0-alpha.N`. Changesets поддерживает pre-release mode:

```bash
# Войти в pre-release mode
npx changeset pre enter alpha

# Работаешь как обычно: npx changeset, npx changeset version
# Версии будут: 0.2.0-alpha.0, 0.2.0-alpha.1, ...

# Выйти из pre-release mode (для стабильного релиза)
npx changeset pre exit
```

---

## Начальная настройка (одноразово)

Перед первым использованием fixed-группы нужно выровнять версии всех пакетов группы до одной:

1. Привести `bt-cli`, `runtime`, `eslint-plugin` к одной версии в `package.json`
2. Обновить `config.json` (заменить `linked` на `fixed`)
3. Закоммитить и опубликовать
4. Дальше changesets поддерживает синхронность автоматически
