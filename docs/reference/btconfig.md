# btconfig.json Reference

Конфигурационный файл для BorisType компилятора.

## Расположение

Файл должен находиться в корневой директории проекта (там же, где `package.json`).

## Формат

```json
{
  "$schema": "./schemas/btconfig.schema.json",
  "linking": {
    "packages": [
      // BT пакет - shorthand нотация
      {
        "name": "backend"
      },
      // Обычная директория - полная запись
      {
        "name": "frontend",
        "source": "./frontend/src",
        "target": "./wt/frontend"
      }
    ]
  }
}
```

## Поля

### `$schema` (optional)

Ссылка на JSON схему для валидации и автодополнения в IDE.

**Тип:** `string`  
**Пример:** `"./schemas/btconfig.schema.json"`

### `linking` (optional)

Конфигурация системы линковки.

**Тип:** `object`

#### `linking.packages`

Массив пакетов для включения в итоговую сборку.

**Тип:** `array`  
**Элементы:** `LinkingPackage`

##### `LinkingPackage`

**Поля:**

| Поле | Тип | Обязательное | Описание |
|------|-----|--------------|----------|
| `name` | `string` | ✅ | Имя директории пакета относительно корня проекта |
| `source` | `string` | ⚠️ Условно* | Путь к директории с файлами для копирования |
| `target` | `string` | ⚠️ Условно* | Целевой путь внутри `dist/` |

**\* Условная обязательность:**

- **Для BT пакетов** (содержат `package.json` с `ws:package: "app"`):
  - `source` опциональное, по умолчанию: `{name}/build`
  - `target` опциональное, по умолчанию: из `ws:root` в package.json
  - Можно использовать shorthand: `{ "name": "package" }`

- **Для обычных директорий:**
  - `source` обязательное
  - `target` обязательное

**Приоритет:** Явно указанные `source` и `target` имеют приоритет над значениями по умолчанию.

## Примеры

### Базовый пример (BT пакет)

```json
{
  "$schema": "",
  "linking": {
    "packages": [
      {
        "name": "backend"  // Shorthand для BT пакета
      }
    ]
  }
}
```

### Мульти-пакетный проект

```json
{
  "$schema": "",
  "linking": {
    "packages": [
      // BT пакет - shorthand нотация
      {
        "name": "backend"
      },
      // Обычная директория со статикой
      {
        "name": "frontend",
        "source": "./frontend/src",
        "target": "./wt/frontend"
      },
      // Обычная директория с ресурсами
      {
        "name": "shared-assets",
        "source": "./assets",
        "target": "./wt/assets"
      }
    ]
  }
}
```

### Переопределение путей для BT пакета

```json
{
  "$schema": "",
  "linking": {
    "packages": [
      // BT пакет с кастомными путями
      {
        "name": "backend",
        "source": "./backend/dist",  // Вместо backend/build
        "target": "./wt/api"          // Вместо ws:root
      },
      // Обычные директории
      {
        "name": "config",
        "source": "./config",
        "target": "./wt/config"
      },
      {
        "name": "resources",
        "source": "./resources",
        "target": "./wt/resources"
      }
    ]
  }
}
```

## См. также

- [Документация по линковке](../guides/linking)
- [Пример использования](https://github.com/BorisType/BorisType/tree/main/examples)
- [JSON Schema](https://github.com/BorisType/BorisType/blob/main/schemas/btconfig.schema.json)
