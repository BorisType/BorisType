# Пример многопакетного проекта

Этот пример демонстрирует использование расширенной системы линковки с `btconfig.json`.

## Структура проекта

```
example/
├── btconfig.json       # Конфигурация линковки
├── package.json        # Корневой package.json
├── backend/            # Backend пакет (простой JavaScript)
│   ├── src/
│   │   └── index.js
│   └── package.json
└── frontend/           # Frontend пакет (статический HTML)
    ├── src/
    │   └── index.html
    └── package.json
```

## Использование

### 1. Установка зависимостей

```bash
# В корневой директории example/
npm install
```

**Примечание:** Подпроекты `backend` и `frontend` не требуют отдельной установки зависимостей, так как содержат только статические файлы.

### 2. Линковка

```bash
# Создать итоговую структуру в dist/
npm run link
```

После выполнения команды `npm run link` будет создана директория `dist/` со следующей структурой:

```
dist/
├── wt/
│   ├── backend/        # Содержимое backend/src (статические файлы)
│   │   └── index.js
│   ├── frontend/       # Содержимое frontend/src (статические файлы)
│   │   └── index.html
│   └── bt/
│       └── filemap/
└── source/
    └── api_ext.xml     # Конфигурация API расширений
```

## Конфигурация btconfig.json

```json
{
  "$schema": "../schemas/btconfig.schema.json",
  "linking": {
    "packages": [
      {
        "name": "backend",
        "source": "./backend",
        "target": "./wt/backend",
        "type": "static"
      },
      {
        "name": "frontend",
        "source": "./frontend",
        "target": "./wt/frontend",
        "type": "static"
      }
    ]
  }
}
```

### Поля конфигурации пакета

- **name**: Имя пакета (для логирования)
- **source**: Относительный путь к директории пакета
- **target**: Целевой путь внутри `dist/`
- **type**: 
  - `"build"` - копировать содержимое папки `build/` (для скомпилированных проектов)
  - `"static"` - копировать всю директорию `src/` целиком (для статических файлов)

## Ключевые особенности

### Приоритет btconfig.json

Если в корневой директории присутствует `btconfig.json` с секцией `linking`, система автоматически использует **multi-package режим**, игнорируя настройки `ws:package` и `ws:root` в корневом `package.json`.

### Типы пакетов

- **static** - подходит для HTML, CSS, JavaScript файлов, конфигураций
- **build** - подходит для проектов с компиляцией TypeScript → BorisScript

## Обратная совместимость

Если `btconfig.json` отсутствует или не содержит секцию `linking`, система автоматически использует старый режим линковки, читая настройки из `package.json` текущего проекта (`ws:package`, `ws:root` и т.д.).

**Приоритет:** `btconfig.json` > `package.json` (legacy режим)
