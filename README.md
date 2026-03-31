# BorisType Compiler (`btc`)

> Инструмент для компиляции TypeScript в валидный код на **BorisScript** и последующей сборки проекта для поставки.  
> ⚠️ **Проект в активной разработке — не готов для продакшн-использования!**

## Установка

```sh
npm install -D @boristype/bt-cli @boristype/types
npx btc init
```

---

## Команды

### `btc build [files...]`

Транспиляция TypeScript в BorisScript. Команда по умолчанию.

```sh
npx btc build              # Собрать все файлы проекта
npx btc build src/main.ts  # Собрать конкретный файл
npx btc                    # Эквивалентно btc build
```

**Опции:**

- `--compile-mode <mode>` — режим компиляции: `bare`, `script`, или `module` (по умолчанию)
- `--outDir <dir>` — директория для сохранения обработанных файлов

### `btc link`

Компоновка модулей и зависимостей в структуру `dist/`.  
Собирает все необходимые модули и формирует итоговую структуру для развёртывания.

```sh
npx btc link
```

См. подробнее в [документации по линковке](docs/guides/linking.md).

### `btc init`

Инициализация BorisType проекта. Создаёт `tsconfig.json` с необходимыми настройками.

```sh
npx btc init
```

### `btc push`

Загрузка скомпилированного кода на WebSoft HCM сервер с автоматической реинициализацией модулей.

```sh
npx btc push                                  # Использует настройки по умолчанию
npx btc push --host example.com --port 8080  # С кастомными параметрами
```

**Опции:**

- `--host <host>` — адрес WebSoft HCM сервера (по умолчанию: localhost)
- `--port <port>` — порт сервера (по умолчанию: 80)
- `--username <user>` — имя пользователя (по умолчанию: user1)
- `--password <pass>` — пароль (по умолчанию: user1)
- `--https` — использовать HTTPS соединение

**Конфигурация:** Можно создать файл `btconfig.properties` в корне проекта для хранения настроек подключения.  
См. подробнее в [документации по деплою](docs/guides/push-deploy.md).

### `btc dev`

Режим разработки с автоматической пересборкой и деплоем при изменениях.

```sh
npx btc dev              # С автоматическим push (по умолчанию)
npx btc dev --no-push    # Без автоматического push
```

**Возможности:**

- Watch mode для TypeScript и не-TypeScript файлов
- Инкрементальная компиляция (только изменённые файлы)
- Автоматическая линковка после сборки
- Автоматический push на сервер (debounced 500ms)
- Координация multi-package сборки

См. подробнее в [документации по dev mode](docs/guides/dev-mode.md).

### `btc artifact`

⚠️ **Команда в разработке**  
Создание архивов для поставки с CI/CD.

---

## Возможности

### Компиляция

- **IR-based compilation** — современный подход через промежуточное представление (bt-ir)
- Три режима компиляции: `bare`, `script`, `module`
- Директива `/// @bt-mode` для явного указания режима
- Автоматическое определение executable objects

### TypeScript Features

- Объявление переменных внутри циклов
- Поддержка циклов `for-of`
- Стрелочные функции
- Template literals
- Частичная поддержка методов массивов (`forEach`, `map`, и др.)
- Частичная поддержка методов объектов

### Модульность

- Работа с зависимостями через `npm`
- `import`/`export` преобразуются в `require`
- Собственная реализация `require` для BorisScript

### Сборка и деплой

- **Линковка модулей** (одиночные и multi-package проекты)
- **Watch mode** с инкрементальной компиляцией
- **Push на WebSoft HCM** с автоматической реинициализацией
- Координация multi-package builds

См. подробнее:

- [Linking документация](docs/guides/linking.md)
- [Push & Deploy](docs/guides/push-deploy.md)
- [Dev Mode](docs/guides/dev-mode.md)

## Сборка из исходников

> Требуется Node.js 22+ и pnpm 10+

```sh
git clone https://github.com/BorisType/BorisType.git
cd BorisType
pnpm install
npx turbo run build
```

Запуск тестов:

```sh
npx turbo run test
# или вручную:
node ./packages/botest/build/index.js tests/build
```

### Структура monorepo

| Пакет                   | Директория                 | Назначение                 |
| ----------------------- | -------------------------- | -------------------------- |
| `@boristype/bt-cli`     | `packages/bt-cli`          | CLI компилятор             |
| `@boristype/bt-ir`      | `packages/bt-ir`           | IR pipeline (транспиляция) |
| `@boristype/ws-client`  | `packages/ws-client`       | WebSoft HCM клиент         |
| `@boristype/ws-version` | `packages/ws-version`      | Конверсия версий           |
| `@boristype/runtime`    | `packages/builtin-runtime` | BorisScript polyfills      |
| `botest`                | `packages/botest`          | Тест-раннер                |

Подробнее об архитектуре: [ref/architecture/monorepo.md](ref/architecture/monorepo.md)

_Тестирование компилятора проводится на версии 916._

---

## Примеры использования

Проект включает примеры для разных сценариев в директории `examples/`:

### Single package

```sh
cd examples/single
pnpm install
pnpm run build && npx btc link
```

### Multi-package режим

```sh
cd examples/multi
pnpm install
npx btc link
```

Подробнее см. [examples/README.md](examples/README.md) и [документацию по линковке](docs/guides/linking.md).

---

## Статус проекта

BorisType Compiler находится в стадии активной разработки.  
Некоторые возможности ещё не реализованы или могут измениться в будущем.
