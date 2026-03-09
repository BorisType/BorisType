# Пример с одним пакетом

Этот пример демонстрирует использование **legacy режима линковки** для одиночного пакета.

## Описание

Legacy режим — это классический подход к линковке, использующий настройки из `package.json`. Подходит для простых проектов с одним основным пакетом.

## Структура проекта

```
single/
├── src/
│   ├── index.ts        # Точка входа
│   └── utils.ts        # Утилиты
├── package.json        # Конфигурация с ws:package и ws:root
├── tsconfig.json       # TypeScript конфигурация
└── README.md
```

## Конфигурация

### package.json

```json
{
  "name": "boristype-example-single",
  "main": "index.js",
  "ws:package": "app",
  "ws:root": "./wt/myapp"
}
```

**Ключевые поля:**

- **`ws:package`**: `"app"` - указывает что это приложение (не библиотека)
- **`ws:root`**: `"./wt/myapp"` - путь внутри `dist/` куда будет скопирован `build/`
- **`main`**: `"index.js"` - точка входа приложения

## Использование

### 1. Установка зависимостей

```bash
npm install
```

### 2. Компиляция TypeScript → BorisScript

```bash
npm run build
```

Результат: создаётся директория `build/` с скомпилированными `.js` файлами.

### 3. Линковка

```bash
npm run link
```

Результат: создаётся директория `dist/` со следующей структурой:

```
dist/
├── wt/
│   ├── myapp/              # Содержимое build/ (ws:root)
│   │   ├── index.js
│   │   ├── utils.js
│   │   └── node_modules/   # ws:package зависимости
│   └── bt/
│       ├── filemap/        # Автоматически созданный модуль
│       └── polyfill/       # Polyfill библиотека (из compiler deps)
└── source/
    └── api_ext.xml         # Конфигурация API расширений
```

## Что происходит при линковке?

1. **Анализ зависимостей**
   - Читается `package.json` текущего проекта
   - Определяются compiler dependencies (например, `polyfill`)
   - Строится дерево зависимостей

2. **Копирование файлов**
   - `build/` → `dist/{ws:root}`
   - `node_modules/` (только пакеты с `ws:package`) → `dist/{ws:root}/node_modules/`
3. **Создание служебных модулей**
   - `bt:filemap` - для разрешения путей к исполняемым объектам
   - Копируется `polyfill` и другие системные зависимости

4. **Генерация api_ext.xml**
   - Автоматически создаётся API расширение `module:{package-name}`
   - Генерируется `init.xml` для загрузки модуля

## Пример вывода

После запуска линковки:

```
🔗 Single package linking mode (legacy)
Dependency tree analysis...
Copying build/ to dist/wt/myapp...
Processing node_modules...
Creating bt:filemap module...
Generating api_ext.xml...
✅ Single package linking completed
```

## Отличия от multi-package режима

| Аспект                | Single (Legacy)           | Multi-package   |
| --------------------- | ------------------------- | --------------- |
| Конфигурация          | `package.json`            | `btconfig.json` |
| Количество пакетов    | 1 основной                | Множество       |
| Системные зависимости | Автоматически добавляются | Не добавляются  |
| Использование         | Простые проекты           | Сложные проекты |

## См. также

- [Multi-package пример](../multi/README.md)
- [Документация по линковке](../../docs/Linking.md)
- [Документация по btconfig.json](../../docs/reference/btconfig.md)
