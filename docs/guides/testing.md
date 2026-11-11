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
node packages/botest/build/index.js tests/build array
node packages/botest/build/index.js tests/build array/at.test.js
```

Наборы объявляются в `tests/src/<suite>/_suite.json`: ключи `tests` указывают
на имена скомпилированных `.test.js` файлов. Успешное завершение теста отмечается
вызовом `botest.assertOk()`; примеры находятся в
[существующих тестах](https://github.com/BorisType/BorisType/tree/main/tests/src).

## Что подтверждает результат

Botest проверяет поведение в своей Node.js эмуляции. Этот результат не
подтверждает платформенные API, управление памятью, storage hooks или выполнение
в C-runtime HCM. `.test.ts` по умолчанию компилируется в `script`; директива
`/// @bt-mode bare` имеет более высокий приоритет. Развитие `script/module`
приостановлено, сохранённые тесты не меняют этот статус.

Для исследования семантики, PASS/XFAIL и native проверок используйте
[руководство по проверкам компилятора](https://github.com/BorisType/BorisType/blob/main/refs/compiler/verification.md).
Проверки MCP и DLL описаны отдельно в
[руководстве MCP](./mcp-server#проверки) и
[руководстве .NET](./dotnet#границы-проверок).
