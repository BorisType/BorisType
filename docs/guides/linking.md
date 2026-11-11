# Система линковки (Linking)

`btc link` собирает готовые файлы и BT dependencies в `dist/`. Он не запускает
компиляцию. Это часть существующего экспериментального module pipeline:
развитие `script/module` заморожено до решения стратегии памяти C-runtime.
См. [режимы](../reference/compile-modes).

## Как работает линковка

Непустой `btconfig.json#linking.packages` задаёт список пакетов. Секция `linking`
без массива переопределяет пути текущего пакета. Без неё используется текущий
executable BT пакет из `package.json`.

## Одиночный пакет (без btconfig.json)

```json
{
  "name": "my-app",
  "version": "1.0.0",
  "main": "index.js",
  "ws:name": "my-app",
  "ws:package": "standalone",
  "ws:root": "./wt/my-app"
}
```

`ws:name` обязателен. Для standalone `ws:root` опционален, default —
`./wt/<ws:name>`. `main` относится к корню готового output, а не к `src/`.
Для module pipeline установите совместимую версию `@boristype/runtime`
в зависимости проекта.

```sh
npx btc build --compile-mode module --include-non-ts-files
npx btc link --clean
```

Файловые директивы могут переопределить CLI mode. Runtime и generated init
не добавляют module ABI к bare output.

## Multi-package режим

```json
{
  "linking": {
    "packages": [{ "name": "backend" }, { "name": "frontend", "source": "./frontend/dist", "target": "./wt/frontend" }]
  }
}
```

`backend` — BT пакет со своим `package.json` и готовым `build/`; `frontend` —
обычный каталог. `source` задан относительно корня проекта, `target` — внутри
`dist/`. Каталог из `name` должен существовать и при явном `source`.
Top-level `packages` map не поддерживается.
Соберите каждый пакет отдельно, затем выполните `btc link` из корня.
Подробные defaults и root-only форма — в [btconfig.json](../reference/btconfig).

## Процесс линковки

1. Находит system dependencies корневого проекта и копирует их готовый `build/`.
2. В порядке конфигурации копирует пользовательские пакеты/статические директории.
3. Для standalone/component копирует распознанные library dependencies и создаёт
   initialization/metadata. Executables из `.executables.json` участвуют в filemap.
4. Пишет `source/api_ext.xml`, если собраны API entries: system standalone перед
   пользовательскими standalone. Component имеет отдельные `spxml/` файлы.

Прикладные зависимости не сортируются топологически; нужный порядок задаётся
конфигурацией. System-пакеты должны уже содержать свою инициализацию.

## CLI опции

| Опция                        | Действие                                  | Default     |
| ---------------------------- | ----------------------------------------- | ----------- |
| `--clean`                    | Удаляет `dist/` и `.btc/` перед линковкой | Выключено   |
| `--no-cache`                 | Не использует dependency cache            | Кэш включён |
| `--linking-system-as <mode>` | `component` или `standalone`              | `component` |
| `--external-runtime`         | Пропускает автообнаруженные system-пакеты | Выключено   |

`--external-runtime` требует заранее установленный подходящий runtime; это не
режим компиляции без runtime. Для повторной поставки после удаления/переименования
файлов очистите старый output сборки и выполните `link --clean`.

### Режимы линковки system пакетов

| Режим        | Путь                                                   | api_ext.xml    |
| ------------ | ------------------------------------------------------ | -------------- |
| `component`  | `components/<ws:name>`                                 | Не добавляется |
| `standalone` | `ws:root` (обязателен для найденной system dependency) | Из metadata    |

## Итоговая структура dist/

```text
dist/
├── components/
│   ├── bt-runtime/
│   └── my-component/
│       ├── package.json
│       └── spxml/
├── wt/backend/
│   ├── index.js
│   ├── init.xml
│   ├── .filemap.json
│   └── node_modules/
└── source/api_ext.xml
```

Не все файлы обязательны: init зависит от metadata, filemap — от executables.
[Типы пакетов](../reference/package-types) описывают эти условия.

## Filemap (.filemap.json)

Generated `.filemap.json` сопоставляет executable keys с целевыми URL.
Вручную полагаться на формат ключа как публичный API не следует: CLI compiler и
линкер сейчас расходятся в нормализации source/output paths; это известный
дефект executable mapping. Полная линковка не доказывает работоспособность
импортов из executable script. Проверяйте конкретный generated key/URL и вызов.

## api_ext.xml

Общий файл `dist/source/api_ext.xml` содержит entries standalone и system в
standalone mode. Component и library туда не добавляются.
`ws:apiext` задаёт имя и libs явно; без него `main` standalone создаёт entry
на `init.xml`. Если нового набора API entries нет, старый `api_ext.xml` может
сохраниться. Отдельно: при удалении пакета или смене его `ws:name`/target старый
каталог и файлы остаются в `dist`, даже если другие пакеты продолжают линковаться.
Перед поставкой используйте `link --clean` и актуальный compiler output.

## Копирование node_modules

Копируются только пакеты с точным `ws:package: "library"`; обычная npm-зависимость
не становится совместимой с BorisScript от установки. Legacy `lib` нормализуется
для типа пакета, но текущий dependency copier его не распознаёт.
Поддержаны scoped names и symlinks; вложенные libraries копируются рекурсивно.
Library должна содержать готовые файлы в форме, ожидаемой вашим import runtime.
Линковщик не компилирует её TS и не превращает npm JavaScript в BorisScript.

### Кэширование

`.btc/linking-cache.json` хранит hash ближайшего `pnpm-lock.yaml`/`package-lock.json`
и content hashes локальных библиотек. Поиск lockfile поднимается до workspace
root; без него используется hash `package.json`.
Локальной считается symlink-библиотека с realpath **вне `node_modules`**.
`file:` dependency внутри pnpm store не получает гарантии content invalidation.

Удаление `dist/` без удаления кэша, изменение target или nested dependency при
неизменном lockfile могут оставить неполную/старую копию. Удаление последней
library также не очищает старую копию автоматически. `link --clean` пересоздаёт
и output, и кэш; `--no-cache` само по себе не очищает произвольные старые файлы.
[Причины и подтверждённые границы](https://github.com/BorisType/BorisType/blob/main/refs/cli/linking-and-cache.md).

## Примеры использования

Одиночный BT пакет использует `package.json` выше. Для multi-package сначала
соберите backend и frontend их собственными командами, затем из корня:

```sh
npx btc link --clean
npx btc artifact --clean
```

## Справочник конфигурации

- [btconfig.json](../reference/btconfig)
- [Типы пакетов](../reference/package-types)
- [Dev mode и ограничения incremental link](./dev-mode)
