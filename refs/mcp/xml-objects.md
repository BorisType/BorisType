# XML object tools: почему XML, как проверяется запись

Принятое решение — [нативный XML](../decisions/2026-11-10-native-xml-object-tools.md).
Инструменты получают раскрытую форму, читают полный объект, выполняют явный
create/replace, применяют [частичный XML patch](xml-object-patch.md), читают
реестр и перемещают документы в корзину. JSON несёт
XML **строкой**, exact decimal ID и metadata.
Node проверяет вход, но не строит редактируемую XML→JS→XML модель.
Работа с документом выполняется BS XML API; BorisType DLL не требуется.
[Публичные schemas](../../packages/mcp-server/README.md) задают параметры.

## Выбор среди альтернатив

| Подход                   | Почему выбран либо оставлен за пределами текущей вертикали                                                                                    |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| XML через native XML API | Форма уже раскрывает inheritance, данные сохраняют платформенное представление; небольшой транспорт, но обязательны проверки до Save          |
| Typed patch через BS     | Потребовал бы собственного представления absent/default/arrays/IDs; может появиться по потребности, не заменяет UI business action            |
| Отдельная бизнес-команда | Нужна для конкретных validators, связанных документов и уведомлений; исследуется по типу/конфигурации                                         |
| Direct SQL CRUD          | Не сохраняет автоматически XML/catalog/cache/index/hook согласованность; существующий XQuery/sql passthrough от этого не становится read-only |
| Managed object mapper    | У FileSystem нет доказанного object API; перенос в C# не доказывает lifecycle/claims, Datex callback crash отдельно не объяснён               |
| XMS automation           | Зависит от Screen/view/current-user и интерактивных prompts; требует своего UI-сценария                                                       |

Первоначальная рекомендация typed patch + business adapters заменена XML-first
после уточнения scope. Это изменение дизайна; исторические отрицательные пробы
сохранены в [XML research](../research/mcp/10-object-model/xml-mvp.md).

## Чтение, форма и identity

`get_form` возвращает `XmlForm.TopElem.Xml`: текущий раскрытый root загруженной
формы, а не исходные XMD bytes или автономный installation artifact. `INHERIT`
и составной TYPE раскрываются платформой; USE/dependencies/cache freshness
не обещают полностью standalone re-registration. XMD является SPXML-диалектом;
обычный strict XML parser не заменяет runtime reflection.

`get_object` открывает полный документ по canonical positive decimal string ID
и возвращает actual form URL, root/XML/token. Большие ID никогда не проходят
через JS Number; hex XML identity сравнивается по значению BigInt. Catalog row,
SQL projection и частичное чтение не дают права полной замены. Форма существующего
объекта выбирается самим объектом: payload не переключает DB/form/options.
Create допускает локальный x-local/x-app XMD URL и запрещает XML ID.
Replace ID в XML может отсутствовать либо совпадать с аргументом.

Каждый экземпляр SDK владеет своим ObjectReadState. MCP создаёт один SDK
для всех object tools этого createServer. Хранятся 32 snapshots с TTL 30 минут,
новый полный read меняет token. Snapshot включает весь XML,
actual form URL и раскрытый schema root. Oversized/partial result отклоняется
целиком без grant. Попытка patch, replace или delete, дошедшая до handler после schema validation,
расходует token, включая rejected XML/conflict/transport loss. Не прошедший schema
validation запрос handler не вызывает. Локальная object queue сериализует операции;
это отдельная очередь от file reads, не lock всех HCM writers/чатов.

## Реестр типов и каталогов

На Linux C-runtime 2025.2.1333 `common.exchange_object_types` содержит 414
типов. `DefaultDb.GetRegisteredCatalogs()` возвращает 730 XMD URL. Метод
обнаружен в dispatch базы в `xhttp.out`. `FetchForm` раскрывает имя корня,
`IsHier` и `ObjectName`. На этой сборке `ObjectName` задан у 410
каталогов, у 320 он пуст. Например, `cost_centers.ObjectName` равен
`cost_center`, а у проекции `group_collaborators` он пуст. Результат
отражает эту связь в `objectType`. Свойство `BaseObjectName` было пустым
для всех каталогов, XML раскрытой формы опускал `OBJECT-NAME`.
[Каталоги-связки](https://wshcm-docs.boristype.dev/news/platform/7117695660488129329.html#%D0%BA%D0%B0%D1%82%D0%B0%D0%BB%D0%BE%D0%B3%D0%B8-%D1%81%D0%B2%D1%8F%D0%B7%D0%BA%D0%B8)

На демостенде отсутствовали `cc_*`. Их регистрация в
`common.exchange_object_types` найдена в поставляемом `wtv_tools.xml`,
обработка проверена локальной моделью. `supportsCustomFields` отражает
наличие `custom_elems` в форме на момент запроса.

Настроенные поля берутся из `custom_templates`. В поставляемом
`wtv_tools.xml` метод `get_custom_template` читает общие `fields` и
по контексту выбирает запись из `items` или переходит через
`template_field`. Инструмент определений в режиме `list` читает страницу
зарегистрированных строк `items`, включая пустые и строки только со страницами.
Выбранная строка адресуется через `scope.objectType = templateType` и
`scope.templateId = templates[].templateId`. Режим поиска сверяет кэш и
хранилище на отвечающем узле. Чтение `scope` получает полный снимок для
ревизии. Порядок страниц следует реестру на момент каждого вызова.
На стенде у `subdivision` есть общее поле `is_department`, а у
`request` — 16 шаблонов типа `request_type` с полями. На C-runtime
`template_field_id` читается напрямую как свойство, `ChildExists`
его не обнаруживает. [Datex get_custom_template](https://wshcm-docs.boristype.dev/news/monolith/6680799737529721815.html#get-custom-template)

На HCM 2025.2.1333 нативный CLI/stdio тест создал шаблон типа заявки с
одной страницей и без полей. Список для `request` вернул его точный ID
и `pageCount: 1`. Проверены отдельная страница списка по `offset/limit`,
поиск по типу владельца и `CacheMismatch` при расхождении с хранилищем.
Чтение области по возвращённым типу и ID показало ту же страницу.
После очистки реестр восстановлен побайтно.
[Проверка через CLI](../../packages/mcp-server/test/e2e/custom-fields.mjs)

В той же поставке `interval_schedule.presence_state_id` указывает на
раздел `presence_state_interval_schedule`. Его `item.id` ссылается
через `FOREIGN-ARRAY` на каталог `presence_states`, а документ
владельца имеет корень `presence_state`. При разных именах код проверяет
ID и тип через `OptForeignElem` на отдельном элементе формы, сохраняя
проверку существующего документа. Декларация `OptForeignElem` есть в
`lib/xmlelem/index.d.ts` на ревизии `1d76d40c87ad6a9c249bd16f1bfea035dd815940`
репозитория `wshcmx/types`. Нативный тест проверил чтение, `dryRun` и
отказ для ID типа заявки в этой области.
[Datex OptForeignElem](https://wshcm-docs.boristype.dev/news/monolith/6934960024317591784.html#optforeignelem)

[Исследование настраиваемых полей](../research/mcp/custom-field-templates.md)
разбирает общий документ, привязку формы заявки к конкретному `request_type`
и нативный путь сохранения с обновлением общего кэша.

## Перемещение в корзину

Delete повторно открывает документ и сравнивает точный ID, форму, полный XML
и раскрытую схему. Затем вызывает `DeleteDoc(url, false)`. Сравнение и
удаление выполняются последовательно. Успешный ответ означает возврат из
нативного вызова. При потере ответа SDK сохраняет `deleteStatus: "unknown"`.

На Linux C-runtime 2025.2.1333 после MCP-вызова собственный `cost_center`
исчез из основного каталога и открывался из корзины. Тест подтвердил, что
токен уже израсходован, восстановил fixture для очистки и удалил его. Проверка
связанных данных и binary cleanup требует прикладного сценария.
[Native e2e](../../packages/mcp-server/test/e2e/objects.mjs)

## Validate → load → bind → Save → readback

[object-xml.ts](../../packages/ws-client/src/hcm/object-xml.ts) использует
строгий saxes: XML 1.0, один root, корректные Unicode/entities, без DTD/entity
definitions, произвольных PI и атрибутов данных. Разрешены XML declaration,
CDATA, standard/numeric entities, совпадающий SPXML-FORM. Node собирает bounded
validation paths, scalar text и integer validity, сохраняя исходный XML.
Сервер сверяет root, identity field, known paths, singleton cardinality,
scalar/structure shape, отсутствие методов и integer lexical/range с XmlForm.
Decimal/hex допускают signed int64 и unsigned XML representation до uint64 max.
Остальные scalar conversions остаются native; это **частичная валидация**.

Лимиты: object XML и schema XML каждый 256 KiB UTF-8, глубина input 64,
8192 элементов, внутренний request 2 MiB. BS делает предварительный character
bound; Node независимо проверяет UTF-8 bytes. Это не лимит работы provider-а
или стоимости загрузки формы.

Create: `OpenNewDoc → TopElem.LoadData(original XML) → BindToDb → Save`.
LoadData merge в **новый** документ сохраняет defaults/OnCreate; это не patch
существующего объекта. Replace: `OpenDocFromStr(original XML,actual form) →
BindToDb(existingId) → Save`; пропущенные данные удаляются либо получают defaults.
Отсутствующий объект не превращается в create. XML объекта, form URL и schema
сравниваются с snapshot перед загрузкой и повторно непосредственно перед Save.
Два независимых `OpenDoc/Save` воспроизводили lost update; повторная проверка
уменьшает stale overwrite, но **не является atomic CAS**.

Patch применяет указанные поля к существующему открытому документу через
нативный helper SDK. Новый XML grant расходуется также при preview и no-op.
Для этих результатов повторная проверка выполняется перед ответом.
[Режимы, типы, changed и native evidence](xml-object-patch.md).

Почему нельзя довериться parser/readback: native OpenDocFromStr принимал чужой
root, unknown tag, два root, duplicate scalar, NaN integer и unknown entity;
wrong-root replace реально очищал собственный DB объект. `XMLValidator` тоже
пропускал часть этих входов. Readback обнаружит потерю после commit слишком поздно.
Прямое integer assignment могло бросить, когда XML import тихо применял default;
эти пути нельзя считать одной проверкой. Сокращённая форма также стирала скрытые
массивы/поля. [Датированные native negatives](../research/mcp/10-object-model/native-evidence.md).

## Что означает результат и ошибка

Save response даёт known ID, actual form/root/XML после readback и `saved`.
Ошибка сохраняет phase, known ID и writeStatus `not_attempted|unknown|saved`.
`not_attempted` относится к вызову Save: form loading/init уже могли исполнить
код. Вход в Save помечается unknown; успешный возврат — saved, даже если readback
или его output limit затем дали error. Transport loss оставляет unknown, если
нет признанного acknowledgement; текст исключения сам по себе не доказывает
rollback. Автоматического retry нет. ID/correlation помогают reconciliation,
но не дают exactly-once или компенсации уведомлений.

Generic form/read не гарантированно без побочных эффектов; XMD содержит код,
а SaveEvent(doc,false) в исследованных исходниках уже создавал связанные данные.
Не выключать callbacks по предположению «валидация чистая». NOT-NULL,
PRIMARY-KEY и FOREIGN-ARRAY не являются полными business validators.
Authentication/evaluator и HasWriteAccess не доказывают UI field/object claims.
[Object model/lifecycle](../platform/object-model.md) связывает эти уровни.

## Evidence и незакрытые границы

[Первый product checkpoint](../research/mcp/10-object-model/first-implementation.md)
фиксирует 218 local tests и 8 native tests на cost_center, Linux HCM
2025.2.1333/CLR 9.0.11/PostgreSQL legacy model. Исторические 59/59 и 53/53
verifiers проверяют **recorded observations**, не дают новой acceptance текущей
ревизии. Sources/manifests/transcripts/cleanup сохранены комплектом в
[research entry](../research/mcp/10-object-model/README.md).

Не аттестованы другие lifecycle/types, UI/low-privilege authorization, foreign/
uniqueness, external CAS/transactions, Windows/MSSQL/new model/cluster cache.
Full TopElem.Xml экспортирует поля; binary/external-data требуют своего backup.
Object delete/trash/restore, typed JSON, bulk и business adapters остаются
за пределами публичных object tools.

## Локальный файл и readToken

В файловом режиме SDK сохраняет полный проверенный XML документа и формы в `ObjectReadState`. Токен выдаётся после публикации пользовательской копии. Локальный путь не уходит на HCM. При записи SDK читает ограниченный UTF-8 файл и применяет ту же проверку снимка и native операцию, что при inline XML. Путь назначения проверяется до dispatch. После подтверждения Save ошибка локальной публикации сохраняет `id` и `writeStatus: "saved"`. MCP-тест проверяет это на конкурентном занятии выходного имени, а также проверяет replace после редактирования файла и конфликт с внешней правкой. [Общие пути ZIP и XML](./object-packages.md)
