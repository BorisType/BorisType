# btconfig.json Reference

`btconfig.json` задаёт **линковку**, а не параметры компиляции или подключения
к HCM. `btc build` использует `tsconfig.json`; подключение задаётся в
[btconfig.properties](./btconfig-properties).

## Расположение

Файл читается из текущей рабочей директории `btc link`/`btc dev`.
Все явно заданные `source` и `target` относятся к корню проекта:
`source` — к текущей директории, `target` — к `dist/`.

## Формат

```json
{
  "linking": {
    "packages": [{ "name": "backend" }, { "name": "frontend", "source": "./frontend/build", "target": "./wt/frontend" }]
  }
}
```

В JSON нет комментариев и завершающих запятых. Top-level `packages`, карта
`{ "backend": "./backend" }` и поле `packageType` не поддерживаются.
Тип BT пакета задаёт `package.json#ws:package`.

## Поля

### `$schema` (optional)

Ссылка для IDE. [Схема репозитория](https://github.com/BorisType/BorisType/blob/main/schemas/btconfig.schema.json)
не копируется в ваш проект командой `init`; указывайте локальный путь только
после её копирования. CLI читает JSON и не запускает JSON Schema validator.

### `linking` (optional)

Поддерживаются две формы: настройки текущего пакета либо непустой список
`linking.packages`. Не смешивайте их: при наличии непустого массива поля
`source`/`target` корневой секции не используются.

#### `linking.packages`

| Поле     | Значение                                                             |
| -------- | -------------------------------------------------------------------- |
| `name`   | Обязательный относительный путь каталога пакета; `.` означает корень |
| `source` | Каталог готовых файлов относительно корня проекта                    |
| `target` | Целевой путь внутри `dist/`                                          |

Для `standalone`, `component`, `system` `source` по умолчанию — `{name}/build`.
Для обычной директории `source` и `target` обязательны. `library` нельзя
линковать отдельной записью: это зависимость другого пакета.

У BT пакетов нужен `ws:name`. Standalone по умолчанию использует `ws:root`,
а при его отсутствии — `./wt/<ws:name>`. Component использует
`./components/<ws:name>`; не задавайте ему `ws:root`.
Явные `source`/`target` имеют приоритет. Для component рекомендуем стандартный
путь: его регистрацию и push нужно учитывать отдельно при переопределении.

Корневой `linking.name` не переименовывает пакет в текущей реализации:
задавайте платформенное имя через `package.json#ws:name`.

## Примеры

### Базовый пример (BT пакет)

Без `btconfig.json` линковка обрабатывает текущий executable BT пакет.
Для переопределения output:

```json
{
  "linking": { "source": "./build", "target": "./wt/my-app" }
}
```

### Мульти-пакетный проект

```json
{
  "linking": {
    "packages": [
      { "name": "backend" },
      { "name": "frontend", "source": "./frontend/dist", "target": "./wt/frontend" },
      { "name": "assets", "source": "./assets", "target": "./wt/assets" }
    ]
  }
}
```

Каталоги `backend`, `frontend` и `assets` должны существовать. Линковка
не вызывает их build. Порядок standalone записей сохраняется в `api_ext.xml`;
автоматической сортировки прикладных зависимостей нет.

### Переопределение путей для BT пакета

```json
{
  "linking": {
    "packages": [{ "name": "backend", "source": "./backend/custom-output", "target": "./wt/api" }]
  }
}
```

Для таких переопределений выполняйте полную линковку; текущий incremental dev
может потерять явные пути. См. [ограничения watch](../guides/dev-mode).

## См. также

- [Линковка](../guides/linking)
- [Типы пакетов](./package-types)
- [Примеры репозитория](https://github.com/BorisType/BorisType/tree/main/examples)
