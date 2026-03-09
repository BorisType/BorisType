# Система линковки (Linking)

Система линковки в BorisType отвечает за создание финальной структуры проекта в директории `dist/`, которая затем копируется в целевую платформу для выполнения BorisScript.

## Как работает линковка

Система линковки использует **единый механизм** для всех проектов:

1. Если **есть `btconfig.json`** — использует конфигурацию линковки из него
2. Если **нет `btconfig.json`** — автоматически создаёт виртуальную конфигурацию для текущего пакета

**Внутри используется один и тот же код линковки**. "Legacy режим" (без btconfig.json) — это просто автоматическое создание виртуального `btconfig` с одним пакетом.

## Одиночный пакет (без btconfig.json)

Если вы не создали `btconfig.json`, линковщик автоматически использует текущий пакет.

**Конфигурация через package.json:**

```json
{
  "name": "my-app",
  "main": "index.js",
  "ws:package": "app",
  "ws:root": "./wt/norbit"
}
```

**Ключевые поля:**

- `ws:package`: `"app"` или `"lib"` - тип пакета
- `ws:root`: путь внутри `dist/` куда будет скопирован `build/`
- `ws:apiext` (опционально): конфигурация API расширений

**Запуск:**

```bash
npx btc link
npx btc link --clean              # Очистить dist/ перед линковкой
npx btc link --linking-system-as standalone  # System пакеты как standalone
```

**Что происходит внутри:**  
Создаётся виртуальный btconfig: `{ packages: { ".": "." } }` и используется тот же механизм линковки, что и для multi-package проектов.

## Multi-package режим

Для монорепозиториев с несколькими пакетами создайте `btconfig.json` в корневой директории.

**Структура btconfig.json:**

```json
{
  "packages": {
    "backend": "./backend",
    "frontend": "./frontend",
    "library": "./library"
  }
}
```

Или с детальной конфигурацией линковки:

```json
{
  "linking": {
    "packages": [
      // BT пакет с ws:package: "app" - shorthand нотация
      {
        "name": "backend"
      },
      // Обычная директория - требуются source и target
      {
        "name": "frontend",
        "source": "./frontend/src",
        "target": "./wt/frontend"
      },
      // Можно переопределить пути для BT пакета
      {
        "name": "library",
        "source": "./library/build",
        "target": "./wt/lib"
      }
    ]
  }
}
```

**Поля конфигурации пакета:**

- **name** (string, обязательное): Имя директории пакета относительно корня проекта
- **source** (string, опциональное): Путь к директории с файлами для копирования
  - Для BT пакетов (с `ws:package: "app"` в package.json): по умолчанию `{name}/build`
  - Для обычных директорий: обязательное поле
- **target** (string, опциональное): Целевой путь внутри `dist/`
  - Для BT пакетов: по умолчанию берется из `ws:root` в package.json
  - Для обычных директорий: обязательное поле

**Shorthand нотация для BT пакетов:**

Если пакет содержит `package.json` с полем `ws:package: "app"`, можно использовать сокращенную запись:

```json
{
  "name": "backend" // автоматически: source="backend/build", target из ws:root
}
```

## Процесс линковки

### Legacy режим

1. Читает `package.json` текущего проекта
2. Анализирует зависимости и строит дерево зависимостей
3. Копирует `build/` в `dist/` с учетом `ws:root`
4. Копирует `node_modules` (только пакеты с `ws:package`)
5. Создает `init.xml` если указан `main`
6. Генерирует модуль `bt:filemap`
7. Создает `api_ext.xml`

### Multi-package режим

1. Читает `btconfig.json`
2. Загружает зависимости компилятора (polyfill)
3. Для каждого пакета в `linking.packages`:
   - Проверяет наличие `package.json` с `ws:package: "app"` (BT пакет)
   - Определяет `source`:
     - Если указан явно - использует его
     - Для BT пакетов - `{name}/build`
     - Для обычных директорий - обязательно указать
   - Определяет `target`:
     - Если указан явно - использует его
     - Для BT пакетов - из `ws:root` в package.json
     - Для обычных директорий - обязательно указать
   - Копирует содержимое `source` в `dist/target`
   - Для BT пакетов дополнительно:
     - Обрабатывает `.executables.json`
     - Копирует `node_modules`
     - Создает `init.xml` при необходимости
4. Копирует зависимости компилятора (polyfill) в начало списка
5. Генерирует модуль `bt:filemap`
6. Создает `api_ext.xml` с правильным порядком загрузки

## CLI опции

```bash
btc link [options]
```

| Опция                        | Описание                                                       | По умолчанию |
| ---------------------------- | -------------------------------------------------------------- | ------------ |
| `--clean`                    | Очистить `dist/` перед линковкой                               | `false`      |
| `--linking-system-as <mode>` | Режим линковки system пакетов                                  | `component`  |
| `--external-runtime`         | Пропустить линковку system-пакетов (runtime управляется извне) | `false`      |

### Режимы линковки system пакетов

System пакеты (polyfill, runtime) уже полностью готовы к линковке. Режим определяет целевой путь и регистрацию в `api_ext.xml`:

| Режим                      | Целевой путь        | api_ext.xml |
| -------------------------- | ------------------- | ----------- |
| `component` (по умолчанию) | `components/<name>` | ❌ Нет      |
| `standalone`               | из `ws:root`        | ✅ Да       |

Подробнее см. [package-types.md](reference/package-types.md#system).

## Итоговая структура dist/

```
dist/
├── wt/                     # Целевые пути из конфигурации
│   ├── backend/           # target из btconfig.json или ws:root
│   │   ├── index.js
│   │   ├── init.xml
│   │   ├── .filemap.json  # Маппинг executables (per-module)
│   │   ├── ...
│   │   └── node_modules/
│   └── frontend/          # обычная директория
│       ├── index.html
│       └── ...
├── components/            # Компоненты и system-пакеты в режиме component
│   ├── bt-polyfill/       # System пакет (по умолчанию сюда)
│   │   ├── init.xml
│   │   └── ...
│   └── my-component/      # Component пакет
│       ├── package.json   # Сгенерированный для платформы
│       ├── .filemap.json  # Маппинг executables (per-module)
│       └── spxml/
│           ├── my-component.xml
│           └── my-component.js
└── source/
    └── api_ext.xml        # Конфигурация API расширений
```

## Filemap (.filemap.json)

Маппинг для разрешения путей к исполняемым объектам (executable objects).

**Генерируется per-module** — каждый модуль содержит собственный `.filemap.json` в корне своей целевой директории.

**Формат:**

```json
{
  "packageName+packageVersion+filePath": "x-local://wt/myapp/path/to/file.js"
}
```

**Ключ формируется как:** `${packageName}+${packageVersion}+${filePath}`

> **Примечание:** Глобальный модуль `bt:filemap` больше не генерируется. Вместо этого каждый модуль содержит собственный `.filemap.json`.

## api_ext.xml

XML файл, описывающий API расширения для платформы. Генерируется на основе:

- Поля `ws:apiext` в `package.json` каждого standalone пакета
- Автоматически создаваемых расширений для модулей с `main`
- System пакетов в режиме `standalone`

**Не включает:**

- Component пакеты (инициализируются через `spxml/`)
- System пакеты в режиме `component`
- Library пакеты

**Пример:**

```xml
<?xml version="1.0" encoding="utf-8"?>
<api_ext>
  <apis>
    <api>
      <name>bt:polyfill</name>
      <libs>
        <lib>
          <path>x-local://wt/bt/polyfill/init.xml</path>
        </lib>
      </libs>
    </api>
    <api>
      <name>module:backend</name>
      <libs>
        <lib>
          <path>x-local://wt/backend/init.xml</path>
        </lib>
      </libs>
    </api>
  </apis>
</api_ext>
```

**Порядок загрузки критически важен:**

1. `bt:polyfill` - полифиллы для JS функций (если используется standalone режим)
2. Пользовательские модули

## Копирование node_modules

Система автоматически копирует зависимости из `node_modules`, но **только те пакеты**, которые содержат поле `ws:package` в своем `package.json`.

**Поддерживаемые типы:**

- `ws:package: "standalone"` (или legacy `"app"`) - самостоятельный модуль
- `ws:package: "component"` - компонент платформы
- `ws:package: "system"` (или legacy `"bt"`) - системный пакет
- `ws:package: "library"` (или legacy `"lib"`) - библиотечный пакет

Подробнее см. [package-types.md](reference/package-types.md).

**Особенности:**

- Следует по symlinks (например, для `file:` зависимостей)
- Рекурсивно копирует вложенные `node_modules`
- Пропускает `.git`, `.bin` и другие служебные директории
- Поддерживает scoped пакеты (`@scope/package`)

## Примеры использования

### Простой проект (legacy)

```json
// package.json
{
  "name": "my-app",
  "main": "index.js",
  "ws:package": "app",
  "ws:root": "./wt/app"
}
```

```bash
npx btc build              # Компиляция
npx btc link               # Линковка
npx btc link --clean       # Линковка с очисткой dist/
```

### Мульти-пакетный проект

```
my-project/
├── btconfig.json
├── package.json
├── backend/
│   ├── src/
│   ├── package.json
│   └── tsconfig.json
└── frontend/
    ├── src/
    ├── package.json
    └── tsconfig.json
```

```bash
# В каждом подпроекте
cd backend && npx btc build && cd ..
cd frontend && npx btc build && cd ..

# В корне проекта
npx btc link
```

## TypeScript типы

Типы для `btconfig.json` определены в [`btc/src/core/btconfig.types.ts`](../btc/src/core/btconfig.types.ts):

```typescript
export type BtConfigLinkingPackage = {
  name: string; // Обязательное - имя директории пакета
  source?: string; // Опциональное - путь к файлам
  target?: string; // Опциональное - целевой путь в dist/
};

export type BtConfigLinking = {
  packages: BtConfigLinkingPackage[];
};

export type BtConfig = {
  linking?: BtConfigLinking;
};
```

**Логика определения source и target:**

- Если пакет содержит `ws:package: "app"` (BT пакет):
  - `source` по умолчанию: `{name}/build`
  - `target` по умолчанию: значение `ws:root` из package.json
- Если обычная директория:
  - `source` и `target` обязательны

## Миграция со старой системы

Для миграции существующего проекта на новую систему:

1. Создайте `btconfig.json` в корне проекта
2. Переместите логику в `linking.packages`
3. Старые настройки в `package.json` можно оставить для совместимости

Система автоматически определит какой режим использовать на основе наличия `btconfig.json`.
