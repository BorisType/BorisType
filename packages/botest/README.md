# botest

Приватный runner BorisType для выполнения скомпилированных тестов в JS-реализации
BorisScript под Node. Это не отдельный опубликованный `@boristype/botest` пакет
и не native C-runtime acceptance.

## Подготовка и запуск

Из корня checkout, с Node/pnpm из pins проекта:

```sh
pnpm install --frozen-lockfile
pnpm exec turbo run build
```

Нужен отдельно предоставленный разрешённый runtime
`packages/botest/build/borisscript/main.js`. Он не распространяется с репозиторием;
сборка runner его не создаёт. Подробнее — [prerequisites и gates](https://github.com/BorisType/BorisType/blob/main/refs/compiler/verification.md).

После подготовки:

```sh
pnpm test
node packages/botest/build/index.js tests/build array
node packages/botest/build/index.js tests/build array/at.test.js
node packages/botest/build/index.js tests/build array string
```

`pnpm test` только запускает уже собранные тесты. После изменения исходников
повтори build. Фильтры задаются относительно `tests/build`; неизвестный фильтр
может дать успешный exit при нуле тестов — проверяй фактический счётчик.

## Добавление теста

Каждый файл `tests/src/<suite>/<case>.test.ts` — отдельный тест.
Используется ambient `botest`, без npm import:

```typescript
const actual = 2 + 3;
botest.assertValueEquals(actual, 5, "sum");
botest.assertOk();
```

Зарегистрируй **скомпилированное** имя в `tests/src/<suite>/_suite.json`:

```json
{
  "name": "Example",
  "tests": {
    "case.test.js": "Проверка суммы"
  }
}
```

Без регистрации runner не выполнит файл. `botest.assertOk()` бросает success
sentinel; размещай его в конце и не перехватывай как пользовательскую ошибку.
Понятные сообщения облегчают поиск сбоя; обязательной уникальности сообщений нет.

Основные assertions: `assertValueEquals`, `assertJsArrayEquals`,
`assertJsObjectEquals`, с фактическим и ожидаемым значениями и необязательным
сообщением. Реальный API — в [builtin-botest](https://github.com/BorisType/BorisType/tree/main/packages/builtin-botest/src).
Существующие suites также могут задавать `codeChecks` для generated output.

## Устройство и границы

[tester.ts](https://github.com/BorisType/BorisType/blob/main/packages/botest/src/tester.ts) находит `_suite.json`, проверяет output и запускает
зарегистрированные файлы. [borisscript](https://github.com/BorisType/BorisType/tree/main/packages/botest/src/borisscript) содержит adapter к
предоставленному JS runtime; это не полная модель всех версий платформы.
`bt.*` и polyfills поступают из собранного [builtin-runtime](https://github.com/BorisType/BorisType/tree/main/packages/builtin-runtime).

[Пользовательский гайд](https://github.com/BorisType/BorisType/blob/main/docs/guides/testing.md) и
[compiler verification](https://github.com/BorisType/BorisType/blob/main/refs/compiler/verification.md) разделяют unit,
JS semantic, known-XFAIL и native C проверки. Исторические результаты не заменяют
запуск на текущей ревизии.
