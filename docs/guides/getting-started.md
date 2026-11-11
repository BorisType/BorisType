# Быстрый старт

BorisType компилирует ограниченное подмножество TypeScript в BorisScript.
Текущее направление разработки — **bare**. Развитие `script/module` заморожено
до решения стратегии памяти C-runtime; реализации и регрессии сохранены.
**Default CLI остаётся `module`**, поэтому bare нужно выбирать явно.
См. [режимы](../reference/compile-modes) и
[ограничения](../reference/borisscript-constraints).

## Требования

CLI требует Node.js 24 или новее. Для разработки самого BorisType используйте
точные версии из `.node-version` и `package.json#packageManager`; требования MCP
могут быть строже. Установка опубликованного CLI не требует checkout monorepo.

## Установка

В каталоге своего проекта:

```sh
npm install -D @boristype/bt-cli @boristype/types typescript@^6.0.3
npx btc init
```

`init` создаёт только `tsconfig.json`, если его ещё нет. Он не создаёт
`package.json`, исходники, runtime или настройки сервера.

## Структура проекта

```text
my-project/
├── package.json
├── tsconfig.json
├── src/
│   └── index.ts
└── build/
```

Создайте `src/index.ts`:

```typescript
/// @bt-mode bare
var message = "Hello from BorisType";
alert(message);
```

`alert` — API целевой платформы. Этот пример не предназначен для обычного Node.js.
Bare не предоставляет обычные module import/export, closures и polyfills;
его output требуется запускать подходящим способом на вашей платформе.

## Сборка

### Компиляция

```sh
npx btc build --compile-mode bare
```

В конфигурации, созданной `init`, исходники находятся в `src/`, output — в
`build/`. Пути задаёт `tsconfig.json` (`rootDir`, `outDir`, `include`/`exclude`).
Для копирования текстовых ресурсов добавьте `--include-non-ts-files`.
Сборка не очищает старый output; после удаления/переименования исходников
удалите ненужные файлы из выходной директории и пересоберите.
Ошибки могут сопровождаться частичным output: проверяйте exit status и diagnostics.

### Линковка

Следующие шаги относятся к **существующему экспериментальному module pipeline**.
Для него установите runtime совместимой с CLI версии:

```sh
npm install @boristype/runtime
```

Добавьте metadata в свой `package.json` (сохранив установленные зависимости):

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

`main` указывает на файл относительно корня скомпилированного пакета.
Соберите module output и затем скомпонуйте `dist/`:

```sh
npx btc build --compile-mode module --include-non-ts-files
npx btc link --clean
```

Для module-примера уберите `/// @bt-mode bare` из исходника: директива важнее CLI.
Линковка сама не компилирует пакеты. Подробнее: [линковка](./linking) и
[типы пакетов](../reference/package-types).

### Push на сервер

Подготовьте [btconfig.properties](../reference/btconfig-properties), проверьте
адрес сервера и содержимое `dist/`, затем выполните:

```sh
npx btc push
```

Push загружает файлы и запускает инициализацию на HCM. Это отдельное действие,
а не часть `build` или `link`. См. [деплой и ограничения](./push-deploy).

## Dev Mode

Для существующего module pipeline можно запустить локальный watch без сервера:

```sh
npx btc dev --no-push
```

Без `--no-push` автоматически выполняется загрузка на сервер. У `dev` нет
`--compile-mode`; bare-файлы требуют директивы. Generated module initialization
не превращает bare output в обычный module. Ограничения watch описаны в
[Dev Mode](./dev-mode).

## Multi-package проект

В корневом `btconfig.json` перечислите пакеты:

```json
{
  "linking": {
    "packages": [{ "name": "backend" }, { "name": "another-module" }]
  }
}
```

Каталоги `backend/` и `another-module/` содержат собственные `package.json`,
`tsconfig.json`, `src/` и собранный `build/`. Собирайте каждый пакет из его
директории; `btc build` в корне не обходит `linking.packages`.
Подробнее: [btconfig.json](../reference/btconfig).

## Что дальше?

- [Что такое BorisType?](./what-is-boristype)
- [Режимы компиляции](../reference/compile-modes)
- [Ограничения BorisScript](../reference/borisscript-constraints)
