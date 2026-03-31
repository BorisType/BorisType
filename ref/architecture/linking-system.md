# Система линковки BorisType

## Назначение

**Linking (линковка)** — обязательный этап после транспиляции TypeScript → BorisScript.

Цель: собрать все необходимые модули и зависимости в единую структуру директории `dist/`, которая затем копируется на платформу WebSoft HCM для выполнения.

---

## Текущая реализация

### Унифицированный механизм линковки

Система использует **единый механизм** линковки для всех случаев:

- Одиночный пакет (без `btconfig.json`) работает как частный случай multi-package режима
- Multi-package режим поддерживает несколько пакетов с различными типами

**Выбор режима:** автоматический

- Если `btconfig.json` присутствует → использует конфигурацию из него
- Если отсутствует → создается виртуальный `btconfig` для текущего проекта

**Внутренняя реализация:** используется единый `processPackagesLinking()` с автоопределением режима. Для одиночных пакетов `resolvePackagesToLink()` создает виртуальный список пакетов из текущего package.json.

---

### Одиночный пакет (без btconfig.json)

**Конфигурация через package.json:**

```json
{
  "name": "my-app",
  "version": "1.0.0",
  "main": "index.js",
  "ws:package": "standalone",
  "ws:root": "./wt/myapp"
}
```

**Ключевые поля:**

- `ws:package`: тип пакета
  - `"standalone"` — автономное приложение (обратная совместимость: `"app"`)
  - `"component"` — компонент платформы
  - `"system"` — системный пакет (обратная совместимость: `"bt"`)
  - `"library"` — библиотека, не линкуется напрямую (обратная совместимость: `"lib"`)
- `ws:root`: путь внутри `dist/` для `standalone` (обязательно)
  - **Для `component`:** НЕ должен быть указан, используется `./components/{package.name}`
- `main`: точка входа → создается `init.xml` или файлы в `spxml/` для компонентов
- `ws:apiext`: (опционально) кастомная конфигурация API расширений

**Процесс:**

1. Читает `package.json` текущего проекта
2. Создает виртуальный список пакетов (через `resolvePackagesToLink()`)
3. Загружает системные зависимости (runtime, polyfill)
4. Определяет тип пакета через `normalizePackageType()` (маппинг: app→standalone, lib→library, bt→system)
5. Копирует `build/` → `dist/{target}/` где target:
   - `standalone`: из `ws:root`
   - `component`: автоматически `./components/{package.name}`
6. Копирует `node_modules` (только пакеты с `ws:package: "library"`)
7. Создает `init.xml` для `standalone` или файлы в `spxml/` для `component`
8. Для `component`: создает `package.json` (component.json) в корне
9. Генерирует per-module `.filemap.json` для executable objects
10. Создает `api_ext.xml` с порядком загрузки (компоненты исключаются)

**Запуск:**

```bash
npx btc build          # Компиляция TS → BS
npx btc link           # Линковка
```

---

### Multi-package режим

**Конфигурация через btconfig.json:**

```json
{
  "$schema": "./schemas/btconfig.schema.json",
  "linking": {
    "packages": [
      // standalone пакет - shorthand нотация
      {
        "name": "backend"
        // ws:package: "standalone" в package.json
        // source="backend/build" (auto), target из ws:root (auto)
      },
      // component пакет - shorthand нотация
      {
        "name": "my-component"
        // ws:package: "component" в package.json
        // source="my-component/build" (auto)
        // target="./components/{package.name}" (auto, ws:root запрещен)
      },
      // Обычная директория - полная запись
      {
        "name": "frontend",
        "source": "./frontend/src",
        "target": "./wt/frontend"
      },
      // BT пакет с переопределением source
      {
        "name": "utils",
        "source": "./utils/dist"
        // target из ws:root в package.json
      }
    ]
  }
}
```

**Поля BtConfigLinkingPackage:**

| Поле     | Тип    | Обязательность | Описание                                         |
| -------- | ------ | -------------- | ------------------------------------------------ |
| `name`   | string | ✅ Всегда      | Имя директории пакета относительно корня проекта |
| `source` | string | ⚠️ Условно     | Путь к файлам для копирования                    |
| `target` | string | ⚠️ Условно     | Целевой путь внутри `dist/`                      |

**Условная обязательность:**

Система определяет тип пакета через функцию `normalizePackageType()` (маппинг: app→standalone, lib→library, bt→system):

**Для executable BorisType пакетов** (`ws:package: "standalone"`, `"component"`, `"system"`):

- `source` опционально:
  - Явно указан → используется указанный путь **(приоритет)**
  - Не указан → `{name}/build` **(по умолчанию)**
- `target` опционально:
  - **Для `component`:** автоматически `./components/{package.name}`, `ws:root` **ЗАПРЕЩЕН**
  - **Для `standalone`:**
    - Явно указан → используется указанный путь **(приоритет)**
    - Не указан → берется `ws:root` из package.json **(fallback)**
    - Ничего не указано → **ОШИБКА**

**Для library пакетов** (`ws:package: "library"`):

- **НЕЛЬЗЯ** добавлять в `btconfig.json` напрямую
- Копируются только в `node_modules/` других пакетов

**Для обычных директорий** (нет `ws:package`):

- `source` **ОБЯЗАТЕЛЬНО**
- `target` **ОБЯЗАТЕЛЬНО**

**Shorthand нотация для BT пакетов:**

```json
{
  "name": "backend"
  // автоматически: source="backend/build", target из ws:root
}
```

**Процесс:**

1. Читает `btconfig.json` (или создает виртуальный через `resolvePackagesToLink()`)
2. **STAGE 1:** Загружает системные зависимости (runtime, polyfill)
   - Находит system-пакеты в `node_modules`
   - Линкует через `linkPackage()` → `systemLinker` (только копирование, всё уже готово)
   - Режим линковки определяется `--linking-system-as` (component/standalone)
3. **STAGE 2:** Для каждого пакета в `linking.packages`:
   - Парсит `package.json` → `normalizePackageType()` → определяет тип
   - Проверка на `library`: **ERROR** (нельзя линковать напрямую)
   - Определяет `source` (приоритет: явный > `{name}/build` > error)
   - Определяет `target`:
     - `component`: автоматически `./components/{package.name}`, проверка на `ws:root` → **ERROR**
     - `standalone`: приоритет: явный > `ws:root` > error
     - Обычная директория: обязательно
   - Собирает executables из `.executables.json`
   - Линкует через `linkPackage()` → диспатч на нужный linker:
     - `standaloneLinker`: копирование, генерация `init.xml`, `.filemap.json`, запись в `api_ext.xml`
     - `componentLinker`: копирование, генерация `spxml/`, `package.json` (component.json), `.filemap.json`
   - Копирует `node_modules` (только пакеты с `ws:package: "library"`)
4. **STAGE 3:** Создает `api_ext.xml`:
   - Собирает `apiExtEntries` из всех слинкованных пакетов
   - Порядок: system пакеты → пользовательские standalone пакеты
   - Компоненты НЕ включаются (apiext = undefined)

**Запуск:**

```bash
# Компиляция каждого BT пакета
cd backend && npx btc build && cd ..

# Линковка из корня
npx btc link
```

---

## Итоговая структура dist/

### Одиночный пакет

```
dist/
├── wt/
│   └── myapp/              # ws:root
│       ├── index.js
│       ├── utils.js
│       ├── init.xml
│       ├── .filemap.json   # per-module executables маппинг
│       └── node_modules/
├── components/             # system пакеты в режиме component (по умолчанию)
│   └── bt-runtime/
│       └── ...
└── source/
    └── api_ext.xml
```

### Multi-package режим

```
dist/
├── components/             # директория для component и system-component пакетов
│   ├── bt-runtime/         # system пакет в режиме component (по умолчанию)
│   │   └── ...
│   └── my-component/       # component пакет
│       ├── index.js
│       ├── package.json    # component.json (метаданные компонента)
│       ├── .filemap.json   # per-module executables маппинг
│       ├── node_modules/
│       └── spxml/          # файлы инициализации компонента
│           ├── my-component.xml
│           └── my-component.js
├── wt/
│   ├── backend/            # standalone пакет (target из ws:root или btconfig)
│   │   ├── index.js
│   │   ├── init.xml
│   │   ├── .filemap.json   # per-module executables маппинг
│   │   ├── ...
│   │   └── node_modules/
│   └── frontend/           # обычная директория (target из btconfig)
│       ├── index.html
│       └── assets/
└── source/
    └── api_ext.xml         # НЕ содержит components (у них своя логика)
```

---

## Ключевые компоненты

### 1. Filemap (.filemap.json)

**Назначение:** разрешение путей к executable objects (исполняемым объектам)

**Генерируется per-module** — каждый executable пакет содержит собственный `.filemap.json` в корне своей целевой директории.

**Содержимое:**

- `.filemap.json` — маппинг ключей вида `${packageName}+${packageVersion}+${filePath}` на URL

**Формат:**

```json
{
  "my-app+1.0.0+agents/my-agent.js": "x-local://wt/myapp/agents/my-agent.js"
}
```

**Ключ формируется как:** `${packageName}+${packageVersion}+${filePath}`

> **Примечание:** Глобальный модуль `bt:filemap` больше не генерируется. Вместо этого каждый пакет содержит собственный `.filemap.json`.

**Executable objects** — это специальные объекты BorisScript, которые могут быть выполнены платформой (агенты, обработчики событий и т.д.). Транспилятор отмечает их в `.executables.json`, а система линковки создает маппинг для доступа к ним по ключу.

---

### 2. component.json (package.json для компонентов)

**Назначение:** метаданные компонента для платформы WebSoft HCM

**Генерируется автоматически** для пакетов с типом `component`.

**Содержимое:**

```json
{
  "name": "my-component",
  "version": "1.0.0.0",
  "description": "Component description",
  "enableByDefault": true,
  "dependencies": {},
  "type": "standard",
  "tags": ["#public"]
}
```

**Поля:**

- `name` — из `package.json`
- `version` — из `package.json`
- `description` — из `package.json` (или `name` если отсутствует)
- `enableByDefault` — всегда `true`
- `dependencies` — всегда пустой объект
- `type` — всегда `"standard"`
- `tags` — всегда `["#public"]`

**Расположение:** `dist/components/{package-name}/package.json`

**Файлы инициализации компонента:**

- `spxml/{name}.xml` — SPXML шаблон с тегом компонента
- `spxml/{name}.js` — функция `init()` для загрузки модуля через `bt.polyfill.require`

---

### 3. api_ext.xml

**Назначение:** конфигурация API расширений для платформы WebSoft HCM

XML файл, описывающий какие модули должны быть загружены и в каком порядке.

**Генерируется автоматически** на основе:

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
    <!-- 1. System пакеты (runtime) — если используется standalone режим -->
    <api>
      <name>bt:runtime</name>
      <libs>
        <lib>
          <path>x-local://wt/bt/runtime/init.xml</path>
        </lib>
      </libs>
    </api>

    <!-- 2. Пользовательские standalone модули -->
    <!-- ВАЖНО: component пакеты НЕ включаются (своя логика загрузки) -->
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

**⚠️ КРИТИЧЕСКИ ВАЖНО: порядок загрузки**

Модули загружаются строго последовательно в порядке объявления в `api_ext.xml`:

1. System пакеты (runtime) — должны быть первыми
2. Пользовательские standalone модули — после системных

Нарушение порядка приведет к ошибкам выполнения.

**Расположение:** `dist/source/api_ext.xml`

---

### 4. Копирование node_modules

Система автоматически копирует зависимости из `node_modules`, но **только те пакеты**, которые содержат поле `ws:package: "library"` в своем `package.json`.

**Двухуровневое кэширование:**

Для оптимизации повторных линковок используется двухуровневый кэш (`.btc/linking-cache.json`):

- **Tier 1 — Lockfile hash**: SHA256 от `pnpm-lock.yaml` или `package-lock.json`. Lockfile ищется поднимаясь от директории пакета к корню workspace (поддержка monorepo). Если lockfile hash изменился — все библиотеки перекопируются.
- **Tier 2 — Per-library content hash**: Для каждой локальной (workspace/file) библиотеки вычисляется SHA256 от содержимого файлов. Если lockfile не изменился, проверяются только локальные библиотеки — копируются только те, чей контент изменился.

**Определение локальных пакетов:**

В pnpm все пакеты представлены как symlinks. Различие:

- **Локальный пакет**: symlink, чей `realpath` находится ВНЕ `node_modules/` (указывает на workspace-директорию)
- **Registry пакет**: symlink, чей `realpath` внутри `node_modules/.pnpm/` (content-addressable store)

**Cleanup**: Если библиотека была в кэше, но больше не найдена в `node_modules`, она удаляется из `dist/`.

**Флаги:**

- `--no-cache` — отключает кэш (полное копирование каждый раз)
- `--clean` — удаляет кэш и `dist/` перед линковкой

**Особенности:**

- Следует по symlinks (поддержка pnpm workspace и `file:` зависимостей)
- Рекурсивно копирует вложенные `node_modules`
- Пропускает служебные директории: `.git`, `.bin`, `node_modules/.cache`, и т.д.
- Поддерживает scoped пакеты (`@boristype/runtime`)

---

### 5. init.xml и spxml/ файлы

**Назначение:** инициализация модуля при загрузке платформы

Создается автоматически для executable BT пакетов (`standalone`, `component`, `bt`), которые имеют поле `main` в `package.json`.

**Для standalone и bt пакетов:**

**Файл:** `init.xml`

**Содержимое:**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<SPXML-INLINE-FORM>
  <OnInit PROPERTY="1" EXPR="
    bt.polyfill.require.require('index.js', 'x-local://wt/backend')
  "/>
</SPXML-INLINE-FORM>
```

**Расположение:** `dist/{target}/init.xml`

**Для component пакетов:**

**Файлы:** `spxml/{name}.xml` и `spxml/{name}.js`

**spxml/{name}.xml:**

```xml
<?xml version="1.0" encoding="utf-8"?>
<SPXML-INLINE-FORM CODE-LIB="1">

<my-component>
</my-component>

</SPXML-INLINE-FORM>
```

**spxml/{name}.js:**

```javascript
function init() {
  try {
    alert("Component my-component initializing...");
    bt.polyfill.require.require("index.js", "x-local://components/my-component/spxml");
    alert("Component my-component initialized");
  } catch (g_err) {
    alert("ERROR: Component initializing: my-component:\\r\\n" + g_err);
    throw g_err;
  }
}
```

**Расположение:** `dist/components/{package-name}/spxml/`

---

## TypeScript типы

Полные определения типов: [`packages/bt-cli/src/core/config.ts`](../../packages/bt-cli/src/core/config.ts)

```typescript
export type BtConfigLinkingPackageBase = {
  name?: string; // Имя пакета или "." для текущего
  source?: string; // Путь к source директории (default: ./build)
  target?: string; // Целевой путь в dist/ (default: ws:root)
};

export type BtConfigLinkingPackage = BtConfigLinkingPackageBase & {
  name: string; // ОБЯЗАТЕЛЬНО для пакетов в packages[]
};

export type BtConfigLinking = BtConfigLinkingPackageBase & {
  packages?: BtConfigLinkingPackage[]; // Multi-package конфигурация
};

export type BtConfig = {
  $schema?: string;
  linking?: BtConfigLinking;
};
```

Типы пакетов: [`packages/bt-cli/src/core/linking/types.ts`](../../packages/bt-cli/src/core/linking/types.ts)

```typescript
export type PackageType = "standalone" | "component" | "system" | "library";
```

---

## Детали реализации

### Структура модуля линковки

Модуль линковки организован в директории `packages/bt-cli/src/core/linking/`:

| Файл/Директория   | Назначение                                                                             |
| ----------------- | -------------------------------------------------------------------------------------- |
| `index.ts`        | Точки входа: `processLinking()`, `processPackagesLinking()`, `resolvePackagesToLink()` |
| `context.ts`      | Создание LinkingContext — реестр, кэш, пути                                            |
| `types.ts`        | Типы: PackageType, PackageInfo, LinkingContext, LinkedPackage и др.                    |
| `cache.ts`        | LinkingCache — двухуровневый кэш для node_modules                                      |
| `dependencies.ts` | Построение дерева зависимостей, определение system пакетов                             |
| `executables.ts`  | Сбор executables из `.executables.json`                                                |
| `parsers.ts`      | Парсинг PackageInfo из DependencyNode или BtConfigLinkingPackage                       |
| `generators/`     | Генераторы: api-ext.xml, component XML/JS, filemap, init-xml, package-json             |
| `linkers/`        | Линкеры по типу пакета: standalone, component, system + диспатч-реестр                 |
| `utils/`          | Утилиты: copy, node-modules, package-type, url, write                                  |

### Определение типа пакета

**Код:** [`packages/bt-cli/src/core/linking/utils/package-type.ts`](../../packages/bt-cli/src/core/linking/utils/package-type.ts)

```typescript
/**
 * Нормализует тип пакета, мапит старые значения на новые для обратной совместимости
 * @example
 * normalizePackageType('app')        // -> 'standalone'
 * normalizePackageType('lib')        // -> 'library'
 * normalizePackageType('bt')         // -> 'system'
 * normalizePackageType('standalone') // -> 'standalone'
 */
export function normalizePackageType(wsPackage: string | undefined): PackageType | null {
  if (!wsPackage) {
    return null;
  }

  // Legacy mapping: app → standalone, lib → library, bt → system
  if (LEGACY_TYPE_MAPPING[wsPackage]) {
    return LEGACY_TYPE_MAPPING[wsPackage];
  }

  if (VALID_PACKAGE_TYPES.includes(wsPackage as PackageType)) {
    return wsPackage as PackageType;
  }

  return null;
}
```

Вспомогательные функции:

- `isExecutablePackageType(type)` — проверяет, нужна ли полная линковка (standalone, component, system)
- `getValidPackageTypes()` / `getLegacyPackageTypes()` — списки валидных типов

---

### Определение source и target

**Код:** [`packages/bt-cli/src/core/linking/parsers.ts`](../../packages/bt-cli/src/core/linking/parsers.ts)

**Приоритет для source:**

1. Явно указан в `btconfig.json` → используется он
2. Executable BT пакет → `{name}/build`
3. Обычная директория → ошибка (обязательно)

**Приоритет для target:**

1. **Для component пакетов:**
   - Автоматически `./components/{package.name}`
   - `ws:root` **ЗАПРЕЩЕН** → ошибка
2. **Для standalone пакетов:**
   - Явно указан в `btconfig.json` → используется он
   - BT пакет с `ws:root` → значение `ws:root`
   - BT пакет без `ws:root` → ошибка
3. **Для обычных директорий:**
   - Обязательно в `btconfig.json`

---

### Диспатч линковки по типу пакета

**Код:** [`packages/bt-cli/src/core/linking/linkers/index.ts`](../../packages/bt-cli/src/core/linking/linkers/index.ts)

```typescript
const linkerRegistry = new Map<PackageType, PackageLinker>([
  ["standalone", standaloneLinker], // init.xml, .filemap.json, api_ext entry
  ["component", componentLinker], // spxml/, package.json, .filemap.json
  ["system", systemLinker], // только копирование (уже готов)
  // library — обрабатывается через node_modules, линкер не нужен
]);
```

Каждый линкер реализует интерфейс `PackageLinker` с методом `link(pkg, ctx) → LinkedPackage`.

---

### Порядок пакетов в api_ext.xml

**Код:** [`packages/bt-cli/src/core/linking/index.ts`](../../packages/bt-cli/src/core/linking/index.ts)

Порядок определяется стадиями линковки:

1. **STAGE 1:** System пакеты (runtime) — добавляют apiext если `systemLinkMode === "standalone"`
2. **STAGE 2:** Пользовательские пакеты — standalone добавляют apiext, component — нет
3. **STAGE 3:** Сбор всех `apiExtEntries` и генерация `api_ext.xml`

**Итоговый порядок в api_ext.xml:**

1. System пакеты (если standalone режим)
2. Пользовательские standalone пакеты (в порядке из `btconfig.json`)
3. **component пакеты НЕ включаются** (apiext = undefined, своя логика загрузки)

---

## Примеры

### Простой проект

**Структура:**

```
my-app/
├── src/
│   ├── index.ts
│   └── utils.ts
├── package.json
└── tsconfig.json
```

**package.json:**

```json
{
  "name": "my-app",
  "version": "1.0.0",
  "main": "index.js",
  "ws:package": "standalone",
  "ws:root": "./wt/myapp"
}
```

**Команды:**

```bash
npx btc build          # src/*.ts → build/*.js
npx btc link           # build/ → dist/wt/myapp/
```

**Результат:**

```
dist/
├── wt/
│   └── myapp/
│       ├── index.js
│       ├── utils.js
│       ├── init.xml
│       └── .filemap.json
├── components/
│   └── bt-runtime/    # system пакет (по умолчанию component режим)
└── source/
    └── api_ext.xml
```

---

### Мульти-пакетный проект

**Структура:**

```
my-project/
├── btconfig.json
├── package.json
├── backend/
│   ├── src/
│   │   ├── index.ts
│   │   └── api.ts
│   ├── package.json      # ws:package: "standalone", ws:root: "./wt/backend"
│   └── tsconfig.json
├── frontend/
│   └── src/
│       ├── index.html
│       └── styles.css
└── library/
    ├── src/
    ├── package.json
    └── tsconfig.json
```

**btconfig.json:**

```json
{
  "$schema": "./schemas/btconfig.schema.json",
  "linking": {
    "packages": [
      {
        "name": "backend"
        // автоматически: source="backend/build", target="./wt/backend" (из ws:root)
      },
      {
        "name": "frontend",
        "source": "./frontend/src",
        "target": "./wt/static"
      }
    ]
  }
}
```

**Команды:**

```bash
# 1. Компиляция BT пакетов
cd backend && npx btc build && cd ..
cd library && npx btc build && cd ..

# 2. Линковка из корня
npx btc link
```

**Результат:**

```
dist/
├── components/
│   └── bt-runtime/         # system пакет (по умолчанию component режим)
├── wt/
│   ├── backend/            # standalone пакет
│   │   ├── index.js
│   │   ├── api.js
│   │   ├── init.xml
│   │   ├── .filemap.json
│   │   └── node_modules/
│   └── static/             # обычная директория
│       ├── index.html
│       └── styles.css
└── source/
    └── api_ext.xml
```

---

## Миграция со старой системы

Для перевода существующего проекта на Multi-package режим:

1. Создать `btconfig.json` в корне проекта
2. Переместить логику линковки в секцию `linking.packages`
3. Оставить настройки `ws:package` и `ws:root` в package.json (для совместимости и shorthand)

Система автоматически выберет новый режим при наличии `btconfig.json`.

---

## Типы BorisType пакетов

### Обратная совместимость

**Старые типы автоматически мапятся на новые:**

- `ws:package: "app"` → `"standalone"` (через `normalizePackageType()`)
- `ws:package: "lib"` → `"library"` (через `normalizePackageType()`)
- `ws:package: "bt"` → `"system"` (через `normalizePackageType()`)

**Рекомендуется:** использовать новые названия в новых проектах

---

### Четыре типа BorisType пакетов

Система поддерживает четыре типа BorisType пакетов:

#### 1. `standalone`

**Назначение:** автономный пакет-приложение

**Характеристики:**

- Помещается в указанную директорию на платформе WebSoft HCM
- Регистрируется глобально при запуске системы
- Является точкой входа для выполнения кода (через `main`)
- Может содержать executable objects (агенты, обработчики событий и т.д.)
- Связующее звено между системой модулей BorisType и платформой WebSoft HCM

**Использование:**

- Основные приложения
- Серверные компоненты с бизнес-логикой
- Пакеты с агентами и обработчиками платформы

**Линковка:**

```json
// btconfig.json
{
  "linking": {
    "packages": [
      {
        "name": "my-app" // ws:package: "standalone" в package.json
        // source: "my-app/build" (auto)
        // target: из ws:root (auto)
      }
    ]
  }
}
```

**Результат:** `dist/wt/{ws:root}/` + `node_modules` + `init.xml` + запись в `api_ext.xml`

---

#### 2. `component`

**Назначение:** компонент платформы WebSoft HCM

**Характеристики:**

- Помещается в специальную директорию `components/{package-name}/`
- **НЕ регистрируется** в `api_ext.xml` (своя логика загрузки через платформу)
- Может содержать executable objects
- Генерирует специальные файлы:
  - `package.json` (component.json) — метаданные компонента
  - `spxml/{name}.xml` — SPXML шаблон
  - `spxml/{name}.js` — функция инициализации
- Копирует `node_modules` с BT зависимостями
- **ЗАПРЕЩЕНО** указывать `ws:root` в `package.json`

**Использование:**

- Модульные компоненты системы
- Расширения функциональности платформы
- Переиспользуемые компоненты между проектами

**Конфигурация:**

```json
// package.json
{
  "name": "my-component",
  "version": "1.0.0",
  "main": "index.js",
  "ws:package": "component"
  // ws:root ЗАПРЕЩЕН!
}

// btconfig.json
{
  "linking": {
    "packages": [
      {
        "name": "my-component"
        // source: "my-component/build" (auto)
        // target: "./components/my-component" (auto)
      }
    ]
  }
}
```

**Результат линковки:**

```
dist/components/my-component/
├── index.js
├── package.json          # component.json (метаданные)
├── node_modules/
└── spxml/
    ├── my-component.xml  # SPXML шаблон
    └── my-component.js   # init() функция
```

**⚠️ Отличия от standalone:**

- Специальное расположение: `components/` вместо `wt/`
- Отсутствие в `api_ext.xml` (apiext = undefined)
- Создание `package.json` вместо `init.xml`
- Создание файлов в `spxml/` директории

---

#### 3. `library`

**Назначение:** переиспользуемая библиотека

**Характеристики:**

- Не линкуется напрямую в `dist/`
- Помещается в `node_modules/` внутри `standalone` или `component` пакетов при линковке
- Реализует модель зависимостей аналогично npm в Node.js
- Не регистрируется глобально
- Не может содержать executable objects

**Использование:**

- Общие утилиты
- Переиспользуемые функции и классы
- Библиотеки для использования в нескольких пакетах

**Пример:**

```json
// standalone пакет - package.json
{
  "name": "my-app",
  "ws:package": "standalone",
  "dependencies": {
    "@myorg/utils": "^1.0.0"  // library пакет
  }
}

// library пакет - @myorg/utils/package.json
{
  "name": "@myorg/utils",
  "ws:package": "library",
  "main": "index.js"
}
```

**Результат линковки:** `dist/wt/my-app/node_modules/@myorg/utils/`

---

#### 4. `system`

**Назначение:** системные зависимости, необходимые для работы транспилированного кода

**Характеристики:**

- Уже **полностью готовы** к линковке — ничего не генерируется, только копирование
- Необходимы для работы кода после транспиляции (runtime, polyfill)
- Режим линковки определяется через CLI: `--linking-system-as`:
  - `component` (по умолчанию): `components/<ws:name>`, НЕ добавляются в `api_ext.xml`
  - `standalone`: по `ws:root`, добавляются в `api_ext.xml`
- Загружаются автоматически — пользователь не управляет напрямую
- Можно пропустить через `--external-runtime` (runtime управляется внешне)

**Примеры:**

- `@boristype/runtime` — runtime библиотека (polyfills, require и т.д.)

**Расположение:** `dist/components/{package-name}/` (component) или `dist/wt/{ws:root}/` (standalone)

---

### Сводная таблица типов пакетов

| Тип          | Обратная совместимость | api_ext.xml            | Расположение              | node_modules | Инициализация               | Executable objects | component.json |
| ------------ | ---------------------- | ---------------------- | ------------------------- | ------------ | --------------------------- | ------------------ | -------------- |
| `standalone` | `app`                  | ✅ Да                  | `wt/{ws:root}/`           | ✅ Да        | `init.xml`                  | ✅ Да              | ❌ Нет         |
| `component`  | —                      | ❌ Нет (своя логика)   | `components/{name}/`      | ✅ Да        | `spxml/*.xml`, `spxml/*.js` | ✅ Да              | ✅ Да          |
| `library`    | `lib`                  | ❌ Нет                 | `node_modules/{name}/`    | ❌ Нет       | ❌ Нет                      | ❌ Нет             | ❌ Нет         |
| `system`     | `bt`                   | ⚙️ Зависит от режима\* | `components/` или `wt/`\* | ✅ Да        | Уже готово                  | ❌ Нет             | ❌ Нет         |

\* System пакеты: `--linking-system-as component` (по умолчанию) → `components/{name}/`, не в api_ext; `--linking-system-as standalone` → `wt/{ws:root}/`, добавляется в api_ext

---

### Executable Objects (исполняемые объекты)

**Определение:** специальные объекты BorisScript, которые могут быть выполнены платформой WebSoft HCM

**Примеры:**

- **Агенты** — запускаются по расписанию платформой
- **Обработчики событий** — реагируют на системные события
- **Другие платформенные объекты** — формы, отчеты и т.д.

**Поддержка:**

- Доступны только в `standalone` и `component` пакетах
- Недоступны в `library` и `system` пакетах

**Механизм:**

1. Транспилятор помечает executable objects в `.executables.json`
2. Система линковки создает per-module маппинг в `.filemap.json`
3. Платформа обращается к объектам через систему разрешения путей

**Назначение линковки для standalone/component:**

Линковка создает структуру, которая:

- Загружается на сервер WebSoft HCM
- Интегрируется с платформой
- Обеспечивает работу executable objects
- Предоставляет доступ к модулям через систему путей

---

### Точка входа и инициализация

**Поле `main` в package.json:**

- Опциональное для всех типов пакетов
- Если указано → создается `init.xml` с автоматическим `require`
- Может не выполнять никакого кода при загрузке (просто экспортировать API)

**Примеры:**

**Активная инициализация:**

```typescript
// index.ts (main)
import { registerAgent } from "./agent";

// Регистрация агента при загрузке модуля
registerAgent();

export { doSomething } from "./api";
```

**Пассивная инициализация:**

```typescript
// index.ts (main)
// Только экспорт, без выполнения кода
export { doSomething } from "./api";
export { createHandler } from "./handlers";
```

---

### Изоляция и взаимодействие пакетов

**Текущее состояние:**

- `standalone` и `component` пакеты **не зависят друг от друга** напрямую
- Не могут импортировать модули друг друга через `import`/`require`
- Каждый пакет — отдельная подпрограмма в системе WebSoft HCM

**Возможности взаимодействия:**

- Через глобальные объекты платформы (WebSoft HCM API)
- Через общие `library` пакеты
- Через механизмы платформы (события, хранилище и т.д.)

**Перспективы:**

- Планируется механизм межмодульного взаимодействия
- Возможно, через специальные API BorisType

---

## Справочная информация

### Связанные файлы

- **Реализация:** [`packages/bt-cli/src/core/linking/`](../../packages/bt-cli/src/core/linking/)
- **Типы конфигурации:** [`packages/bt-cli/src/core/config.ts`](../../packages/bt-cli/src/core/config.ts)
- **Типы линковки:** [`packages/bt-cli/src/core/linking/types.ts`](../../packages/bt-cli/src/core/linking/types.ts)
- **JSON Schema:** [`schemas/btconfig.schema.json`](../../schemas/btconfig.schema.json)
- **Документация:** [`docs/guides/linking.md`](../../docs/guides/linking.md)
- **Конфигурация:** [`docs/reference/btconfig.md`](../../docs/reference/btconfig.md)
- **Примеры:** [`examples/README.md`](../../examples/README.md)

### Команды

```bash
# Инициализация проекта
npx btc init

# Компиляция
npx btc build

# Линковка
npx btc link

# Справка
npx btc --help
```

### Дополнительные флаги

```bash
--outDir <dir>                 # Кастомная директория для build
--include-non-ts-files         # Копировать не-TS файлы
--no-use-polyfill              # Отключить polyfill transform
--no-use-remodule              # Отключить remodule transform
```
