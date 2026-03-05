# Система линковки BorisType

## Назначение

**Linking (линковка)** — обязательный этап после транспиляции TypeScript → BorisScript.

Цель: собрать все необходимые модули и зависимости в единую структуру директории `dist/`, которая затем копируется на платформу WebSoft HCM для выполнения.

---

## Текущая реализация (v0.0.1-alpha.10)

### Унифицированный механизм линковки

Система использует **единый механизм** линковки для всех случаев:
- Legacy режим (одиночный пакет) работает как частный случай multi-package режима
- Multi-package режим поддерживает несколько пакетов с различными типами

**Выбор режима:** автоматический
- Если `btconfig.json` присутствует → использует конфигурацию из него
- Если отсутствует → создается виртуальный `btconfig` для текущего проекта (legacy совместимость)

**Внутренняя реализация:** код `processSinglePackageLinking` полностью удален, используется только `processMultiPackageLinking` с автоопределением режима по `name === '.'`

---

### Legacy режим (одиночный пакет)

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
  - `"standalone"` (рекомендуется) или `"app"` (legacy) — автономное приложение
  - `"component"` — компонент платформы
  - `"bt"` — утилитарный пакет BorisType
  - `"library"` или `"lib"` (legacy) — библиотека (не линкуется напрямую)
- `ws:root`: путь внутри `dist/` для `standalone` и `bt` (обязательно)
  - **Для `component`:** НЕ должен быть указан, используется `./components/{package.name}`
- `main`: точка входа → создается `init.xml` или файлы в `spxml/` для компонентов
- `ws:apiext`: (опционально) кастомная конфигурация API расширений

**Процесс:**
1. Читает `package.json` текущего проекта
2. Создает виртуальный `btconfig` с одним пакетом `name: '.'`
3. Загружает зависимости компилятора (polyfill)
4. Определяет тип пакета через `normalizePackageType()` (маппинг app→standalone, lib→library)
5. Копирует `build/` → `dist/{target}/` где target:
   - `standalone`/`bt`: из `ws:root`
   - `component`: автоматически `./components/{package.name}`
6. Копирует `node_modules` (только пакеты с `ws:package`)
7. Создает `init.xml` для `standalone`/`bt` или файлы в `spxml/` для `component`
8. Для `component`: создает `package.json` (component.json) в корне
9. Генерирует модуль `bt:filemap` для executable objects
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

| Поле | Тип | Обязательность | Описание |
|------|-----|----------------|----------|
| `name` | string | ✅ Всегда | Имя директории пакета относительно корня проекта |
| `source` | string | ⚠️ Условно | Путь к файлам для копирования |
| `target` | string | ⚠️ Условно | Целевой путь внутри `dist/` |

**Условная обязательность:**

Система определяет тип пакета через функцию `normalizePackageType()` (маппинг: app→standalone, lib→library):

**Для executable BorisType пакетов** (`ws:package: "standalone"`, `"component"`, `"bt"`):
- `source` опционально:
  - Явно указан → используется указанный путь **(приоритет)**
  - Не указан → `{name}/build` **(по умолчанию)**
- `target` опционально:
  - **Для `component`:** автоматически `./components/{package.name}`, `ws:root` **ЗАПРЕЩЕН**
  - **Для `standalone` и `bt`:**
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

1. Читает `btconfig.json` (или создает виртуальный для legacy режима)
2. Загружает зависимости компилятора (polyfill)
3. Для каждого пакета в `linking.packages`:
   - Проверяет `package.json` → вызывает `normalizePackageType()` → определяет тип
   - Проверка на `library`: **ERROR** (нельзя линковать напрямую)
   - Определяет `source` (приоритет: явный > `{name}/build` > error)
   - Определяет `target`:
     - `component`: автоматически `./components/{package.name}`, проверка на `ws:root` → **ERROR**
     - `standalone`/`bt`: приоритет: явный > `ws:root` > error
     - Обычная директория: обязательно
   - Копирует `source` → `dist/{target}`
   - **Только для executable BT пакетов** (`standalone`, `component`, `bt`):
     - Обрабатывает `.executables.json` (executable objects)
     - Копирует `node_modules` (пакеты с `ws:package`)
     - Создает файлы инициализации:
       - `component`: `spxml/{name}.xml`, `spxml/{name}.js`, `package.json` (component.json)
       - `standalone`/`bt`: `init.xml`
     - Добавляет в `api_ext.xml` (кроме `component`)
4. Копирует зависимости компилятора (polyfill) → добавляет **в начало** списка
5. Генерирует модуль `bt:filemap` → добавляется **самым первым** в `api_ext.xml`
6. Создает `api_ext.xml` с правильным порядком: bt:filemap → bt.polyfill → пользовательские (без components)

**Запуск:**
```bash
# Компиляция каждого BT пакета
cd backend && npx btc build && cd ..

# Линковка из корня
npx btc link
```

---

## Итоговая структура dist/

### Legacy режим

```
dist/
├── wt/
│   ├── myapp/              # ws:root
│   │   ├── index.js
│   │   ├── utils.js
│   │   └── node_modules/
│   └── bt/
│       ├── polyfill/       # зависимость компилятора (auto)
│       │   ├── init.xml
│       │   └── ...
│       └── filemap/        # автогенерируемый модуль (auto)
│           ├── init.xml
│           ├── index.js
│           └── filemap.json
└── source/
    └── api_ext.xml
```

### Multi-package режим

```
dist/
├── components/             # директория для component пакетов
│   └── my-component/       # component пакет
│       ├── index.js
│       ├── package.json    # component.json (метаданные компонента)
│       ├── node_modules/
│       └── spxml/          # файлы инициализации компонента
│           ├── my-component.xml
│           └── my-component.js
├── wt/
│   ├── bt/
│   │   ├── polyfill/       # зависимость компилятора (auto, первым)
│   │   │   ├── init.xml
│   │   │   └── ...
│   │   └── filemap/        # автогенерируемый модуль (auto)
│   │       ├── init.xml
│   │       ├── index.js
│   │       └── filemap.json
│   ├── backend/            # standalone пакет (target из ws:root или btconfig)
│   │   ├── index.js
│   │   ├── init.xml
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

### 1. bt:filemap модуль

**Назначение:** разрешение путей к executable objects (исполняемым объектам)

**Генерируется автоматически** для всех режимов.

**Содержимое:**
- `init.xml` — инициализация модуля
- `index.js` — функция `getFileUrl(key)` для получения URL файла
- `filemap.json` — маппинг ключей вида `${packageName}+${packageVersion}+${filePath}` на URL

**Расположение:** `dist/wt/bt/filemap/`

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
- Поля `ws:apiext` в `package.json` каждого BT пакета
- Автоматически создаваемых расширений для модулей с `main`

**Пример:**
```xml
<?xml version="1.0" encoding="utf-8"?>
<api_ext>
  <apis>
    <!-- 1. Система разрешения путей (всегда первым) -->
    <api>
      <name>bt:filemap</name>
      <libs>
        <lib>
          <path>x-local://wt/bt/filemap/init.xml</path>
        </lib>
      </libs>
    </api>
    
    <!-- 2. Polyfill (зависимость компилятора, вторым) -->
    <api>
      <name>bt.polyfill</name>
      <libs>
        <lib>
          <path>x-local://wt/bt/polyfill/init.xml</path>
        </lib>
      </libs>
    </api>
    
    <!-- 3. Пользовательские standalone/bt модули -->
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
1. `bt:filemap` — должен быть первым (система путей)
2. `bt.polyfill` — должен быть вторым (полифиллы для JS)
3. Пользовательские модули — после системных

Нарушение порядка приведет к ошибкам выполнения.

**Расположение:** `dist/source/api_ext.xml`

---

### 4. Копирование node_modules

Система автоматически копирует зависимости из `node_modules`, но **только те пакеты**, которые содержат поле `ws:package` в своем `package.json`.

**Поддерживаемые типы:**
- `ws:package: "app"` — полноценный BorisScript пакет (приложение)
- `ws:package: "lib"` — библиотечный пакет

**Особенности:**
- Следует по symlinks (поддержка `file:` зависимостей в npm)
- Рекурсивно копирует вложенные `node_modules`
- Пропускает служебные директории: `.git`, `.bin`, `node_modules/.cache`, и т.д.
- Поддерживает scoped пакеты (`@boristype/polyfill`)

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
    alert('Component my-component initializing...');
    bt.polyfill.require.require('index.js', 'x-local://components/my-component/spxml')
    alert('Component my-component initialized');
  } catch (g_err) {
    alert('ERROR: Component initializing: my-component:\\r\\n' + g_err);
    throw g_err;
  }
}
```

**Расположение:** `dist/components/{package-name}/spxml/`

---

## TypeScript типы

Полные определения типов: [`btc/src/core/btconfig.types.ts`](../btc/src/core/btconfig.types.ts)

```typescript
/**
 * Описание отдельного пакета для линковки
 */
export type BtConfigLinkingPackage = {
  /**
   * Имя пакета - соответствует директории
   */
  name: string;

  /**
   * Путь к source директории (опционально)
   * 
   * Для BorisType пакетов (ws:package: "app"):
   * - Если указан: используется указанный путь (приоритет)
   * - Если не указан: используется ./{name}/build (по умолчанию)
   * 
   * Для обычных директорий:
   * - ОБЯЗАТЕЛЬНО должен быть указан
   */
  source?: string;

  /**
   * Целевой путь внутри dist/ (опционально)
   * 
   * Для BorisType пакетов (ws:package: "app"):
   * - Если указан: используется указанный путь (приоритет)
   * - Если не указан: используется ws:root из package.json
   * 
   * Для обычных директорий:
   * - ОБЯЗАТЕЛЬНО должен быть указан
   */
  target?: string;
}

export type BtConfigLinking = {
  packages: BtConfigLinkingPackage[];
}

export type BtConfig = {
  $schema?: string;
  linking?: BtConfigLinking;
}
```

---

## Детали реализации

### Определение типа пакета

**Код:** [`btc/src/core/linking.ts:40-67`](../btc/src/core/linking.ts#L40-L67)

```typescript
/**
 * Нормализует тип пакета, мапит старые значения на новые для обратной совместимости
 */
function normalizePackageType(wsPackage: string | undefined): PackageType | null {
  if (!wsPackage) {
    return null;
  }

  // Маппинг старых типов на новые (обратная совместимость)
  const typeMapping: Record<string, PackageType> = {
    'app': 'standalone',
    'lib': 'library',
  };

  // Проверяем маппинг
  if (typeMapping[wsPackage]) {
    return typeMapping[wsPackage];
  }

  // Новые типы
  const validTypes: PackageType[] = ['standalone', 'component', 'library', 'bt'];
  if (validTypes.includes(wsPackage as PackageType)) {
    return wsPackage as PackageType;
  }

  return null;
}

/**
 * Проверяет, является ли тип пакета исполняемым
 * standalone, component, bt - полная линковка
 * library - только копирование в node_modules
 */
function isExecutablePackageType(packageType: PackageType): boolean {
  return packageType === 'standalone' || packageType === 'component' || packageType === 'bt';
}
```

**Текущая реализация:** поддержка четырех типов с обратной совместимостью

---

### Определение source и target

**Код:** [`btc/src/core/linking.ts:190-240`](../btc/src/core/linking.ts#L190-L240)

**Приоритет для source:**
1. Явно указан в `btconfig.json` → используется он
2. Executable BT пакет → `{name}/build`
3. Обычная директория → ошибка (обязательно)

**Приоритет для target:**
1. **Для component пакетов:**
   - Автоматически `./components/{package.name}`
   - `ws:root` **ЗАПРЕЩЕН** → ошибка
2. **Для standalone и bt пакетов:**
   - Явно указан в `btconfig.json` → используется он
   - BT пакет с `ws:root` → значение `ws:root`
   - BT пакет без `ws:root` → ошибка
3. **Для обычных директорий:**
   - Обязательно в `btconfig.json`

---

### Порядок пакетов в api_ext.xml

**Код:** [`btc/src/core/linking.ts:320-360`](../btc/src/core/linking.ts#L320-L360)

```typescript
// Копируем зависимости компилятора (polyfill) - они должны быть первыми
const compilerPackages: WsPackageInfo[] = [];
for (const dep of compilerDeps) {
  // ... копирование и подготовка
  compilerPackages.push(depPackageInfo);
}

// Объединяем: сначала polyfill, потом пользовательские пакеты
const linkingPackages = [...compilerPackages, ...userPackages];

// bt:filemap добавляется самым первым
const allPackages = [fileMapPackage, ...linkingPackages];

// Создаем api_ext.xml
// buildApiExt фильтрует pkg.apiext !== undefined
// Компоненты имеют apiext = undefined → исключаются автоматически
const apiExtXml = buildApiExt(allPackages);
```

**Итоговый порядок в api_ext.xml:**
1. bt:filemap (всегда первым)
2. bt.polyfill (зависимость компилятора, вторым)
3. Пользовательские standalone/bt пакеты (в порядке из `btconfig.json`)
4. **component пакеты НЕ включаются** (apiext = undefined, своя логика загрузки)

---

## Примеры

### Простой проект (Legacy)

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
  "ws:package": "app",
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
│   ├── myapp/
│   │   ├── index.js
│   │   ├── utils.js
│   │   └── init.xml
│   └── bt/
│       ├── polyfill/
│       └── filemap/
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
│   ├── package.json      # ws:package: "app", ws:root: "./wt/backend"
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
├── wt/
│   ├── bt/
│   │   ├── polyfill/
│   │   └── filemap/
│   ├── backend/            # BT пакет
│   │   ├── index.js
│   │   ├── api.js
│   │   ├── init.xml
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

**Рекомендуется:** использовать новые названия в новых проектах

**Текущее состояние (v0.0.1-alpha.10):** полная поддержка всех четырех типов с обратной совместимостью

---

### Четыре типа BorisType пакетов

Система поддерживает четыре типа BorisType пакетов:

#### 1. `standalone` (текущий `app`)

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
        "name": "my-app"  // ws:package: "standalone" в package.json
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

#### 3. `library` (текущий `lib`)

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

#### 4. `bt` (утилитарный пакет BorisType)

**Назначение:** системные зависимости, необходимые для работы транспилированного кода

**Характеристики:**
- Регистрируется глобально при запуске системы **перед всеми остальными** пакетами
- Необходим для работы кода после транспиляции (например, `polyfill`)
- Может линковаться как `standalone` или как `component` в зависимости от настроек
- Загружается автоматически компилятором

**Примеры:**
- `@boristype/polyfill` — полифиллы для JS функций
- Будущие системные утилиты

**Линковка:**
- Добавляется автоматически компилятором
- Пользователь не управляет напрямую
- Всегда помещается в начало `api_ext.xml`

**Расположение:** `dist/wt/bt/{package-name}/` или `dist/components/bt/{package-name}/`

---

### Сводная таблица типов пакетов

| Тип | Старое название | api_ext.xml | Расположение | node_modules | Инициализация | Executable objects | component.json |
|-----|-----------------|-------------|--------------|--------------|---------------|--------------------|-----------------|
| `standalone` | `app` | ✅ Да | `wt/{ws:root}/` | ✅ Да | `init.xml` | ✅ Да | ❌ Нет |
| `component` | — | ❌ Нет (своя логика) | `components/{name}/` | ✅ Да | `spxml/*.xml`, `spxml/*.js` | ✅ Да | ✅ Да |
| `library` | `lib` | ❌ Нет | `node_modules/{name}/` | ❌ Нет | ❌ Нет | ❌ Нет | ❌ Нет |
| `bt` | — | ✅ Да (первым) | `wt/bt/{name}/` | ✅ Да | `init.xml` | ❌ Нет* | ❌ Нет |

\* Зависит от конкретного пакета (обычно нет)

---

### Executable Objects (исполняемые объекты)

**Определение:** специальные объекты BorisScript, которые могут быть выполнены платформой WebSoft HCM

**Примеры:**
- **Агенты** — запускаются по расписанию платформой
- **Обработчики событий** — реагируют на системные события
- **Другие платформенные объекты** — формы, отчеты и т.д.

**Поддержка:**
- Доступны только в `standalone` и `component` пакетах
- Недоступны в `library` и `bt` пакетах (за редким исключением)

**Механизм:**
1. Транспилятор помечает executable objects в `.executables.json`
2. Система линковки создает маппинг в `bt:filemap` модуле
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
import { registerAgent } from './agent';

// Регистрация агента при загрузке модуля
registerAgent();

export { doSomething } from './api';
```

**Пассивная инициализация:**
```typescript
// index.ts (main)
// Только экспорт, без выполнения кода
export { doSomething } from './api';
export { createHandler } from './handlers';
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

- **Реализация:** [`btc/src/core/linking.ts`](../../packages/bt-cli/src/core/linking.ts)
- **Типы:** [`btc/src/core/btconfig.types.ts`](../../packages/bt-cli/src/core/btconfig.types.ts)
- **JSON Schema:** [`schemas/btconfig.schema.json`](../../schemas/btconfig.schema.json)
- **Документация:** [`docs/Linking.md`](../../docs/Linking.md)
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