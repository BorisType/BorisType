# @boristype/ws-client

Node.js SOAP-клиент и HCM SDK для WebSoft HCM. Используется CLI и MCP BorisType;
не требует установки компилятора. Node.js 24 или новее. DLL для файлового API
включены в npm-пакет и автоматически подготавливаются на HCM.

```sh
npm install @boristype/ws-client@next
```

Публичные exports:

| Export                                  | Назначение                                                         |
| --------------------------------------- | ------------------------------------------------------------------ |
| `WshcmClient`                           | Подключение и `callMethod(object, method, args)` через SP-XML SOAP |
| `WshcmApi`                              | Общие файловые операции, XML объекты, XQuery и управление runtime  |
| `WshcmRuntimeError`, `WshcmObjectError` | Ошибки с `.status` / `.details`                                    |
| `wshcmSchemas`                          | Входные schemas общего SDK                                         |
| `Evaluator`                             | Временный серверный модуль для выполнения BorisScript              |
| `WshcmUploader`                         | Пакетная загрузка файлов через серверные BS resources              |
| `WshcmException`, `UnauthorizedError`   | Ошибки SOAP/аутентификации                                         |
| `renderRequest`, `parseResponse`        | Низкоуровневая сериализация SOAP                                   |

Типы опций экспортируются вместе с JavaScript declarations. Минимальный пример
для доверенного тестового стенда, с реквизитами из environment:

```js
import { WshcmClient, WshcmApi } from "@boristype/ws-client";

const client = new WshcmClient({
  overHttps: true,
  host: process.env.WSHCM_HOST,
  port: 443,
  username: process.env.WSHCM_USERNAME,
  password: process.env.WSHCM_PASSWORD,
});

await client.initialize();
const evaluator = client.createEvaluator();
try {
  await evaluator.initialize();
  const api = new WshcmApi(evaluator);
  console.log(await api.files.info({ path: "x-local://wt" }));
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

## Общий API

`new WshcmApi(evaluator)` не инициализирует и не закрывает evaluator. Экземпляр
владеет read grants и сохраняет их только в своей памяти.

- `files.read/write/edit/list/delete/mkdir/move/info/search(input)` — физические
  серверные файлы. `read` возвращает content/hash/координаты и readToken;
  `edit` требует прочитанные диапазоны, overwrite — полное чтение. Token другого
  экземпляра API не принимается. Ограничения совпадают с файловыми MCP tools.
- `objects.getForm/get/save(input)` — раскрытая XMD и XML объектов. ID передаётся
  строкой, replace требует token полного чтения. `.details` у `WshcmObjectError`
  сохраняет phase/writeStatus/id, включая неизвестный исход Save.
- `xquery({query,maxRows?})` возвращает проверенный **исходный JSON text**:
  parse/re-encode может потерять точность чисел. SQL префикс передаётся без
  read-only проверки. XML/XQuery не требуют подготовки DLL.
- `runtime.ensure()` автоматически подготавливает зависимости и возвращает
  статус; локальная ошибка или потеря transport-ответа выбрасывает
  `WshcmRuntimeError` с `.status`. `runtime.requireReady()` дополнительно
  выбрасывает эту ошибку при любом статусе кроме ready.

## Автоматическая подготовка DLL

Каждая файловая операция вызывает runtime gate. Manifest и SHA256 пакета
проверяются до отправки, серверные bytes — перед загрузкой helper и компонента.
Установщик сверяет assembly name, informational version, API, target framework
и MVID до публикации. Загруженная assembly определяется по MVID из памяти.
`expected`, `installed`, `loaded` — отдельные identity в status schema 1.

Для net9 HCM с настроенным `dotnetcore/shared` используются собственные пути
`<AppDirectoryPath>/dotnetcore/shared/.boristype-runtime/`. У аккаунта должны
быть права на создание этих файлов и загрузку managed code. SDK не меняет
DOTNETLIBS-PATH, не устанавливает CLR и не перезапускает HCM.

При старой загруженной сборке новая подготавливается рядом и возвращается
`restart_required`: файловые вызовы блокируются до проверки после перезапуска.
`blocked` сообщает, например, несовместимый API, повреждение immutable файлов
или конфликт разных builds одного version. Более новая совместимая версия
не откатывается. XQuery/XML остаются доступны.

Concurrent ensure одного экземпляра объединяются, последующие вызовы проверяют
процесс снова. Status относится к ответившему процессу; gate и файловая операция
являются разными SOAP вызовами. Балансировка на другой процесс/узел не даёт
гарантии готовности всего кластера. Нет автоматического retry изменения файла
после timeout и автоматического удаления старых DLL.

Расширенный второй аргумент WshcmApi/WshcmRuntime позволяет задать
`bundleDirectory` и безопасное одно имя `installationName` под `dotnetcore/shared`.
Обычной установке эти options не нужны. File API принимает только компонент
BorisType.FileSystem / API 2; общий runtime manager допускает другие компоненты.

Пакет содержит JavaScript, declarations, BS bridges, manifest и production DLL
с deps.json; vendor assemblies, CLR, PDB, исходники, тесты и конфигурация стенда
в npm-архив не входят. Сборка **из исходников** требует SDK из global.json:
`pnpm --filter @boristype/ws-client build` готовит DLL и tsc output.
Установке из npm .NET SDK не нужен.
Подробнее: [документация BorisType](https://github.com/BorisType/BorisType/tree/main/docs)
и [сценарии MCP](https://github.com/BorisType/BorisType/blob/main/docs/guides/mcp-server.md).
