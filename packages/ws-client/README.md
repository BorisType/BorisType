# @boristype/ws-client

Node.js SOAP-клиент и HCM SDK для WebSoft HCM. Используется CLI и MCP BorisType;
не требует установки компилятора. Node.js 24 или новее. DLL для файлового API
включены в npm-пакет и автоматически подготавливаются на HCM.

```sh
npm install @boristype/ws-client@next
```

Публичные exports:

| Export                                         | Назначение                                                         |
| ---------------------------------------------- | ------------------------------------------------------------------ |
| `WshcmClient`                                  | Подключение и `callMethod(object, method, args)` через SP-XML SOAP |
| `WshcmApi`                                     | Файлы, XML объекты, XQuery, запуск агентов и сведения о стенде     |
| `WshcmRuntimeError`, `WshcmObjectError`        | Ошибки с `.status` / `.details`                                    |
| `WshcmObjectDeleteError`, `WshcmRunAgentError` | Ошибки удаления и запуска с известным ID, фазой и статусом         |
| `wshcmSchemas`                                 | Входные schemas общего SDK                                         |
| `Evaluator`                                    | Временный серверный модуль для выполнения BorisScript              |
| `WshcmDownloader`                              | Скачивание файлов и каталогов HCM по чанкам                        |
| `WshcmUploader`                                | Пакетная загрузка файлов через серверные BS resources              |
| `WshcmRequestError`, `UnauthorizedError`       | Ошибки HTTP, сети, timeout и аутентификации                        |
| `WshcmSoapFault`, `WshcmException`             | SOAP fault с серверной диагностикой и общая ошибка SDK             |
| `WshcmDispatchError`                           | Ошибка evaluator с признаком отправки кода                         |
| `renderRequest`, `parseResponse`               | Низкоуровневая сериализация SOAP                                   |

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

### Таймауты и состояние evaluator

`WshcmRequestOptions.timeoutMs` ограничивает один HTTP-запрос целиком,
включая получение тела ответа. Опции принимают `client.initialize(options)`,
`client.callMethod(lib, method, args, options)` и
`evaluator.initialize` / `eval` / `probe` / `close`. Без индивидуального
deadline действует настроенный `requestTimeout`, по умолчанию 30000 мс
socket timeout.

В `WshcmRequestError.kind` доступны `authentication` (HTTP 401/403),
`http`, `network` и `timeout`. У HTTP-ошибок есть `statusCode`.
Валидный SOAP Fault сохраняет серверную диагностику, в том числе при
HTTP 500. Если вызывающий код использует свой evaluator, он может передать
`WshcmDispatchError` с `dispatched: false` для однозначного сбоя подготовки.
Одиночный execute или XML write тогда сообщает, что отправки не было.
Причины ошибок и результаты уже подтверждённых шагов сохраняются.

`await evaluator.probe(options)` проверяет только собственную библиотеку
кодом `return 1;`. `evaluator.initialize({ force: true, timeoutMs })`
загружает её снова по прежнему URL. Клиент SDK управляет подготовкой и
очисткой самостоятельно. Если результат загрузки потерян, `close` всё
равно пытается удалить возможно созданную библиотеку.

## Скачать файл или каталог

Передайте открытый `evaluator` и точный путь к новому локальному файлу или каталогу. Вызывающий код закрывает evaluator после скачивания.

```typescript
import { WshcmDownloader } from "@boristype/ws-client";

const downloader = new WshcmDownloader({
  evaluator,
  path: "x-local://wt/site",
  destination: "./site-copy",
  chunkSize: 256 * 1024,
});
const result = await downloader.download((received, total) => console.log(received, total));
console.log(result.path, result.files, result.bytes, result.skippedLinks);
```

SDK сохраняет бинарные данные и пустые каталоги. Скачивание использует физический путь и штатный .NET-мост HCM для проверки ссылок. [Пути, конфликты и поведение при обрыве](https://boristype.github.io/BorisType/guides/push-deploy#скачать-файл-или-дерево-каталогов).

## Общий API

`new WshcmApi(evaluator)` не инициализирует и не закрывает evaluator. Экземпляр
владеет read grants и сохраняет их только в своей памяти.

- `files.read/write/edit/list/delete/mkdir/move/info/search(input)` — физические
  серверные файлы. `read` возвращает content/hash/координаты и readToken;
  `edit` требует прочитанные диапазоны, overwrite — полное чтение. Token другого
  экземпляра API не принимается. Ограничения совпадают с файловыми MCP tools.
- `objects.getForm/get/save/patch(input)` — раскрытая XMD и XML объектов. ID
  передаётся строкой, replace и patch требуют token полного чтения. `.details` у `WshcmObjectError`
  сохраняет phase/writeStatus/id, включая неизвестный исход Save.
- `objects.listTypes({kind?,objectType?,offset?,limit?})` — реестр типов
  и каталогов с нативной связью между ними. Для поиска настраиваемых полей
  и шаблонов используйте `customFields.list`.
- `objects.listDataTypes({objectType?,primaryObjectType?,secondaryObjectType?,offset?,limit?})`
  читает справочник `object_data_types`. `objectType` подходит для любой
  стороны связи. В ответе есть точные ID и типы обеих сторон.
- `objects.delete({id,readToken})` — перемещение одного документа в корзину
  после проверки полного XML и формы из чтения. `WshcmObjectDeleteError.details`
  сохраняет известный ID и исход попытки.
- `runAgent({agentId,mode?,waitTimeoutMs?,params?,objectId?,objectIds?})` —
  запуск существующего BorisScript-агента на standalone HCM. `async` сообщает
  о запуске, `sync` ждёт окончания потока в пределах указанного времени.
  При `wait_timeout` поток может продолжать работу.
- `xquery({query,maxRows?})` возвращает typed `XQueryResult`: integer как bigint,
  real как number, XML-поля проецируются на сервере. SQL префикс передаётся без
  read-only проверки. XML/XQuery не требуют подготовки DLL.
- `systemInfo({includeReport?})` возвращает `SystemInfoResult`: сводку версий
  и настроек стенда, при `includeReport: true` — также полный штатный отчёт.
  Параметр по умолчанию `{}`, DLL не требуется. Контракт описан ниже.
- `execute({code})` выполняет серверный BorisScript один раз. Возвращает
  `ExecutionResult` с результатом, сообщениями `print(value)` и native ошибкой.
  DLL не требуется; выполнение имеет права подключённого аккаунта.
- `packages.listSchemas/getSchema/saveSchema/deleteSchema/addObjects/removeObjects/exportPackage/inspectPackage/importPackage/getOperation(input)` — штатные схемы, ZIP-артефакты, preview/import и серверные receipts, без DLL. Контракт и примеры — ниже.
- `runtime.ensure()` автоматически подготавливает зависимости и возвращает
  статус; локальная ошибка или потеря transport-ответа выбрасывает
  `WshcmRuntimeError` с `.status`. `runtime.requireReady()` дополнительно
  выбрасывает эту ошибку при любом статусе кроме ready.

## Частичное редактирование XML объектов

`WshcmApi.objects.patch({id, readToken, xml, dryRun?})` обновляет перечисленные
поля существующего объекта. Он использует actual XMD, точный десятичный ID и
снимок полного чтения из этого экземпляра API.

```js
import { WshcmApi } from "@boristype/ws-client";

const api = new WshcmApi(evaluator); // evaluator initialized by caller
const id = "7349586349801536169";
const xml = "<cost_center><name>Changed</name></cost_center>";
const { readToken } = await api.objects.get({ id });
const preview = await api.objects.patch({ id, readToken, xml, dryRun: true });
// When ready to apply, obtain a new full read and check its XML.
const current = await api.objects.get({ id });
const applied = await api.objects.patch({ id, readToken: current.readToken, xml });
```

Каждая попытка patch с действующим token расходует его, включая invalid XML,
preview и no-op. `dryRun` по умолчанию `false`. Пропущенные поля сохраняются.
При `bt-mode` на поле используйте `replace` или пустой `clear` для структуры.
Массив с ключом по умолчанию обновляет или добавляет элементы по явно заданным
ключам. `replace` заменяет один элемент, `remove` удаляет его по ключу. Массив без
ключа заменяется перечисленным составом целиком. Пустой единственный
`clear`-элемент очищает группу, а `replace-array` на первом элементе задаёт
полный состав только этой одноимённой группы.

Patch поддерживает string, integer, bool, real и date. Binary, TEMP и методы
исключены. Date передаётся как native XML wall time до целых секунд. Дату без
времени передают в виде `YYYY-MM-DD`. Для `YYYY-MM-DDTHH:mm:ss` допустимы
отсутствие суффикса, `Z` или нулевое числовое смещение.
Поддерживается полное native написание короткого года
`1-01-02T12:34:56+00:00` для round-trip. Ненулевые смещение и доля секунды
отклоняются. XML и схема ограничены 256 KiB UTF-8 каждый, вход 8192 элементами
и глубиной 64, внутренний запрос 2 MiB вместе с metadata.

`changed` описывает XML кандидата до Save. Preview возвращает кандидат в
`xml`; preview и no-op дают `writeStatus: "not_attempted"`. Изменённое
сохранение даёт `writeStatus: "saved"` и фактический XML readback с изменениями
hooks. При ошибке readback признанное подтверждение Save остаётся в
`WshcmObjectError.details` вместе с фазой и известным ID. Проверка snapshot
не атомарна относительно внешних writers. Загрузка/присваивание могут выполнить
platform code. При неизвестном исходе установите состояние перед новым вызовом.

[XML-режимы, native acceptance и границы](https://github.com/BorisType/BorisType/blob/main/refs/mcp/xml-object-patch.md).

## Определения настраиваемых полей

`api.customFields.list({objectType, offset?, limit?})` даёт компактную
страницу зарегистрированных шаблонов. Для `request` ответ содержит
`templateType: "request_type"` и `templateSelector: "request_type_id"`.
У строки есть `templateId`, доступное название и счётчики полей и страниц.
Для полного чтения передайте тип владельца и точный ID в `scope`.

`api.customFields.get({scope})` читает поля, страницы и коды типов из общего
документа HCM. Область `{objectType: "subdivision"}` адресует общие определения.
Область `{objectType: "request_type", templateId: "6405466310999430311"}`
адресует один существующий тип заявки. У ненастроенного шаблона `exists: false`.

`api.customFields.patch({scope, revision, operations, dryRun?})` применяет
операции `upsertField`, `renameField`, `moveField`, `removeField`,
`upsertPage`, `movePage`, `removePage` и `removeTemplate`. Последняя
удаляет конфигурацию одной записи по `scope.templateId`. Схемы доступны
в `wshcmSchemas.customFields`. Чтение и запись включают заданные формулы,
условия видимости и проверки значения, фильтр каталога, оформление и доступ
к страницам по роли и точному ID группы. Пропущенные свойства сохраняются.
[Параметры расширенных настроек](https://github.com/BorisType/BorisType/blob/main/packages/mcp-server/README.md#настраиваемые-поля)

Revision нужно получить чтением этой области в том же экземпляре SDK.
Изменение любой области общего документа конфликтует с устаревшей ревизией.
Хранятся до 16 снимков с ограничением 512 KiB UTF-8 на XML реестра и
256 KiB на проекцию области. В объектных документах значения по-прежнему
правятся через `api.objects.patch`.

SDK применяет правки к свежеоткрытому документу и сверяет общий XML ещё раз
перед сохранением. Порядок чтения и записи одного экземпляра SDK
сериализуется. `dryRun` и отсутствие отличий пропускают Save. После записи
SDK проверяет свежее чтение и кэш. Ошибка сохраняет фазу и `writeStatus`;
потеря ответа после отправки считается `unknown` и требует получить
ревизию заново. При `CacheMismatch` нужно сверить общий кэш и сохранённый
документ на стороне HCM. Операция не гарантирует атомарную запись.

## Пакеты объектов

```js
import { randomUUID } from "node:crypto";
import { WshcmApi, WshcmPackageError, packageSchemas } from "@boristype/ws-client";

const api = new WshcmApi(evaluator); // evaluator initialized by caller
const exported = await api.packages.exportPackage({
  objectIds: ["9007199254740993"],
  operationId: randomUUID(),
});
const preview = await api.packages.inspectPackage({ artifactId: exported.artifact.artifactId });
// A target SDK sharing the export directory can inspect { inputPath: exported.file.path }.
const operationId = randomUUID(); // retain before dispatch
try {
  const applied = await api.packages.importPackage({ inspectionId: preview.inspectionId, operationId });
  console.log(applied.status, applied.verification, applied.reportIds);
} catch (error) {
  if (error instanceof WshcmPackageError) console.error(error.details);
  // After a timeout: query getOperation({ operationId }); never automatically retry.
  throw error;
}
```

`packageSchemas` — экспортируемые strict Zod input schemas. Методы используют один
контракт с десятью MCP tools (`wshcm_list_package_schemas`, `wshcm_get_package_schema`,
`wshcm_save_package_schema`, `wshcm_delete_package_schema`, `wshcm_add_package_objects`,
`wshcm_remove_package_objects`, `wshcm_export_package`, `wshcm_inspect_package`,
`wshcm_import_package`, `wshcm_get_package_operation`).

Схемы явно адресуются по id, UI current schema не переключается. `listSchemas({})`
и `getSchema({schemaId})` возвращают общую revision; `saveSchema({name})` создаёт
схему. Для изменения используйте `{schemaId,revision,name?,settings?,editable?}`;
для `addObjects/removeObjects` — `{schemaId,revision,objectIds}`; для удаления —
`deleteSchema({schemaId,revision})`. `editable` — `[{id,editable}]`.
Settings поддерживают `customTemplates`, `processCustomTemplates`,
`processAccessRoles`, `files:[{code,type,url,baseUrl?}]`. После мутации перечитайте
revision. Снимок и recheck общего XML не дают atomic CAS между клиентами.

Для экспорта схемы укажите `{schemaId,revision}`. Для разового архива
передайте `objectIds`, `customTemplates` или оба параметра. Например,
`exportPackage({customTemplates:["request_type"]})` собирает ZIP с определениями
всех настроенных типов заявок. Object IDs всегда десятичные строки.
`includeCategories`, `includeRelatedObjects`,
`includeFiles`, `includeAssessmentItems` выключены по умолчанию. Related использует
только native XMD/foreign связи: `wvars`/`mode` resolvers отсутствуют; полное
транзитивное замыкание не обещается.

Результат экспорта содержит status, проверку `archive_membership`, страницу objects,
missingIds/missingCount и artifact с artifactId/localPath/mimeType/sizeBytes/sha256/expiresAt.
`customTemplateTypes` перечисляет типы, вошедшие в архив. Выбранные типы,
которые HCM пропустил, попадают в `missingCustomTemplates` и дают `partial`
при прямом экспорте и экспорте сохранённой схемы.
Файлы живут на **машине SDK**, в `~/.boristype/package-artifacts`, переживают сеанс;
handle действует 24 часа. Абсолютный каталог можно задать через
`new WshcmPackages(evaluator, { artifactDirectory })` или через третий аргумент
`new WshcmApi(evaluator, runtimeOptions, { artifactDirectory })`.
У служебного снимка свой срок действия handle. Для передачи используйте отдельный ZIP по `file.path`, по умолчанию `~/.boristype/shared/packages/<operationId>.zip`.

```ts
const options = { projectDirectory: "/work/app", sharedDirectory: "/srv/shared" };
const source = new WshcmApi(sourceEvaluator, {}, options);
const target = new WshcmApi(targetEvaluator, {}, options);
const exported = await source.packages.exportPackage({ objectIds: ["9007199254740993"], outputPath: "agents.zip" });
const inspected = await target.packages.inspectPackage({ inputPath: exported.file.path });
```

Те же настройки действуют для XML. В `objects.get` и `objects.getForm` укажите `outputMode: "file"` для временного XML или `outputPath` для конкретного нового файла. `objects.patch` и `objects.save` принимают ровно один из `xml` и `inputPath`. Файловый вход по умолчанию возвращает файловый результат. После редактирования используйте исходный `readToken` в том же экземпляре SDK.

Относительные пути разрешаются при одном корне проекта. `projectDirectory` служит запасным корнем, если `projectRoots` не вернул локальных корней. Подпапки проекта должны существовать. SDK публикует файл только под свободным именем. Для `storage: "shared"` ответ содержит `expiresAt` через 24 часа и предупреждение. Stdio MCP периодически вызывает `cleanExpiredSharedFiles(sharedDirectory)`. При прямом встраивании SDK эту функцию планирует вызывающее приложение. Проектные файлы остаются под управлением проекта.

Inspect создаёт неизменяемую копию ZIP и native preview. `inspectionId` связывает
весь состав; default import выбирает все его объекты, независимо от страниц.
Явные packageIds/objectIds выбирают любое подмножество этого снимка, внешние IDs
отклоняются. Исходный файл после inspect не перечитывается. Binding хранится в
памяти экземпляра; после restart требуется новый inspect, сохранившийся artifactId
можно использовать снова. Конфликты/hash/account/target проверяются перед apply.

Import флаги `skipConflictingIds`, `allowVersionMismatch`, `allowReimport`,
`includeCustomTemplates`, `includeAccessRoles`, `includeFiles`, `includeDeletions`,
`includeLists` по умолчанию false. Поддерживаются objects/courses/web/custom_file;
остальные типы отклоняются до применения. custom_file требует destination ниже
`x-local://custom/`. На Linux C/PostgreSQL проверен импорт объектов и
пакета только с определениями через `includeCustomTemplates: true`.

ZIP ≤128 MiB; expanded bytes ≤512 MiB; ≤10000 entries; ZIP depth ≤2; XML ≤32 MiB;
input objectIds ≤10000; страницы default 100, limit 1–1000; chunk 256 KiB.
SDK не возвращает ZIP/base64 в JSON. MCP дополнительно ограничивает text 256 KiB
и добавляет truncated/nextPage; SDK выдаёт полные разрешённые страницы.

Ошибка `WshcmPackageError.details` сохраняет phase/status/code/message/operationId,
при наличии — lastKnownOperation/cleanupError. Public UUID handles operationId,
artifactId и inspectionId принимаются в любом регистре и приводятся к lowercase
перед lookup/dispatch; результаты используют lowercase. Native schemaId/packageId
сохраняют регистр. Native receipts переживают потерю
клиента и доступны через getOperation на том же target/account; автоматического
retry/rollback/cancellation/exactly-once нет. Отсутствующий, недоступный или
повреждённый receipt даёт ReceiptUnavailable/receipt/unknown с тем же operationId,
без восстановления receipt или повторной мутации. Timeout не останавливает HCM.
`completed` + `platform_report_only` не доказывает per-object success.

Native objects acceptance выполнена на Linux C HCM 2025.2.1333/PostgreSQL;
Windows/MSSQL, максимальные размеры и прикладные зависимости не подтверждены.
[Полный сценарий MCP](https://github.com/BorisType/BorisType/blob/main/packages/mcp-server/README.md#пакеты-объектов).

## Сведения о стенде

```js
const { summary } = await api.systemInfo();
const { report } = await api.systemInfo({ includeReport: true });
```

Один вызов штатного `tools_report.gather_system_info()` собирает тот же отчёт,
что «О программе → Информация о системе» веб-администратора. `summary` содержит
`hcmVersion`, `osVersion`, `database: { type, version }`, `unibridgeVersion`,
`runMode` (строки или `null`) и `cluster`, `fullTextIndex`, `personalData`
(boolean или `null`). Отсутствующие поля и неизвестные значения флагов — `null`.
Сводка извлекается только из заголовка, до первой секции конфигурации.
Типы `SystemInfoSummary` и `SystemInfoResult` экспортируются из пакета.

По умолчанию `report` отсутствует. При `includeReport: true` он содержит исходный
текст без дополнительной очистки, включая конфигурации INI/XML/Global Settings;
это ещё не формализованный JSON конфигураций. CRLF/CR/LF защищены JSON carrier.
Отчёт ограничен 256 KiB UTF-8 и отклоняется целиком при превышении, в том числе
при запросе одной сводки. Неподдерживаемый SOAP carrier даёт ошибку.
Лимит проверяется после сбора отчёта и не ограничивает работу самого сборщика.
DLL не подготавливается, автоматических повторов нет; это сведения ответившего
процесса, без гарантии единого снимка всего кластера.

Проверено на Linux C HCM 2025.2.1333 / PostgreSQL 16; другие версии, локализации
заголовка и ОС требуют проверки. Настройки стенда не изменяются.

## Выполнение BorisScript

```js
const result = await api.execute({
  code: 'print("Checking version"); return tools.get_version("wtv", false);',
});
// { ok: true, value: "2025.2.1333", output: ["Checking version"], outputTruncated: false }
```

Передаётся именно серверный BorisScript, без компиляции TypeScript/JavaScript.
Используйте `return` для результата; переменные и вспомогательные функции можно
объявлять внутри скрипта. `print(value)` добавляет сообщение в вывод этого вызова
и возвращает свой аргумент. Строки сохраняются точно, остальные значения
форматируются штатным `EncodeJson` (`undefined` — текстом `undefined`).
Штатные `alert`/логи вызываемых библиотек остаются в журнале HCM; перехвата нет.

`print(value)` — экспериментальный кандидат: его практическую полезность ещё
предстоит оценить относительно возврата результата и чтения штатных логов.
По результатам оценки он может быть изменён или удалён.

Успех: `{ok:true,value,output,outputTruncated}`. Значение проецируется тем же
кодом, что XQuery: integer → bigint, real → number, XML → records/arrays,
date → ISO string; строки сохраняют CRLF/CR/LF. Поддерживаемые обычные значения
сохраняют null/undefined. Идентичность объектов и XML API не сохраняются.
Неподдерживаемый SOAP carrier даёт ошибку.

При native ошибке возвращается `{ok:false,error:{phase,message},output,outputTruncated}`:
`execution` — разбор/выполнение, `result` — преобразование уже полученного
результата. Сохраняются сообщения, записанные до ошибки, и native контекст
исключения (до 2000 символов). Это не подтверждение отсутствия побочных эффектов.
Transport/невалидный ответ вместо результата выбрасывает экспортируемый
`WshcmExecutionError`: `.details.phase` = `transport`/`response`,
`.details.executionStatus` = `unknown`. Вывод при потерянном ответе не гарантирован.
Невалидный input отклоняется до обращения к evaluator.

Код — до 64 KiB UTF-8; проекция результата — depth 32, 10000 значений и
48000 символов внутреннего carrier. Диагностика сохраняет целые сообщения
до 256 сообщений/16000 символов JSON-кодированного текста, затем выставляет
`outputTruncated: true` и пропускает последующие сообщения, продолжая скрипт.
Итоговый ответ ограничен 256 KiB UTF-8. Лимиты проверяются после формирования
значения/сообщения, не ограничивают работу или память пользовательского кода.

Выполнение не изолировано от серверных API и не ограничено политикой файловых
readToken. DLL не подготавливается. Нет rollback, server cancellation и retry:
**timeout клиента не означает остановку кода**. Перед повтором неизвестного
исхода нужно установить фактические эффекты. Возврат ошибки результата также
не отменяет уже выполненные изменения.

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
не откатывается. Execute/system info/XQuery/XML остаются доступны.

Concurrent ensure одного экземпляра объединяются, последующие вызовы проверяют
процесс снова. Status относится к ответившему процессу; gate и файловая операция
являются разными SOAP вызовами. Балансировка на другой процесс/узел не даёт
гарантии готовности всего кластера. Нет автоматического retry изменения файла
после timeout и автоматического удаления старых DLL.

Расширенный второй аргумент WshcmApi/WshcmRuntime позволяет задать
`bundleDirectory` и безопасное одно имя `installationName` под `dotnetcore/shared`.
Обычной установке эти options не нужны. File API принимает только компонент
BorisType.FileSystem / API 2; общий runtime manager допускает другие компоненты.

Для компонента, который HCM загружает в своём `init()`, вызов
`runtime.stageForStartup()` подготавливает файлы и атомарно выбирает сборку
для следующего старта. При успехе `status === "installed"`, поле `installed`
указывает выбранную сборку, а `loaded` — сборку в контексте отвечающего процесса
(или `null`). Старый клиент сохраняет выбор более новой совместимой версии.
Для загрузки обёртки через WebSoft `GetAssembly` сборку каждого релиза
компилируют с именем `<id>.V<version>` и указывают соответствующую DLL в
`entryAssembly`. Установщик сверяет это имя в метаданных PE. Такой компонент
загружает `init()` владельца, вызов `ensure()` возвращает `blocked / StartupOwnedComponent`.
Готовность HTTP-маршрута проверяется отдельным запросом после запуска HCM.

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
# Existing stand; WSHCM_USERNAME/WSHCM_PASSWORD and optional WSHCM_HOST/PORT
pnpm --filter @boristype/ws-client test:e2e:packages
```

`test:e2e:values` и `test:e2e:xquery` создают и удаляют собственные временные
BS-модули, не меняя бизнес-записи. `test:e2e:packages` также создаёт, импортирует,
обновляет и удаляет собственные cost_center fixtures и схемы пакетов; очищает
свои ZIP, receipts, reports и временные каталоги. Его опциональная guarded
PostgreSQL cleanup удаляет только проверенные собственные catalog projections
и относится к тестам. Это проверка с изменениями данных выбранного стенда.
`test:e2e:values` фиксирует наблюдаемое форматирование real на Linux C 2025.2.1333;
другие runtime требуют своей проверки.
