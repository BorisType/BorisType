# @boristype/ws-client

Node.js SOAP-клиент для WebSoft HCM. Используется CLI и MCP BorisType;
не требует установки компилятора или DLL. Node.js 24 или новее.

```sh
npm install @boristype/ws-client@next
```

Публичные exports:

| Export                                | Назначение                                                         |
| ------------------------------------- | ------------------------------------------------------------------ |
| `WshcmClient`                         | Подключение и `callMethod(object, method, args)` через SP-XML SOAP |
| `Evaluator`                           | Временный серверный модуль для выполнения BorisScript              |
| `WshcmUploader`                       | Пакетная загрузка файлов через серверные BS resources              |
| `WshcmException`, `UnauthorizedError` | Ошибки SOAP/аутентификации                                         |
| `renderRequest`, `parseResponse`      | Низкоуровневая сериализация SOAP                                   |

Типы опций экспортируются вместе с JavaScript declarations. Минимальный пример
для доверенного тестового стенда, с реквизитами из environment:

```js
import { WshcmClient } from "@boristype/ws-client";

const client = new WshcmClient({
  overHttps: true,
  host: process.env.WSHCM_HOST,
  port: 443,
  username: process.env.WSHCM_USERNAME,
  password: process.env.WSHCM_PASSWORD,
});

const evaluator = client.createEvaluator();
try {
  await evaluator.initialize();
  console.log(await evaluator.eval("return 2 + 2;"));
} finally {
  await evaluator.close();
}
```

Перед запуском задать `WSHCM_HOST`, `WSHCM_USERNAME`, `WSHCM_PASSWORD`.
У учётной записи должны быть права на соответствующие серверные методы.
Evaluator создаёт временный `.bs` файл на сервере и исполняет переданный код;
использовать только доверенный код и закрывать evaluator после работы.
`close()` возвращает false, если очистка не удалась.

Клиент сохраняет строковые SOAP значения, включая whitespace, CR/LF и текст,
похожий на числа; явный `VALUE-TYPE` по-прежнему влияет на преобразование.
Ограничения чисел/SQL/XML целевой платформы этим не устраняются. HTTP timeout
не отменяет выполняемый серверный код и не гарантирует rollback: операции
с изменениями нельзя автоматически повторять после неизвестного результата.

Пакет содержит JavaScript, declarations и два BS resources для uploader.
Исходники, тесты, конфигурация стенда и DLL в npm-архив не входят.
Подробнее: [документация BorisType](https://github.com/BorisType/BorisType/tree/main/docs)
и [сценарии MCP](https://github.com/BorisType/BorisType/blob/main/docs/guides/mcp-server.md).
