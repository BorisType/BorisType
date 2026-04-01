# Proposal 005: Platform Objects Sync

**Дата:** 2026-04-01  
**Статус:** Proposal  
**Связанные компоненты:** bt-cli (commands, linking), ws-client, runtime

## Проблема

В платформе WebSoft HCM данные хранятся как объекты: XML-документ + catalog (часть полей из XML в столбцах БД). Некоторые типы объектов необходимы для работы кода — например `server_agent` (управляет запуском), `group` (группы пользователей), шаблоны и т.д.

Сейчас перенос объектов между серверами (dev → prod) выполняется вручную через веб-панель платформы: нужно ходить по объектам и добавлять их в XML-пакет. Это:

- Легко забыть нужный объект
- Нет версионирования
- Нет связи с кодом, который зависит от этих объектов
- Сложно управлять при командной разработке

## Решение

Интегрировать в `btc` команду `objects pull`, которая:

1. Подключается к серверу
2. Запрашивает объекты, изменённые с последней синхронизации
3. Фильтрует по типам (только нужные: `server_agent`, `group` и т.д.)
4. Интерактивно предлагает выбрать объекты и распределить по пакетам
5. Сохраняет XML-файлы в репозиторий

Объекты загружаются в БД на целевом сервере через рантайм при инициализации — аналогично тому, как загружается `.filemap.json`.

## Архитектура

### Только per-package

Объекты хранятся **только внутри пакетов**, без отдельного shared-уровня.

Причины:

- Возможность создать два независимых репозитория для одного сервера без конфликтов
- Если нужен "shared" пакет для общих объектов — пользователь создаёт его как обычный пакет с `objects/`
- Проще реализация: scan packages → collect objects → done
- Достаточно описать в гайде как организовать shared-объекты при необходимости

### Структура файлов

Файлы объектов располагаются в `objects/` внутри каждого пакета, группируются по типу. Имя файла — ID объекта.

#### Multi-package

```
multi/
├── btconfig.json
├── backend/
│   ├── package.json
│   ├── objects/
│   │   └── server_agent/
│   │       └── 6EA83B2F00A4B.xml
│   └── src/
├── service/
│   ├── package.json
│   ├── objects/
│   │   ├── server_agent/
│   │   │   └── 7FC92D4E00B5C.xml
│   │   └── group/
│   │       └── 8AD12E5F00C6D.xml
│   └── src/
```

#### Single-package

```
single/
├── package.json
├── objects/
│   └── server_agent/
│       └── 6EA83B2F00A4B.xml
└── src/
```

### Формат файлов

XML — оригинальный формат платформы. JSON был бы менее читаемым из-за специфики данных. В XML добавляется поле ID если его нет (это безопасно для платформы).

```xml
<!-- objects/server_agent/6EA83B2F00A4B.xml -->
<server_agent>
  <id>6EA83B2F00A4B</id>
  <code>calendar-sync</code>
  <name>Calendar Sync Agent</name>
  <schedule>0 */6 * * *</schedule>
  <script_url>x-local://wt/backend/agents/calendar-sync.js</script_url>
  <is_active>1</is_active>
</server_agent>
```

## Pull Flow

```
btc objects pull
  │
  ├─ connect to server (btconfig.properties)
  ├─ determine lastSync date:
  │   ├─ primary: .btc/objects-cache.json → lastSync
  │   └─ fallback: git log -1 --format=%cI (дата последнего коммита)
  │
  ├─ query objects where modification_date >= lastSync
  ├─ filter by btconfig.objects.include types
  │
  ├─ for each object:
  │   ├─ extract ID (добавить если нет)
  │   ├─ search {id}.xml across all packages' objects/ dirs
  │   ├─ if found → update in place (уже привязан к пакету)
  │   └─ if new → prompt: assign to which package?
  │
  ├─ write XML files: {package}/objects/{type}/{id}.xml
  └─ update .btc/objects-cache.json (lastSync + index)
```

### Интерактивный UI

```
$ btc objects pull

Connecting to localhost:80...
Fetching objects modified since 2026-03-28 (last sync)...

Found 5 modified objects:

  ┌───┬──────────────────────┬──────────────┬───────────────────┐
  │   │ Name                 │ Type         │ Modified          │
  ├───┼──────────────────────┼──────────────┼───────────────────┤
  │ ◉ │ Calendar Users       │ group        │ 2026-03-31 14:22  │
  │ ◉ │ Calendar Sync Agent  │ server_agent │ 2026-03-31 15:10  │
  │ ◉ │ Learning Check Agent │ server_agent │ 2026-03-31 15:30  │
  │ ◯ │ Test Group (temp)    │ group        │ 2026-03-30 10:00  │
  │ ◉ │ Common Settings      │ group        │ 2026-03-29 08:00  │
  └───┴──────────────────────┴──────────────┴───────────────────┘

  Select objects to pull (space to toggle, a to select all, enter to confirm):

  Assign "Calendar Sync Agent" to:
  > backend
    service

  Assign "Common Settings" to:
    backend
  > service

Pulled 4 objects. Run `git diff` to review changes.
```

## Linking — collectObjects (оптимизация через linking планируется, описанное в секции ниже не нужно реализовывать в первой итерации)

При линковке (`btc link`) для каждого пакета сканируются `objects/**/*.xml` и генерируется `.objectmap.json` — аналог `.filemap.json`:

```
btc link
  ├─ ... existing stages ...
  ├─ collectObjects()
  │   └─ for each package:
  │       scan {package}/objects/**/*.xml
  │       → copy XML files to dist/{target}/objects/
  │       → generate .objectmap.json
  └─ ...
```

`.objectmap.json` хранится рядом с `.filemap.json` в `dist/`:

```json
{
  "server_agent/6EA83B2F00A4B.xml": {
    "id": "6EA83B2F00A4B",
    "type": "server_agent",
    "name": "Calendar Sync Agent"
  }
}
```

## Push / Deploy

Отдельного этапа `pushObjects()` не нужно — XML-файлы попадают в `dist/` при линковке и загружаются на сервер в составе обычного `uploadDistToServer()`.

Загрузка объектов в БД происходит **в рантайме при инициализации** — аналогично `.filemap.json`. Рантайм находит XML-файлы и выполняет upsert в БД платформы.

```
Push pipeline (без изменений):
  ├─ uploadDistToServer()      ← objects уже в dist/
  ├─ resetRequireCache()
  └─ executeInitScripts()
           │
           └─ runtime init:
               ├─ bt.loadFilemap()       ← existing
               └─ bt.loadObjects()       ← NEW: upsert XML into DB
```

## Конфигурация btconfig.json

```jsonc
{
  "linking": {
    "packages": [{ "name": "backend" }, { "name": "service" }],
  },
  "objects": {
    // Типы объектов, которые нас интересуют при pull
    "include": ["group", "server_agent", "custom_template"],
  },
}
```

## Кэш

`.btc/objects-cache.json` — gitignored, хранит состояние синхронизации:

```jsonc
{
  "lastSync": "2026-03-31T16:00:00Z",
  "objects": {
    "6EA83B2F00A4B": { "type": "server_agent", "package": "backend" },
    "7FC92D4E00B5C": { "type": "server_agent", "package": "service" },
    "8AD12E5F00C6D": { "type": "group", "package": "service" },
  },
}
```

Определение `lastSync`:

1. **Primary** — из `.btc/objects-cache.json`
2. **Fallback** — дата последнего git-коммита (`git log -1 --format=%cI`)

## Этапы реализации

1. **Конфигурация** — расширить btconfig schema полем `objects.include`
2. **Pull command** — `btc objects pull` с подключением к серверу, фильтрацией, интерактивным UI
3. **Linking integration** — collectObjects + .objectmap.json в составе `btc link`
4. **Runtime loader** — `bt.loadObjects()` для upsert XML в БД при инициализации
5. **Dev mode** — watch за `objects/` директориями + incremental push

## Открытые вопросы

- Какие именно типы объектов поддерживаем в первой итерации?
- Нужен ли `btc objects push` для ручного принудительного upsert (без полного push)?
- Как обрабатывать конфликты: объект изменён и на сервере, и локально?
- Нужна ли команда `btc objects diff` для просмотра различий до pull?
