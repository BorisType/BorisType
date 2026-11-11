# XML object tools: почему XML, как проверяется запись

Принятое решение — [нативный XML](../decisions/2026-11-10-native-xml-object-tools.md).
Три tools получают раскрытую форму, читают полный объект и выполняют явный
create/replace. JSON несёт XML **строкой**, exact decimal ID и metadata.
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

ObjectReadState принадлежит регистрации tools одного createServer: 32 snapshots,
TTL 30 минут, новый полный read меняет token. Snapshot включает весь XML,
actual form URL и раскрытый schema root. Oversized/partial result отклоняется
целиком без grant. Попытка replace, дошедшая до handler после schema validation,
расходует token, включая rejected XML/conflict/transport loss. Не прошедший schema
validation запрос handler не вызывает. Локальная object queue сериализует операции;
это отдельная очередь от file reads, не lock всех HCM writers/чатов.

## Validate → load → bind → Save → readback

[object-xml.ts](../../packages/mcp-server/src/tools/object-xml.ts) использует
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
Full TopElem.Xml не является binary/external-data backup. Object delete/trash/
restore, typed JSON, patch DSL, bulk и business adapters не входят в текущие
три tools; наличие ручной owned trash-пробы не добавляет такие capabilities.
