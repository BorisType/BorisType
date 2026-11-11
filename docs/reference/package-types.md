# Типы пакетов при линковке

Тип задаёт `package.json#ws:package`, а не `btconfig.json`.
Module pipeline остаётся экспериментальным; [ограничения памяти](./compile-modes)
не снимаются наличием generated initialization.

## Поле ws:name

`ws:name` обязателен для standalone/component/system. Он определяет платформенное
имя, пути по умолчанию и `module:<ws:name>`; npm `name` может быть scoped.
Используйте разные `ws:name` для разных пакетов проекта: по нему также ключуется
linking cache и начальная координация dev.

## Standalone

```json
{
  "name": "@myorg/myapp",
  "version": "1.0.0",
  "ws:name": "myapp",
  "ws:package": "standalone",
  "main": "index.js"
}
```

Готовый `build/` копируется в `dist/wt/myapp/`. Optional `ws:root` или явный
`target` линковки переопределяет путь. `main` относительно корня готового пакета.

### Логика генерации init.xml

При наличии `main` линкер создаёт `init.xml`, если его ещё нет **в целевом
каталоге после копирования**. Уже существующий init не регенерируется, включая
старый generated init от предыдущей линковки. При изменении `main` используйте
`link --clean`, предварительно проверив output сборки.

`ws:apiext` задаёт `{ "name": "...", "libs": ["./custom-init.xml"] }` и имеет
приоритет при формировании API entry. Нужные custom файлы поставляет сам пакет.
Без `ws:apiext`, но с `main` добавляется `module:<ws:name>` → `init.xml`.
Без обоих entry не создаётся. Наличие custom API entry само по себе не запрещает
линкеру создать неиспользуемый default init при `main`.

## Component

```json
{
  "name": "@myorg/mycomponent",
  "version": "1.0.0",
  "ws:name": "mycomponent",
  "ws:package": "component",
  "main": "index.js"
}
```

Default путь — `dist/components/mycomponent/`. Не задавайте `ws:root`;
при стандартном выборе target линкер отклоняет это поле. Явный `target` имеет
приоритет, но перенос компонента требует отдельно учитывать его регистрацию.
Component не добавляется в `api_ext.xml`.

### Файлы инициализации

Создаётся `spxml/<ws:name>.xml`, а при `main` — `spxml/<ws:name>.js` с вызовом
`bt.require`. Существующие целевые файлы сохраняются. Generated platform
`package.json` перезаписывается из `ws:name`, `version`, `description`;
version преобразуется утилитой `@boristype/ws-version`. Это не исходный npm manifest.
Для имени компонента выбирайте простой identifier: auto-push строит выражение
`<componentName>.init()` без кавычек.

## System

Готовые системные пакеты (например `@boristype/runtime`) копируются из `build/`
без генерации init. Автообнаружение идёт по dependencies/devDependencies
корневого проекта (только прямые точные `system` dependencies, без рекурсивного поиска); standalone/component/library dependencies не
подменяют поиск system-пакетов.

| Режим `--linking-system-as` | Путь                                        | API entry                 |
| --------------------------- | ------------------------------------------- | ------------------------- |
| `component` (default)       | `components/<ws:name>`                      | Нет                       |
| `standalone`                | `ws:root`, обязателен для system dependency | Из `ws:apiext` или `main` |

`--external-runtime` пропускает найденные system dependencies. Пользователь
отвечает за совместимый runtime на целевой платформе. У system-пакета,
перечисленного как пользовательская запись `linking.packages`, пути вычисляются
по правилам пользовательской записи; эта форма не заменяет dependency mode.

## Library

```json
{
  "name": "@myorg/utils",
  "version": "1.0.0",
  "main": "index.js",
  "ws:package": "library"
}
```

Library нельзя линковать самостоятельной записью. Она копируется в
`node_modules/` executable пакета, может иметь `main` для разрешения import,
но не получает собственного generated init или API entry. `ws:name` не нужен.
Наличие metadata не доказывает совместимость кода или работу всех imports.

### Логика копирования node_modules

Сканируется `node_modules/` каждого executable пакета. Копируются только
**точные** `ws:package: "library"`, включая вложенные libraries и scoped packages.
Legacy `lib` dependency copier не распознаёт. Symlink разрешается; content hash
вычисляется только для realpath вне `node_modules`.

Кэш ускоряет повторные полные линковки, но не гарантирует восстановление
вручную удалённого output, изменение target, nested libraries или удаление
последней dependency. См. [кэш и обход через `--clean`](../guides/linking#кэширование).

## Общие механизмы

### Executables и Filemap

`.executables.json` содержит metadata compiler, `.filemap.json` — mapping
линкера. Текущая нормализация source/output paths имеет известное расхождение;
не считайте generated mapping проверенным только по успешному `link`.
[Описание границы](../guides/linking#filemap-filemap-json).

### api_ext.xml

`dist/source/api_ext.xml` формируется из system standalone и пользовательских
standalone entries в порядке линковки. Component имеет отдельную инициализацию.
Library отдельной entry не получает. Чистая линковка удаляет старые entries.

## Сводная таблица типов

| Тип          | Legacy имя | Default путь                 | Generated initialization        |
| ------------ | ---------- | ---------------------------- | ------------------------------- |
| `standalone` | `app`      | `wt/<ws:name>`               | `init.xml` при `main`           |
| `component`  | —          | `components/<ws:name>`       | `spxml/`, platform package.json |
| `system`     | `bt`       | Зависит от dependency mode   | Уже содержится в пакете         |
| `library`    | `lib`      | В `node_modules/` executable | Нет; copier требует `library`   |

## CLI опции

```sh
btc link --clean
btc link --no-cache
btc link --linking-system-as standalone
btc link --external-runtime
```

Подробности: [линковка](../guides/linking) и [btconfig.json](./btconfig).
