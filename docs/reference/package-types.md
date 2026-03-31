# Типы пакетов при линковке

Документ описывает типы пакетов BorisType и логику их линковки в директорию `dist/`.

## Поле ws:name

> **Важно:** Поле `ws:name` является **обязательным** для всех пакетов кроме `library`.

`ws:name` — это "чистое" имя пакета, используемое:

- В путях (`components/<ws:name>`, `./wt/<ws:name>`)
- В `api_ext.xml` (`module:<ws:name>`)
- В именах файлов (`spxml/<ws:name>.xml`)

Это позволяет использовать scoped npm имена (`@scope/package`) без проблем с путями.

**Пример:**

```json
{
  "name": "@boristype/runtime",
  "ws:name": "bt-runtime",
  "ws:package": "system"
}
```

Пакет `@boristype/runtime` будет линковаться как `bt-runtime` в `components/bt-runtime`.

## Standalone

Самостоятельный исполняемый модуль. Инициализируется через `api_ext.xml`.

### Конфигурация package.json

```json
{
  "name": "@myorg/myapp",
  "ws:name": "myapp",
  "main": "index.js",
  "ws:package": "standalone",
  "ws:root": "./wt/myapp",
  "ws:apiext": {
    "name": "module:myapp",
    "libs": ["./init.xml"]
  }
}
```

**Обязательные поля:**

- `ws:package`: `"standalone"` (обратная совместимость: `"app"`)
- `ws:name`: имя для путей и api_ext

**Опциональные поля:**

- `ws:root`: путь внутри `dist/` (по умолчанию `./wt/<ws:name>`)
- `main`: точка входа (например `"index.js"`)
- `ws:apiext`: явная конфигурация для `api_ext.xml`

### Логика генерации init.xml

| `ws:apiext`  | `main`       | init.xml в build/ | Результат                                                     |
| ------------ | ------------ | ----------------- | ------------------------------------------------------------- |
| ✅ указан    | любой        | любой             | Используем `ws:apiext`, ничего не генерируем                  |
| ❌ не указан | ✅ указан    | ❌ нет            | Генерируем `init.xml`, добавляем в `api_ext.xml`              |
| ❌ не указан | ✅ указан    | ✅ есть           | Используем существующий `init.xml`, добавляем в `api_ext.xml` |
| ❌ не указан | ❌ не указан | любой             | Ничего не генерируем, нет записи в `api_ext.xml`              |

### Генерируемый init.xml

Создаётся только если отсутствует в `build/`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<SPXML-INLINE-FORM>
  <OnInit PROPERTY="1" EXPR="
    bt.require('index.js', 'x-local://wt/myapp')
  "/>
</SPXML-INLINE-FORM>
```

### Результат линковки

```
dist/
└── wt/
    └── myapp/              # из ws:root
        ├── index.js        # скомпилированный код
        ├── init.xml        # сгенерирован или из build/
        ├── .filemap.json   # маппинг executables (если есть)
        └── node_modules/
            └── ...         # library-зависимости
```

## Component

Компонент платформы. Инициализируется через файлы в `spxml/`, **не добавляется** в `api_ext.xml`.

### Конфигурация package.json

```json
{
  "name": "@myorg/other-app",
  "ws:name": "other-app",
  "main": "index.js",
  "ws:package": "component"
}
```

**Обязательные поля:**

- `ws:package`: `"component"`
- `ws:name`: используется для определения целевой папки и именования файлов

**Запрещённые поля:**

- `ws:root`: компоненты не могут иметь это поле (путь `components/<ws:name>` определяется автоматически)

### Файлы инициализации

Располагаются в `spxml/`. Генерируются только если отсутствуют в `build/`.

**`spxml/<name>.xml`:**

```xml
<?xml version="1.0" encoding="utf-8"?>
<SPXML-INLINE-FORM CODE-LIB="1">

<other-app>
</other-app>

</SPXML-INLINE-FORM>
```

**`spxml/<name>.js`:**

```js
function init() {
  try {
    alert("Component other-app initializing...");
    bt.require("index.js", "x-local://components/other-app/spxml");
    alert("Component other-app initialized");
  } catch (g_err) {
    alert("ERROR: Component initializing: other-app:\r\n" + g_err);
    throw g_err;
  }
}
```

### Генерируемый package.json

Для компонента создаётся `package.json` в формате платформы:

```json
{
  "name": "other-app",
  "version": "1.0.0.0",
  "description": "other-app",
  "enableByDefault": true,
  "dependencies": {},
  "type": "standard",
  "tags": ["#public"]
}
```

### Результат линковки

```
dist/
└── components/
    └── other-app/          # из ws:name
        ├── index.js        # скомпилированный код
        ├── package.json    # сгенерирован для платформы
        ├── .filemap.json   # маппинг executables (если есть)
        ├── spxml/
        │   ├── other-app.xml   # сгенерирован или из build/
        │   └── other-app.js    # сгенерирован или из build/
        └── node_modules/
            └── ...         # library-зависимости
```

## System

Системные пакеты, **полностью готовые** к линковке. Все необходимые файлы уже присутствуют в `build/`. **Ничего не генерируется** — только копирование.

### Особенности

- Режим линковки определяется через CLI флаг `--linking-system-as`
- По умолчанию линкуются как **component** (копируются в `components/<ws:name>`)
- Используются для системных модулей (runtime)
- System-пакеты обнаруживаются автоматически среди `dependencies`/`devDependencies` проекта по полю `ws:package: "system"`
- Если runtime не найден в зависимостях — выводится предупреждение
- Флаг `--external-runtime` позволяет пропустить линковку system-пакетов (когда runtime управляется извне)

### Режимы линковки

| Режим                      | Целевой путь           | api_ext.xml |
| -------------------------- | ---------------------- | ----------- |
| `component` (по умолчанию) | `components/<ws:name>` | ❌ Нет      |
| `standalone`               | из `ws:root`           | ✅ Да       |

## Library

Библиотечные пакеты. **Не являются самостоятельными модулями**.

### Особенности

- Копируются в `node_modules/` каждого Standalone/Component/System пакета
- Не имеют собственной точки входа и инициализации
- Не могут быть слинкованы напрямую

### Конфигурация package.json

```json
{
  "name": "@myorg/utils",
  "main": "index.js",
  "ws:package": "library"
}
```

### Логика копирования node_modules

При линковке пакета:

1. Сканируется `node_modules/` исходного пакета (discovery)
2. Копируются **только** пакеты с `ws:package: "library"`
3. Рекурсивно обрабатываются вложенные `node_modules/`
4. Поддерживаются scoped пакеты (`@scope/package`)
5. Поддерживаются symlink'и (pnpm workspace, `file:` зависимости)
6. Пропускаются служебные директории (`.bin`, `.git` и т.д.)

**Кэширование:**

- **Tier 1**: lockfile hash (pnpm-lock.yaml / package-lock.json, ищется поднимаясь к корню workspace) — если изменился, перекопируются все библиотеки
- **Tier 2**: per-library content hash для локальных (workspace) пакетов — если lockfile не изменился, копируются только библиотеки с изменённым контентом
- Cleanup: библиотеки, удалённые из зависимостей, автоматически удаляются из `dist/`

## Общие механизмы

### Executables и Filemap

Компилятор генерирует `.executables.json` для пакетов с executable objects.

**При линковке:**

- Читается `.executables.json` из `build/`
- Генерируется `.filemap.json` **per-module** (в каждом модуле отдельно)

### api_ext.xml

Общий файл конфигурации. Располагается в `dist/source/api_ext.xml`.

**Содержит записи для:**

- System пакетов в режиме `standalone`
- Standalone пакетов

**Не содержит:**

- Component пакеты
- System пакеты в режиме `component`
- Library пакеты

## Сводная таблица типов

| Тип            | ws:package          | ws:name        | ws:root                                     | Целевой путь           | Init файлы              | api_ext.xml       | node_modules          |
| -------------- | ------------------- | -------------- | ------------------------------------------- | ---------------------- | ----------------------- | ----------------- | --------------------- |
| **Standalone** | `standalone`, `app` | ✅ обязательно | опционально (по умолчанию `./wt/<ws:name>`) | из `ws:root`           | `init.xml` (если нужен) | ✅ Да             | ✅ Копируются         |
| **Component**  | `component`         | ✅ обязательно | ❌ запрещено                                | `components/<ws:name>` | `spxml/*` (если нужны)  | ❌ Нет            | ✅ Копируются         |
| **System**     | `system`, `bt`      | ✅ обязательно | для standalone                              | зависит от режима      | ❌ Не генерируются      | зависит от режима | ✅ Копируются         |
| **Library**    | `library`, `lib`    | ❌ не нужно    | —                                           | —                      | —                       | —                 | Является зависимостью |

## CLI опции

```bash
btc link [options]
```

| Опция                        | Описание                                                       | По умолчанию |
| ---------------------------- | -------------------------------------------------------------- | ------------ |
| `--clean`                    | Очистить `dist/` перед линковкой                               | `false`      |
| `--linking-system-as <mode>` | Режим линковки system пакетов: `standalone` или `component`    | `component`  |
| `--external-runtime`         | Пропустить линковку system-пакетов (runtime управляется извне) | `false`      |

**Примеры:**

```bash
btc link                              # System как component
btc link --clean                      # Очистить dist
btc link --linking-system-as standalone  # System как standalone
btc link --external-runtime           # Пропустить runtime
```
