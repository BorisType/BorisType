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
- `xquery({query,maxRows?})` возвращает typed `XQueryResult`: integer как bigint,
  real как number, XML-поля проецируются на сервере. SQL префикс передаётся без
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

## Типы и совместимость

**Несовместимое изменение:** все SOAP `integer`, включая небольшие значения,
возвращаются как `bigint`. Для integer-аргумента используйте `42n`; `42` всегда
передаётся как `real`. Диапазон integer — `-9223372036854775808n`…`9223372036854775807n`.
Отрицательные значения, включая `-7n`, пригодны для повторной передачи на вход.

| HCM / SOAP  | JavaScript                      | Примечание                                               |
| ----------- | ------------------------------- | -------------------------------------------------------- |
| `integer`   | `bigint`                        | Точный signed int64                                      |
| `real`      | `number`                        | Известная потеря точности в серверном SOAP-сериализаторе |
| `string`    | `string`                        | Без угадывания чисел по тексту                           |
| `bool`      | `boolean`                       | `true` / `false`                                         |
| `null`      | `null`                          | Отличается от `undefined`                                |
| `undefined` | `undefined`                     | Сохраняется и во вложенных значениях                     |
| `Array`     | `WshcmValue[]`                  | Пустые, одиночные и смешанные массивы                    |
| `Object`    | `{ [key: string]: WshcmValue }` | Обычные записи, рекурсивно                               |
| XML / date  | Явная ошибка в общем кодеке     | Для XQuery есть отдельная проекция                       |

`NaN`, `Infinity`, `-Infinity`, `-0` поддерживаются как real. Однако точный
round-trip произвольного `number` не гарантируется: на Linux C HCM 2025.2.1333
`1.2345678901234567` возвращается как `1.2345678901`, а `1e-100` — как `0`.

`callMethod<T>(lib, method, args)` сохраняет generic API. `T` — утверждение типа
вызывающим кодом, без runtime-конверсии или проверки. Используйте `bigint` в
ожидаемых типах integer-полей. Значения можно передавать обратно с теми же типами
в пределах поддерживаемого домена; идентичность объектов не сохраняется.

Записи на входе должны иметь собственные enumerable data properties с допустимыми
XML-именами без namespace-префикса. Имена с пробелами, `:`, XML markup,
accessors, symbols, class instances, Date, Map, циклы, sparse arrays и пользовательские
свойства массивов отвергаются. Ответ сохраняет namespace-префиксы, но такие ключи
нельзя повторно отправить без явного преобразования. Строки должны состоять из
допустимых XML 1.0 символов. Некорректные typed responses дают явную ошибку.

## XQuery

`evaluator.xquery(query, { maxRows?: number })` возвращает `Promise<XQueryResult>`:

```typescript
{
  rows: WshcmValue[];
  returnedRows: number;
  truncated: boolean;
  limitReason: "rows" | "output" | null;
}
```

`WshcmApi.xquery({ query, maxRows? })` возвращает тот же typed результат.
Альтернатива для собственного evaluator: `executeXQuery({ eval }, query, options)`.
Каталожные/SQL XML-строки проецируются на сервере по фактическим типам полей.
Клиент получает обычные записи с `bigint`/`number`, вложенные структуры и массивы;
полный XML API не создаётся. Повторяющиеся имена становятся массивами, schema multi
сохраняет singleton-массив. Пустые scalar-поля используют фактическое `.Value`;
complex-поля становятся записями. Native date превращается в ISO-строку с датой
или датой/временем и смещением, как её выдаёт `EncodeJson`. Имена SQL aliases могут
содержать пробелы: внутренний carrier не использует их как XML-имена.

По умолчанию выдаётся до 100 строк, допустимо 1–1000; материализуется до `maxRows+1`.
Запрос — непустой well-formed текст до 64 KiB UTF-8 без NUL. Проекция ограничена
глубиной 32 и 10000 значений; превышение даёт ошибку. Размер ограничивается между
целыми строками по 65000 символов внутреннего carrier, итог — до 256 KiB в JSON
представлении. Метаданные усечения описывают только возвращённую выборку.
Строковые листья защищены JSON escaping, включая CR/LF.

Запрос передаётся без изменений, включая `sql:`. Вызов не гарантирует чтение,
идемпотентность, откат или ограничение работы БД; timeout не гарантирует отмену.
Автоматических повторов нет. SQL→XML может терять отрицательные integer и смешивать
NULL с пустой строкой ещё до SOAP. Для signed SQL-значений на проверенном Linux C/PG
используйте, например, `CAST(-7 AS VARCHAR(32))`.

MCP отдельно преобразует безопасные `bigint` в JSON number, остальные — в decimal
string. Прямой `JSON.stringify` результата ws-client с `bigint` требует replacer.

[Матрица, границы и источники](../../docs/reference/ws-client-values.md).

## Проверки

```sh
pnpm --filter @boristype/ws-client build
pnpm --filter @boristype/ws-client test
# На явно выбранном тестовом HCM: WSHCM_HOST, WSHCM_USERNAME, WSHCM_PASSWORD;
# optional WSHCM_PORT (80), WSHCM_HTTPS (false).
pnpm --filter @boristype/ws-client test:e2e:values
pnpm --filter @boristype/ws-client test:e2e:xquery
```

Native серии создают и удаляют собственные временные BS-модули, не меняя бизнес-записи.
`test:e2e:values` фиксирует наблюдаемое форматирование real на Linux C 2025.2.1333;
другие runtime требуют своей проверки.
