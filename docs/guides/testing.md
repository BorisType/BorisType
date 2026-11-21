# Тестирование

`botest` запускает скомпилированные BorisScript-тесты в Node.js с эмуляцией
части платформенного поведения. Это private workspace package репозитория,
а не отдельный опубликованный пакет `@boristype/botest`.

## Запуск в checkout BorisType

Из корня репозитория, с версиями Node.js/pnpm из `.node-version` и
`package.json#packageManager`:

```sh
pnpm install --frozen-lockfile
pnpm exec turbo run build
pnpm test
```

Для выполнения нужен отдельно предоставленный разрешённый JS runtime
`packages/botest/build/borisscript/main.js`; сборка его не создаёт.
См. prerequisites в [compiler verification](https://github.com/BorisType/BorisType/blob/main/refs/compiler/verification.md).

Корневая команда `pnpm test` запускает runner для уже собранного `tests/build`;
она не собирает тесты автоматически. Для выбора набора после сборки:

```sh
node packages/botest/build/index.js tests/build labels
node packages/botest/build/index.js tests/build labels/block-break.test.js
```

Наборы объявляются в `tests/src/<suite>/_suite.json`: ключи `tests` указывают
на имена скомпилированных `.test.js` файлов. Успешное завершение теста отмечается
вызовом `botest.assertOk()`; примеры находятся в
[существующих тестах](https://github.com/BorisType/BorisType/tree/main/tests/src).

Общие регрессии используют конструкции, доступные в выбранном режиме. Например,
в `bare` тест короткого замыкания использует булевы операнды, а trace передаётся
явно в объекте. Тесты прежних режимов сохранены в ветке `archive/compiler-modes`.
[Оригинальные фикстуры](https://github.com/BorisType/BorisType/tree/7a0b6a26a004f480f76fad9d534fedcde9f8aea7/tests/src).

## Что подтверждает результат

Botest проверяет поведение в своей Node.js эмуляции. Этот результат не
подтверждает платформенные API, управление памятью, storage hooks или выполнение
в C-runtime HCM. Для `.test.ts` действуют обычные [правила выбора режима](../reference/compile-modes).

Для исследования семантики и native проверок используйте
[руководство по проверкам компилятора](https://github.com/BorisType/BorisType/blob/main/refs/compiler/verification.md).
Проверки MCP и DLL описаны отдельно в
[руководстве MCP](./mcp-server#проверки) и
[руководстве .NET](./dotnet#границы-проверок).
