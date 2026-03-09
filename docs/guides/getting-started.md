# Быстрый старт

## Требования

- **Node.js 22+**
- **pnpm 10+** (рекомендуется) или npm

## Установка

Добавьте BorisType в ваш проект:

```sh
npm install -D @boristype/bt-cli @boristype/types
```

```sh
npm install @boristype/runtime
```

Инициализируйте конфигурацию TypeScript:

```sh
npx btc init
```

Эта команда создаст `tsconfig.json` с необходимыми настройками для BorisType.

## Структура проекта

Минимальный проект выглядит так:

```
my-project/
├── package.json
├── tsconfig.json          # Создаётся через btc init
├── src/
│   └── index.ts           # Ваш TypeScript код
├── build/                 # Транспилированный BorisScript (выходная директория)
└── dist/                  # Слинкованные модули для деплоя
```

### package.json

```json
{
  "name": "my-app",
  "main": "index.js",
  "ws:name": "my-app",
  "ws:package": "standalone",
  "ws:root": "./wt/my-app",
  "devDependencies": {
    "@boristype/bt-cli": "latest",
    "@boristype/types": "latest"
  },
  "dependencies": {
    "@boristype/runtime": "latest"
  }
}
```

::: tip Поля ws:\*

- `ws:name` — имя пакета для путей в WebSoft HCM
- `ws:package` — тип пакета (`standalone`, `component`, `system`, `library`)
- `ws:root` — путь внутри `dist/` куда будет скопирован `build/`

Подробнее: [Типы пакетов](../reference/package-types)
:::

## Сборка

### Компиляция

```sh
npx btc build
```

Транспилирует TypeScript из `src/` в BorisScript в `build/`.

### Линковка

```sh
npx btc link
```

Собирает все модули и зависимости в `dist/` для деплоя.

Подробнее: [Линковка](./linking)

### Push на сервер

```sh
npx btc push --host example.com --port 8080
```

Загружает скомпилированный код на WebSoft HCM сервер.

Подробнее: [Push & Deploy](./push-deploy)

## Dev Mode

Для разработки используйте watch mode с автоматическим деплоем:

```sh
npx btc dev
```

Это запустит:

- Отслеживание изменений файлов
- Инкрементальную компиляцию
- Автоматическую линковку
- Push на сервер (с debounce 500мс)

Подробнее: [Dev Mode](./dev-mode)

## Multi-package проект

Для проектов с несколькими пакетами создайте `btconfig.json`:

```json
{
  "linking": {
    "packages": [{ "name": "backend" }, { "name": "frontend" }]
  }
}
```

```
my-mono-project/
├── btconfig.json
├── package.json
├── backend/
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
├── frontend/
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
└── dist/
```

Подробнее: [btconfig.json](../reference/btconfig)

## Что дальше?

- [Что такое BorisType?](./what-is-boristype) — подробнее о проекте и архитектуре
- [Режимы компиляции](../reference/compile-modes) — bare, script, module
- [Ограничения BorisScript](../reference/borisscript-constraints) — что умеет (и не умеет) целевая платформа
