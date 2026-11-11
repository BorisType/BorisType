> Датированное техническое evidence; текущие основания — [тематическая запись](../../../platform/object-model.md).
> Ниже закреплённые declarations и первоначальные кандидаты проверок, не текущий tool contract. Часть пунктов 1–6 проверена последующими native probes; полнота API, new model, права/transactions не установлены.

# Объектная модель: сверка с `wshcmx/types`

Дата сверки: 2026-11-08. Источник: [wshcmx/types](https://github.com/wshcmx/types),
revision **`a3b1e43d0b2add53bbc1f2acc2c5128360e8c97b`** от 2026-10-30,
package `@wshcmx/types` **14.1.0**. Локальная копия: `/tmp/bt-wshcm-types`;
`git fetch --depth=1 origin HEAD` подтвердил, что fetched HEAD совпадает с этой ревизией.
Все ссылки ниже закреплены за revision. Версия пакета типов не устанавливает
точную версию установленного WebSoft HCM: [VERSIONING.md](https://github.com/wshcmx/types/blob/a3b1e43d0b2add53bbc1f2acc2c5128360e8c97b/VERSIONING.md)
описывает major как обновление коробки **либо** глобальное изменение типов.

Это **свидетельство деклараций**, включая комментарии к ним. Ни сигнатуры, ни
комментарии не считаются доказательством поведения C-runtime. Предупреждение
пользователя об ошибках Datex в равной мере требует проверки этого дополнительного
источника. В рамках этой сверки не выполнялись запросы документации MCP, запуск
стенда, native-пробы или операции с объектами. Результаты других исследовательских
файлов нужно сопоставлять с этим файлом, сохраняя происхождение каждого вывода.

Последующая [C-runtime проверка](native-evidence.md) подтвердила часть API и
выявила недоступность `GetOptObjectForm`, `SetXml`, `WriteFt`, `IsSeparated`
на данном legacy-стенде. Таблицы ниже намеренно сохраняют исходные заявления
declarations, чтобы отличия не потерялись.

## 1. Четыре разных слоя объектов

| Объект                    | Что заявляет источник                                                                                       | Значение для исследования CRUD                                                                                            |
| ------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `XmlDocument`             | Открытый документ: `TopElem`, `Form`, `FormUrl`, `Url`, идентификаторы, сохранение и флаги жизненного цикла | Операция сохранения принадлежит документу; корневой элемент и строка XML не заменяют документ                             |
| `XmlElem<T, ForeignElem>` | Экземпляр данных с `Value`, типом, ссылкой на `FormElem`, путём, дочерними элементами и foreign resolution  | Значение поля и поле как платформенный объект различаются                                                                 |
| `XmlForm`                 | Загруженная форма: `TopElem`, `OptTopElem`, `Url`, `Xml`, `IsHier`, `Title`, `ImageUrl`                     | Кандидат для обнаружения схемы; `Xml` назван «каноническим», следовательно не обещает побайтовое сохранение исходного XMD |
| `XmlFormElem`             | Элемент схемы: имя, тип, кратность, default, выражения, метаданные, дочерние элементы и методы              | Может быть методом, а не полем; обход формы должен это учитывать                                                          |

Источники: [xmldocument](https://github.com/wshcmx/types/blob/a3b1e43d0b2add53bbc1f2acc2c5128360e8c97b/lib/xmldocument/index.d.ts),
[xmlelem](https://github.com/wshcmx/types/blob/a3b1e43d0b2add53bbc1f2acc2c5128360e8c97b/lib/xmlelem/index.d.ts),
[xmlform](https://github.com/wshcmx/types/blob/a3b1e43d0b2add53bbc1f2acc2c5128360e8c97b/lib/xmlform/index.d.ts),
[xmlformelem](https://github.com/wshcmx/types/blob/a3b1e43d0b2add53bbc1f2acc2c5128360e8c97b/lib/xmlformelem/index.d.ts).

`XmlElem<T, ForeignElem> = XmElem<T, ForeignElem> & T` — приём TypeScript для
IntelliSense. Он не утверждает, что C-runtime является JS, что объект можно
безопасно перечислять через `Object.keys`, или что значение копируется обычным
JS-присваиванием. Комментарий к `Value: T` отдельно заявляет неявное чтение значения
(`elem` и `elem.Value`) и необходимость явного `.Value` при записи в результат
вызова, например `AddChild().Value = ...`.

## 2. Обнаружение каталогов и форм

Следующие **точные декларации** дают кандидатов для проверки. Generic `T` в
`Database` позволяет вызывающему самому выбрать возвращаемый тип и потому почти
ничего не доказывает о фактической форме результата.

| Область                                   | Декларации                                                                                                                                      |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| База                                      | `FetchDb(name: string): Database`; глобальная `DefaultDb: Database`                                                                             |
| Каталог по известному имени               | `FindOptCatalog(catalogName: string): Object`; `DefaultDb.GetOptCatalog<T>(catalogName: string): T`                                             |
| Зарегистрированная форма объекта          | `DefaultDb.GetObjectForm<T>(objectName: string): T`; `GetOptObjectForm<T>(objectName: string): T`; `GetObjectFormUrl<T>(objectName: string): T` |
| Возможная коллекция форм                  | `DefaultDb.ObjectForms: unknown[]`                                                                                                              |
| Форма объекта / каталога через библиотеку | `tools.get_object_form_url(catalogName: string, isCatalog: boolean): string`                                                                    |
| Загруженная форма                         | `FetchForm(formUrl: string): undefined`; `GetOptCachedForm(url: string): XmlForm`                                                               |
| Преобразование имени                      | `CatalogNameToObjectName(catalogName: string): string`                                                                                          |

Источник [Database](https://github.com/wshcmx/types/blob/a3b1e43d0b2add53bbc1f2acc2c5128360e8c97b/lib/database/index.d.ts#L5),
[core: формы](https://github.com/wshcmx/types/blob/a3b1e43d0b2add53bbc1f2acc2c5128360e8c97b/lib/core/index.d.ts#L2475),
[core: каталог/база](https://github.com/wshcmx/types/blob/a3b1e43d0b2add53bbc1f2acc2c5128360e8c97b/lib/core/index.d.ts#L2622),
[tools.get_object_form_url](https://github.com/wshcmx/types/blob/a3b1e43d0b2add53bbc1f2acc2c5128360e8c97b/lib/tools/index.d.ts#L3485).

Комментарии утверждают: `FindOptCatalog` ищет во всех используемых базах и
возвращает `undefined`, если не нашёл; `GetOptObjectForm` возвращает `undefined`,
если тип не зарегистрирован; `GetObjectForm` возвращает `XmlForm`; `FetchForm`
повторно использует кэш. Эти утверждения расходятся с частью типов в таблице.
`tools.get_object_form_url` принимает **единственное** число (`cost_center`,
не `cost_centers`), `isCatalog=true` выбирает форму каталога, `false` — объекта;
комментарий обещает URL с `x-local:`. Нельзя выводить остальные имена каталогов
удалением последней `s`: `CatalogNameToObjectName` описан как английское склонение,
а произвольные зарегистрированные имена и custom-типы требуют отдельной проверки.

Есть прикладной список
[`common.exchange_object_types: XmlMultiElem<CommonExchangeObjectType>`](https://github.com/wshcmx/types/blob/a3b1e43d0b2add53bbc1f2acc2c5128360e8c97b/lib/xml/common/index.d.ts#L1535).
Его [элемент](https://github.com/wshcmx/types/blob/a3b1e43d0b2add53bbc1f2acc2c5128360e8c97b/lib/xml/common/index.d.ts#L133)
имеет `name`, `disp_name`, `title`, `web_title`, `web_template`, `web_const`,
`is_hier`, `is_custom`, `form_url`, `form_type`, `max_records_num`, `ft_index`.
Объявление такого списка не доказывает, что это полный live-реестр базы или что
каждый элемент доступен текущему субъекту. Аналогично
[`global_catalogs`](https://github.com/wshcmx/types/blob/a3b1e43d0b2add53bbc1f2acc2c5128360e8c97b/lib/global_catalogs/index.d.ts)
— статические экспорты известных каталожных типов, а не native API перечисления.
`doc_types` описывает настраиваемые типы документов; это ещё один отдельный слой.

### Регистрация — отдельная операция, не необходимая для чтения схемы

| API                          | Точная декларация / заявление комментария                                                                                                                                             |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Новая модель `Database`      | `RegisterObjectType(urlScheme: string, object: Object): void`; `RegisterCatalog(urlScheme: string): never \| undefined` — без структуры параметра `object`                            |
| Динамический XMD             | `RegisterFormFromStr(formUrl: string, formData: string): XmlForm`                                                                                                                     |
| Нерегистрируемая форма       | `CreateFormFromStr(formStr: string): unknown` — комментарий называет результат `XmlForm`                                                                                              |
| Фрагмент формы               | `RegisterSubForm(formUrl: string, formPath: string): string`                                                                                                                          |
| Legacy                       | `RegisterCatalog(catalogUrl: string, formUrl: string): undefined`; `RegisterCatalogSubForm(formUrl: string): string` помечены deprecated и «не используются в новой объектной модели» |
| Настраиваемый тип            | `tools.register_doc_type(docTypeDocument: DocTypeDocument, documentId: number): object`, плюс overload с `XmlDocument` и результатом `Object`                                         |
| Каталожные формы custom-типа | `tools.register_doc_types_catalog(object: RegisterDocTypeCatalog[], serverCheck: boolean): void`, плюс overload `(unknown[], boolean): boolean`                                       |

`RegisterDocTypeCatalog` содержит `catalog`, `catalog_form_url`,
`catalog_form_hash` (все `string`). Комментарии `register_doc_type` обещают
генерацию/регистрацию объектной и каталожной XMD, возвращаемые `success`,
`object_form_url`, `catalog_form_url`, `catalog_form_hash`, `catalog`;
`register_doc_types_catalog` описан как сравнение хешей/регистрация изменившихся
форм. Это прикладные методы, а не доказанный универсальный способ регистрации.
Источники: [core](https://github.com/wshcmx/types/blob/a3b1e43d0b2add53bbc1f2acc2c5128360e8c97b/lib/core/index.d.ts#L2484),
[legacy core](https://github.com/wshcmx/types/blob/a3b1e43d0b2add53bbc1f2acc2c5128360e8c97b/lib/core/index.d.ts#L4698),
[tools: тип параметра](https://github.com/wshcmx/types/blob/a3b1e43d0b2add53bbc1f2acc2c5128360e8c97b/lib/tools/index.d.ts#L3885),
[tools: регистрация](https://github.com/wshcmx/types/blob/a3b1e43d0b2add53bbc1f2acc2c5128360e8c97b/lib/tools/index.d.ts#L5735).

`SPXMLUnibridgeProvider` отдельно декларирует `RegisterObjectType`,
`RegisterCatalog`, `UpgradeCatalog`, `ReInitObjectTypeWithNewSchema`,
`UpdateMetaInformationIfModified`, `CheckObjectTypeIsModified`, `SyncCatalog` и
методы перестроения. [Источник](https://github.com/wshcmx/types/blob/a3b1e43d0b2add53bbc1f2acc2c5128360e8c97b/lib/spxml_unibridge_provider/index.d.ts#L1).
Эти сигнатуры показывают наличие отдельного provider-слоя, но не устанавливают
доступность класса в целевом C-runtime, аргументы native `Database` или нужность
низкоуровневой регистрации для MCP. Не следует приравнивать одинаковые имена
методов разных объектов.

## 3. Открытие, создание, привязка, сохранение и удаление

| API                 | Точная декларация                                                                       |
| ------------------- | --------------------------------------------------------------------------------------- |
| Открытие            | `OpenDoc<T = XmlDocument>(url: string, options?: string): T`                            |
| Чтение через кэш    | `FetchDoc(url: string, options?: XMLOpenOptions): XmlDocument`                          |
| Из строки           | `OpenDocFromStr<T extends XmlDocument>(dataStr: string, options?: XMLOpenOptions): T`   |
| Новый по XMD        | `OpenNewDoc<T = XmlDocument>(formUrl: string): T`                                       |
| Открытие объектного | `DefaultDb.OpenObjectDoc<T extends XmlDocument>(catalogName: string, id: number): T`    |
| Создание объектного | `DefaultDb.OpenNewObjectDoc<T extends XmlDocument>(objectName: string): T`              |
| Legacy-привязка     | `doc.BindToDb(database?: string \| typeof DefaultDb, docId?: number): undefined`        |
| Привязка к типу     | `doc.BindToDbObjectType(dbName: string, objectType: string): void`                      |
| Сохранение          | `doc.Save(documentUrl?: string): undefined`                                             |
| Удаление URL        | `DeleteDoc(url: string, permanent?: boolean): undefined`                                |
| Удаление через базу | `DefaultDb.DeleteObjectDoc(objectName: string, objectId: number, bool?: boolean): void` |
| Перемещение         | `MoveDoc(url: string, newUrl: string): undefined`                                       |

Источники: [core: XML](https://github.com/wshcmx/types/blob/a3b1e43d0b2add53bbc1f2acc2c5128360e8c97b/lib/core/index.d.ts#L2711),
[XmlDocument.BindToDb](https://github.com/wshcmx/types/blob/a3b1e43d0b2add53bbc1f2acc2c5128360e8c97b/lib/xmldocument/index.d.ts#L187),
[XmlDocument.Save](https://github.com/wshcmx/types/blob/a3b1e43d0b2add53bbc1f2acc2c5128360e8c97b/lib/xmldocument/index.d.ts#L289),
[Database](https://github.com/wshcmx/types/blob/a3b1e43d0b2add53bbc1f2acc2c5128360e8c97b/lib/database/index.d.ts#L17).

Заявления комментариев:

- `OpenNewDoc` создаёт документ по форме. `BindToDb` присваивает ID и URL и
  помечен deprecated; предлагается `OpenNewObjectDoc` или `BindToDbObjectType`.
  Нельзя из этого выводить, что привязка уже сохраняет объект.
- `Save()` сохраняет по текущему URL; `Save(url)` сначала устанавливает URL.
  Возвращаемое `undefined` не является отчётом о результате: ошибки, rollback и
  частичные побочные эффекты эти декларации не описывают.
- `FetchDoc` помещает документ в кэш и возвращает уже кэшированный, если он есть.
  Для `OpenDoc` такого обещания в комментарии нет; это не доказательство отсутствия
  любого внутреннего кэширования.
- `DeleteDoc(..., permanent)` описывает `permanent=false` по умолчанию и удаление
  «мимо корзины» при `true`. Неименованный `bool` в `DeleteObjectDoc` нельзя
  автоматически считать тем же флагом. Cascade, foreign integrity, delete hooks и
  идемпотентность не установлены.
- `MoveDoc` заявлен как пересохранение по новому URL, затем удаление старого с
  выполнением `OnSave`, `OnBeforeSave` и т.п. Это не обещание атомарного rename.
- `tools.open_doc<T extends XmlDocument = XmlDocument>(documentId: number): T \| undefined`
  имеет второй overload `(iDocID: number): XmlDocument`, хотя комментарии обоих
  заявляют `undefined` при ошибке. Обёртка скрывает различие «не найдено»/других
  ошибок; её контракт следует проверять отдельно от `OpenDoc`.

### URL и идентификаторы

`DocID: number` заявлен как вычисляемый из URL ID только объектного документа;
для обычного XML обещана ошибка. `ObjectID: number` объявлен доступным на чтение и
запись, при этом комментарий **явно обещает числовые и строковые ID**. `Url: string`
доступен на запись, а отсутствие URL представлено пустой строкой. Это не даёт
оснований заменять URL или `ObjectID` прямой записью поля `TopElem.id`.

Декларации `ObjectDocUrl(dbName: string, objectType: string, objectID: string | number): string`,
`ObjectNameFromUrl(url: string): string`, `ObjectIDFromUrl(url: string): number`
находятся в [core](https://github.com/wshcmx/types/blob/a3b1e43d0b2add53bbc1f2acc2c5128360e8c97b/lib/core/index.d.ts#L2847).
Примеры показывают URL `x-db-obj://data/person/0x000000000012E5BD.xml` и строковый
`x-db-obj://data/event_type/interview.xml`. Комментарий к `ObjectIDFromUrl` не
разрешает противоречие со строковыми ID. `XmlElem.ObjectUrl` описан для каталожных
записей и корней объектных документов; `PrimaryObjectUrl` учитывает наследование.

Для JSON объявлен `EncodeJson<T>(value: T, options?: EncodeJsonOptions): string`,
где `ExportLargeIntegersAsStrings: boolean` обещает экспорт целых
**больше `0x7FFFFFFF`** строкой, `PrettyFormat: boolean` — форматирование.
[Источник](https://github.com/wshcmx/types/blob/a3b1e43d0b2add53bbc1f2acc2c5128360e8c97b/lib/core/index.d.ts#L3881).
Это полезный кандидат native-проверки сохранности ID, а не готовая гарантия
безопасного round-trip всех идентификаторов через JavaScript `number`.

## 4. Метаданные схемы и проверка полей

`XmlFormElem` объявляет `Name`, `Type`, `SubType`, `Title`, `DefaultValue`,
`Expr`, `ExprInit`, `IsMultiple`, `IsMethod`, `IsNotNull`, `IsTemp`, `IsHidden`,
`IsIndexed`, `NullFalse`, `ForeignArrayExpr`, `PrimaryKeyName`, `ResultDataType`,
`SourceDesc`, `Xml`, `AttrNames`. `SubType` ограничен
`"html" | "binary" | "code" | "url" | ""`; `DefaultValue` — **строка**, не готовое
типизированное default-значение. `AttrNames` назван списком **кастомных** атрибутов,
поэтому не обещает полный список XMD-атрибутов. `ForeignArrayExpr` восстанавливается
из разобранного выражения: возможна потеря пробелов и комментариев.

Для обхода объявлены `Child(name: string | number): XmlFormElem | never`,
`OptChild(name: string): XmlFormElem | undefined`, `ChildExists(name: string): boolean`,
`PathExists(path: string): boolean`, `EvalOptPath(path: string): XmlFormElem | never`,
`EvalPath<T = XmlElem<unknown>>(path: string): T`.
Последние две сигнатуры подозрительны: optional-поиск в комментарии возвращает
`undefined`, а поиск по **форме** по умолчанию типизирован как элемент **данных**.
`ChildNum` и числовой index signature отсутствуют в `XmlFormElem` этой ревизии;
это пробел в декларации, а не доказательство отсутствия обхода в native.

Доступ к дополнительным атрибутам: `GetOptAttr(name: string): unknown | undefined`,
`GetOptBoolAttr(name: string): boolean | undefined`,
`GetOptUiAttr(name: string): boolean | undefined`,
`GetOptUrlAttr(name: string): boolean | undefined`.
Последние два типа расходятся с комментариями, обещающими строку / URL.
`GetBoolAttr(): boolean` вообще не содержит параметра имени.

**Что не установлено декларациями:** автоматическая проверка `NOT-NULL` при
программном присваивании или `Save`, допустимый набор `Type`, coercion строк в
integer/date/bool, ограничения длины, uniqueness, проверка существования foreign
ID, порядок стандартной валидации и hooks, режим получения всех ошибок сразу.
В просмотренных `XmlDocument`, `XmlElem`, `XmlForm`, `XmlFormElem`, `Database`
не найден универсальный `Validate/Check` с контрактом для документа; отсутствие
объявления не доказывает отсутствия API. Прикладные `tools.check_event_fields`,
`ms_tools.check_std`, `DocTypeDocument.OnBeforeSave` подтверждают лишь то, что
проверки могут быть специфичны для типов.

Для future schema-read разумно возвращать происхождение метаданных и не
называть `IsNotNull` уже доказанной серверной валидацией. Поддержку обязательности,
границ, defaults и coercion необходимо установить на native-пробах.

## 5. Значения, defaults, массивы и foreign-ссылки

### Значения и очистка

Согласно [XmlElem](https://github.com/wshcmx/types/blob/a3b1e43d0b2add53bbc1f2acc2c5128360e8c97b/lib/xmlelem/index.d.ts#L110):
`HasValue` предназначен для разных типов: пустая строка для незаполненного string,
`null` для незаполненного integer. Это не устанавливает поведение `false`, `0`,
variant, default и обязательности.

`Clear(): void` по комментарию очищает элемент и потомков, устанавливает defaults,
string делает пустой строкой, другие основные типы — `null`, удаляет `MULTIPLE`.
Поэтому операция «clear» не обязана давать пустое или `null` значение.
`AssignElem<K = XmlElem<unknown>>(element: K): void` заявлен как рекурсивное копирование
совпадающих имён и синхронизация кратности `MULTIPLE`, причём при разных формах
копируются только совпадающие поля. `AssignExtraElem<K>(element: K): void` копирует
только незаполненные поля; `EqualToElem<K>(element: K): boolean` сравнивает по тем
же совпадающим полям, а массивы — с учётом количества **и порядка**.
Эти методы не являются доказанным точным merge/patch произвольного JSON.

### Две формы коллекций

[`XmlMultiElem<T>`](https://github.com/wshcmx/types/blob/a3b1e43d0b2add53bbc1f2acc2c5128360e8c97b/lib/xmlmultielem/index.d.ts)
определён как `XmMultiElem<T> & T`; интерфейс даёт `[index: number]: XmlElem<T>`,
`ChildNum: number`, `Add(name?: string, type?: string): XmlElem<T>`,
`GetByKey<K>(value: K, name?: string): XmlElem<T>`,
`ObtainByKey<K>(value: K, name?: string): XmlElem<T>`,
`ObtainByKeySorted<K>(value: K, name: string): XmlElem<T>`,
`ObtainByValue<K>(value: K): XmlElem<T>`.

[`XmlMultiElemObject<T, F>`](https://github.com/wshcmx/types/blob/a3b1e43d0b2add53bbc1f2acc2c5128360e8c97b/lib/xmlmultielemobject/index.d.ts)
имеет отдельную декларацию с `ForeignArray: F[]`, `Instances: F[]`,
`HasValue`, `IsMultiElem: true`, `Clear`, `DeleteByValue<T>(value: T)` и
методами добавления/поиска. В `XmlMultiElem` `DeleteByValue(): void | never`
**теряет аргумент value**. `Instances` обеих коллекций также нельзя без проверки
приравнивать к массиву scalar `.Value` или к foreign-объектам.

Для элементов данных есть `AddChild(name?: string, type?: string): XmlElem<T>`,
`InsertChild(index: number, name?: string, type?: string): XmlElem<unknown>`,
`Delete(): void`, `SetChildIndex(newPositionIndex: number): void`,
`GetChildByKey<K, T extends XmlElem<unknown> = XmlElem<unknown>>(value: K, name?: string): XmlElem<T>`,
`GetOptChildByKey` с теми же параметрами и `| undefined`,
`ObtainChildByKey<K>(value: K, name?: string): XmlElem<T>`.
Комментарии: у статического элемента `AddChild` допустим для простого массива;
динамический элемент принимает имя/тип; `Delete` и перестановка допустимы для
`MULTIPLE` или динамического элемента. Результаты поиска, удаления нескольких
совпадений, повторяющиеся ключи и наследование primary key требуют проверки.

### Foreign не равен вложенному объекту

В `XmlElem` объявлены `ForeignArray: unknown[]`, `ForeignArrayCodeStr: string`,
`ForeignElem: ForeignElem | never`, `OptForeignElem: ForeignElem | undefined`,
`ForeignObjectUrl: string`, `ForeignPrimaryObjectUrl: string`,
`ForeignDispName: string`. По комментариям:

- `ForeignArray` **вычисляет выражение** `FOREIGN-ARRAY`; без атрибута — ошибка.
- `ForeignElem` ищет запись и выдаёт ошибку при отсутствии; `OptForeignElem`
  возвращает `undefined`. Возвращаемое — элемент целевого массива, не обязательно
  полный `XmlDocument` или полный объектный корень.
- `ForeignObjectUrl` в новой модели строит URL из имени каталога/ссылки **без поиска**
  целевого элемента; наличие URL поэтому не доказывает существования объекта.
- `ForeignPrimaryObjectUrl` / `PrimaryObjectUrl` учитывают наследуемый тип, что может
  потребовать дополнительного поиска. `ForeignDispName` для `MULTIPLE` объединяет
  отображаемые имена через запятую.

Следствие для будущего чтения: автоматический рекурсивный обход `ForeignElem`
может выполнять вычисления и запросы, раскрывать дополнительные данные и образовать
циклы. Нужна явная политика dereference, предел глубины и сохранение raw ID; это
вывод о дизайне, а не установленный runtime-контракт.

## 6. XML/JSON: разные операции чтения и замены

[`XMLOpenOptions = string`](https://github.com/wshcmx/types/blob/a3b1e43d0b2add53bbc1f2acc2c5128360e8c97b/lib/core/index.d.ts#L2711)
описан как `param1='value1';param2='value2';...`:
`form` переопределяет форму из документа; `ignore-top-elem-name` разрешает общую
форму с другим корнем; `drop-namespaces` удаляет префиксы; `ui-text` выбирает язык
интерфейса; `format` включает конвертер. Комментарий перечисляет `sv`, `win.ini`,
`excel`, `smml`, но далее описывает `delim`, `header-line`, `lower-case-names` для
`csv`. Это внутренняя неоднозначность, не полный перечень поддерживаемых options.
`Separated` упоминается в `XmlDocument.IsSeparated`, но в этой таблице options
отсутствует; написание и синтаксис должны быть подтверждены отдельно.

| Операция            | Объявление и заявленная граница                                                                                                                                                |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Полный XML элемента | `Xml: string`; `GetXml(options?: Object): string`; `GetXml(options?: string): string`                                                                                          |
| Внутренний XML      | `GetInnerXml(options?: string): string`                                                                                                                                        |
| Только XML-значение | `XmlValue: string`: escaping string, bool `0/1`, XML-формат даты                                                                                                               |
| Дополнение из XML   | `LoadData(data: string): void`; `LoadDataFromUrl(url: string): void`: подгружают только присутствующие данные, для синхронизации комментарий требует предварительный `Clear()` |
| Замена из XML       | `SetXml(xml: string): void`: очищает и загружает, имя корня должно совпадать                                                                                                   |
| Экспорт документа   | `SaveToUrl(destUrl: string, options?: string): void`; `SaveToStream(destStream: Stream, options?: string): void`                                                               |

Комментарий `GetXml` описывает `inline-ext-objects`, `tabs`, `DocHeader`,
`ForceDecimal`; последний переключает числа больше `2^32` из hex в десятичный вид.
`GetInnerXml` описывает те же options без `DocHeader`, но signature принимает
лишь `string`, хотя prose допускает базовый объект. `XMLExportOptions = string`
для `SaveToUrl/SaveToStream` перечисляет только `inline-ext-objects` и `tabs`.
Нельзя автоматически считать наборы и синтаксис options одинаковыми.

`SaveToUrl` обещает экспорт без изменения текущего URL документа; `Save(url)`
меняет его. `WriteAllNodes=false` по умолчанию исключает незаполненные поля при
сохранении, `true` включает все поля; `WriteMaskLineBreaks=true` маскирует переводы
строк. Декларации не устанавливают точный XML bytes, encoding, устойчивый порядок,
правила включения `TEMP`/computed/secondary, наличие BLOB при обычном экспорте и
полноту round-trip. Опция `inline-ext-objects` особенно важна для файлов внешнего
хранения; её отсутствие нельзя считать полным backup документа.

`tools.object_to_text<T>(arg: T, formatType: "json" | "xml", maxDepth?: number, name?: string): string`
имеет комментарий о default `formatType=xml`, глубине `0` и ограничении «не больше
5», но второй параметр в signature обязательный. Ещё один overload возвращает
`unknown` и теряет `name`. Это прикладной сериализатор, не гарантия полного
представления `XmlDocument`. `ParseJson<T>(value: string, options?: ParseJsonOptions): T`
с `StrictMode: boolean` по комментарию **по умолчанию допускает JS literals**,
разные кавычки и `undefined`: нельзя считать default-вызов строгой проверкой JSON.
Источники: [XML методы](https://github.com/wshcmx/types/blob/a3b1e43d0b2add53bbc1f2acc2c5128360e8c97b/lib/xmlelem/index.d.ts#L629),
[object_to_text](https://github.com/wshcmx/types/blob/a3b1e43d0b2add53bbc1f2acc2c5128360e8c97b/lib/tools/index.d.ts#L5088),
[ParseJson](https://github.com/wshcmx/types/blob/a3b1e43d0b2add53bbc1f2acc2c5128360e8c97b/lib/core/index.d.ts#L4099).

## 7. Сохранение затрагивает больше основного XML

[XmlDocument](https://github.com/wshcmx/types/blob/a3b1e43d0b2add53bbc1f2acc2c5128360e8c97b/lib/xmldocument/index.d.ts#L45)
декларирует следующие свойства; перечисленные defaults — заявления комментариев.

| Свойство / метод                                              | Заявление источника; что остаётся неизвестным                                                                                                                                        |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `RunActionOnBeforeSave: boolean`                              | Default `true`, выполняет `OnBeforeSave` формы; полный порядок всех действий не описан                                                                                               |
| `RunActionOnSave: boolean`                                    | Default `true`, выполняет `OnSave`; отключение ради массовой обработки приведено как пример, но не даёт общего разрешения обходить бизнес-логику                                     |
| `WriteDocInfo: boolean`                                       | Default `true`, обновляет информацию о создании/изменении и пользователях; точные поля зависят от формы                                                                              |
| `WriteFt: boolean`                                            | Default `true`, включает полнотекстовое индексирование; транзакционность индекса не описана                                                                                          |
| `IsSeparated: boolean`                                        | Default `false`; separated-документ независим от базы, при сохранении не вызывается `OnSave` «и т.д.» — полнота отключённых действий не определена                                   |
| `NeverSaved: boolean`                                         | Признак нового, ещё не сохранявшегося документа; ID/URL сами по себе не подтверждают запись в базе                                                                                   |
| `IsChanged: boolean`; `SetChanged(isChanged?: boolean): void` | Prose одновременно говорит о программной записи и о read-only; надёжный кандидат изменения флага — метод                                                                             |
| `LastSavedData: XmlDocument`                                  | Prose описывает **корневой элемент** предыдущей копии, доступный в `OnSave` при `USE-LAST-SAVED-DATA="1"`; для нового документа — пустой корень той же формы. Тип результата спорный |
| `PrepareLastSavedData(): void`                                | Experimental, принудительная подготовка предыдущей копии                                                                                                                             |
| `TempData: Object`                                            | Данные на время жизни открытого документа, в том числе между hooks; не описаны как сохраняемые поля                                                                                  |
| `UpdateValues(): void`                                        | Принудительный пересчёт `EXPR` / `EXPR-INIT`; сам по себе не устанавливает, какие выражения вычисляются лениво или при сохранении                                                    |
| `AutoSave: boolean`                                           | Изменённые документы автоматически сохраняются при выходе/остановке, если включён; точная среда применения не определена                                                             |

Конкретные документные декларации содержат типовые методы, которых нет в базовом
интерфейсе. Например, [`DocTypeDocument.OnBeforeSave()`](https://github.com/wshcmx/types/blob/a3b1e43d0b2add53bbc1f2acc2c5128360e8c97b/lib/xml/doc_type/index.d.ts#L139)
и каталожный `OnBuild()`. Поэтому базовый интерфейс не является списком всех
возможных hooks формы. Запись в основной документ, пересборка каталога, callbacks,
индексы и вторичные объекты могут иметь разные точки отказа; декларации не
обещают общий rollback.

### Кэш и совместное использование

`Reload(): void` заявлен как повторная загрузка по URL; `RemoveFromCache(): void`,
`SetCached(): void`, `SetShared(): void` — удаление/добавление в кэш и экспорт имён
документа в глобальное окружение. `GetCachedDoc(url: string): XmlDocument` бросает
ошибку на cache miss; `GetAllCachedDocs(): unknown` и `ReplaceCachedDoc(): unknown`
не имеют достаточных сигнатур для использования. Комментарий `ReplaceCachedDoc`
говорит о замене документа целиком для thread-safety, но **теряет все аргументы**.
`DropFormsCache(urlPattern: string): undefined` касается форм, `DropXQueryCache(url?: string): unknown`
— запросов; это разные кэши.

Комментарий к `EvalThread(code: string): void` прямо говорит, что содержимое
документа не thread-safe. `XmlElem.ReadOnly: boolean` заявлен как запрет изменения
элемента и потомков; при помещении ссылки в `Session` он автоматически включается
для предотвращения одновременного изменения. Это локальные ограничения объекта,
а не доказательство проверки прав доступа клиента. `tools.remove_fetch_doc(objectId: number)`
описан как рассылка команды в fetch-doc queue работающих узлов, а
`tools.check_and_refresh_cached_docs(url: string): boolean` — обновление кэша для
хранилищ, отличных от XML; multi-node invalidation не следует выводить из одного
успешного `Save`.

## 8. Права, версии, транзакции: важные пробелы

`doc.HasWriteAccess: boolean` описан как режим открытия на запись/чтение. Это не
обещание проверки всех прикладных разрешений на каждое поле или операцию.
`tools.check_access(topElem: XmlTopElem, userId: number): boolean` описывает
прикладную проверку уровня, роли, групп и условий доступа; есть overload с
результатом `unknown`. `tools_web.check_access(source: XmlTopElem, personDocId: number,
personDoc?: CollaboratorDocumentTopElem, session?: Session): boolean` имеет другой
контекст. `ms_tools.check_cur_user_access_blocks_by_catalog_name(catalogName: string,
can: string): boolean` и другие admin helpers не определяют стандартизованный enum
`can` в декларациях. Нельзя выбирать одну функцию как универсальную авторизацию
CRUD без чтения реализации и проверки контекста выполнения.

Особенно существенен комментарий
[`PreprocessRecordsByReadAccess(recordsArray: unknown[]): unknown`](https://github.com/wshcmx/types/blob/a3b1e43d0b2add53bbc1f2acc2c5128360e8c97b/lib/core/index.d.ts#L2588):
на сервере напрямую выполненный XQuery и отдельная передача результатов клиенту
могут **обойти встроенную проверку чтения**, в отличие от XQuery, вызванного с
клиента. Утверждается обфускация полей недоступных записей. В этом же комментарии
есть подозрительная копия текста про чужую функцию `PreloadXQueryResultForeignRecords`,
поэтому требуется проверка реального provider/режима. Сам факт отдельного helper
достаточен, чтобы не считать серверную доступность данных правами MCP-пользователя.
Источники: [tools access](https://github.com/wshcmx/types/blob/a3b1e43d0b2add53bbc1f2acc2c5128360e8c97b/lib/tools/index.d.ts#L1023),
[ms_tools](https://github.com/wshcmx/types/blob/a3b1e43d0b2add53bbc1f2acc2c5128360e8c97b/lib/ms_tools/index.d.ts#L64).

`tools.create_object_version(oDocParam: XmlDocument): void` описан как создание
снимка **если** каталог разрешает версии/backup и содержимое изменилось.
`ObjectVersionDocument` содержит `catalog_name`, `object_id`,
`object_modification_date`, `person_id`, `object_xml`, `doc_info`.
`tools.update_object_versions(...)` описан как применение версии с изменениями,
уведомлениями и сохранением обоих документов; два overload расходятся в результате
`void` / `XmlTopElem`. Это исторические версии содержимого, **не подтверждённый
CAS/ETag и не встроенная optimistic locking**. `LastSavedData` также не заявлен
как lock или счётчик версии. Источники:
[create_object_version](https://github.com/wshcmx/types/blob/a3b1e43d0b2add53bbc1f2acc2c5128360e8c97b/lib/tools/index.d.ts#L1706),
[ObjectVersionDocument](https://github.com/wshcmx/types/blob/a3b1e43d0b2add53bbc1f2acc2c5128360e8c97b/lib/xml/object_version/index.d.ts),
[update_object_versions](https://github.com/wshcmx/types/blob/a3b1e43d0b2add53bbc1f2acc2c5128360e8c97b/lib/tools/index.d.ts#L6521).

В исследованных XML/Database-интерфейсах и core не найден объявленный общий
`BeginTransaction/Commit/Rollback`, lock API или compare-and-save. Поиск по
остальным декларациям находит `ADODB.Connection` с SQL transaction methods,
provider-операции миграции/перестроения и прикладной каталог денежных `transaction`;
они не доказывают транзакцию поверх `XmlDocument.Save`. Это **пробел сведений**, а
не утверждение отсутствия транзакций в платформе. Нельзя обещать атомарную пачку
CRUD либо автоматическую компенсацию hooks/индекса по этим декларациям.

## 9. Конкретная пара `cost_center` / `cost_centers`

[`CostCenterDocumentTopElem`](https://github.com/wshcmx/types/blob/a3b1e43d0b2add53bbc1f2acc2c5128360e8c97b/lib/xml/cost_center/index.d.ts)
сочетает `FuncManagersBase`, `AdminAccessBase`, `CustomElemsBase` и поля:
`id`, `code`, `name`, `is_active` (**default `true`**), `parent_id`,
`subdivisions`, `comment`, `doc_info`. `subdivisions` —
`XmlMultiElem<CostCenterDocumentSubdivision | null>`; его элемент имеет
`subdivision_id: XmlElem<number | null, SubdivisionCatalogDocumentTopElem>`.
`parent_id` типизирован как foreign на `CostCenterCatalogDocumentTopElem`.

[`CostCenterCatalogDocumentTopElem`](https://github.com/wshcmx/types/blob/a3b1e43d0b2add53bbc1f2acc2c5128360e8c97b/lib/xml/cost_center_catalog/index.d.ts)
содержит `AdminAccessBase`, `id`, `code`, `name`, `is_active`, `parent_id`,
`modification_date`, `app_instance_id`, `OnBuild()`. В нём нет `subdivisions`,
`comment`, `doc_info`, `FuncManagersBase`, `CustomElemsBase` из полного документа.
`is_active` в каталоге допускает `null`; в полном документе объявлен `boolean`.
Статический экспорт [`cost_centers`](https://github.com/wshcmx/types/blob/a3b1e43d0b2add53bbc1f2acc2c5128360e8c97b/lib/global_catalogs/index.d.ts#L404)
— массив каталожных записей.

Это хороший ограниченный пример для проверки различия полного объекта и
проекции каталога. Различие на уровне деклараций не устанавливает реальный
состав полей установленной формы, время обновления проекции или допустимость
редактирования каталожного результата.

## 10. Зафиксированные дефекты / неоднозначности деклараций

| Место                                                                                      | Несогласованность                                                                                      |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| `XmlDocument.ObjectID`                                                                     | Тип `number`, комментарий обещает также string ID                                                      |
| `XmlDocument.LastSavedData`                                                                | Тип `XmlDocument`, комментарий — предыдущий корневой элемент                                           |
| `FetchForm`                                                                                | Результат `undefined`, комментарий — загруженная/кэшированная форма                                    |
| `CreateFormFromStr`                                                                        | Результат `unknown`, комментарий — `XmlForm`                                                           |
| `FindOptCatalog`, `GetOptCachedForm`, `GetOptObjectForm`                                   | Комментарии допускают `undefined`, типы его теряют или скрывают за generic                             |
| `XmlFormElem.EvalOptPath`, `EvalPath`                                                      | Первый не допускает `undefined`, второй по умолчанию возвращает `XmlElem`, а не `XmlFormElem`          |
| `XmlFormElem.GetBoolAttr`                                                                  | Нет аргумента имени атрибута                                                                           |
| `XmlFormElem.GetOptUiAttr`, `GetOptUrlAttr`                                                | Тип `boolean`, prose обещает строку/URL                                                                |
| `XmlMultiElemObject.IsMultiElem`                                                           | Prose ошибочно говорит `false`, литеральный тип — `true`                                               |
| `XmlMultiElem.DeleteByValue`                                                               | Нет аргумента значения; в sibling-интерфейсе он есть                                                   |
| `XmlElem.GetChildIndexByValue`                                                             | Комментарий обещает индекс, тип возвращает generic элемент `T \| -1`                                   |
| `XmlElem.RelativePath`                                                                     | Комментарий требует базовый элемент и обещает путь; signature `RelativePath(): boolean`                |
| `XmlElem.DeleteChildren`                                                                   | Prose допускает отсутствие фильтра, signature требует `expression: string`                             |
| `ReplaceCachedDoc`                                                                         | Комментарий требует URL и новый документ, signature не имеет аргументов                                |
| `CreateElemByFormElem`                                                                     | Возвращает `XmlFormElem` в signature, prose/пример описывает созданный XML-элемент данных              |
| `XMLOpenOptions`                                                                           | `format=sv` в перечне, `csv` в описании сопутствующих параметров; `Separated` упомянут только отдельно |
| `tools.open_doc`, `register_doc_types_catalog`, `update_object_versions`, `object_to_text` | Overload-результаты или параметры противоречат друг другу                                              |

Даже тесты внешнего репозитория являются проверкой TypeScript-контрактов:
[`tests/xmlelem.ts`](https://github.com/wshcmx/types/blob/a3b1e43d0b2add53bbc1f2acc2c5128360e8c97b/tests/xmlelem.ts)
использует результат `GetChildIndexByValue` как объект с `Name`, а
[`tests/xmlformelem.ts`](https://github.com/wshcmx/types/blob/a3b1e43d0b2add53bbc1f2acc2c5128360e8c97b/tests/xmlformelem.ts)
фиксирует `XmlElem` для пути формы. Успешная компиляция таких тестов не разрешает
противоречие с native-семантикой.

## 11. Ограниченные проверки, которые декларации помогают сформулировать

Это предложения, **не выполненные проверки**. Каждый запуск должен фиксировать
версию/режим native-стенда, код, наблюдение и cleanup; file/memory и DB-проверки
нужно различать.

1. **Read-only discovery:** сравнить `DefaultDb.ObjectForms`,
   `GetObjectForm("cost_center")`, `GetObjectFormUrl`, `GetOptCatalog("cost_centers")`,
   `FindOptCatalog`, `tools.get_object_form_url(..., false/true)` и одну запись
   `common.exchange_object_types`. Проверить miss, singular/plural, форму результата
   и полноту списка без регистрации нового типа.
2. **Форма без записи:** на существующей XMD получить `TopElem`, `Type`,
   `IsMethod`, `IsMultiple`, `DefaultValue`, `IsNotNull`, `AttrNames`, `Xml`;
   проверить числовой обход/`ChildNum` и параметры `GetBoolAttr` отдельно.
   Использовать bounded output и ограниченную глубину.
3. **Отдельная in-memory/file XMD:** строка, integer, bool, date, default,
   `NOT-NULL`, `EXPR`, `EXPR-INIT`, `TEMP`, `SECONDARY`, обычный массив и `MULTIPLE`.
   Наблюдать чтение, `HasValue`, `Clear`, `LoadData`, `SetXml`, `AssignElem`,
   `UpdateValues`, XML output. Не выводить поведение DB из успешного file-save.
4. **Hooks на собственном временном файле:** записывать порядок `OnBeforeSave`/`OnSave`,
   значения `NeverSaved`, `LastSavedData`, `TempData`; проверить ошибку до/после
   записи и флаги по одному. Отдельно выяснить точный синтаксис separated.
5. **Один owned объект `cost_center`:** создание/привязка/ID до `Save`, сохранение,
   открытие полного документа, XQuery проекция, defaults, массив subdivisions,
   ошибочный foreign ID. Удаление — только созданного fixture с проверкой cleanup;
   не считать fixture родительского ID доказательством общей cascade-политики.
6. **Сериализация ID:** известные большие integer, hex/decimal/string ID,
   `EncodeJson` с `ExportLargeIntegersAsStrings`, `GetXml` с `ForceDecimal`;
   сравнивать текст без JS `number` round-trip. Отдельно foreign URL без существующей
   записи и `OptForeignElem`.
7. **Кэш:** `OpenDoc` и `FetchDoc` одного owned URL до/после изменения/`Reload`;
   зафиксировать aliasing и stale data в одном процессе. Для multi-node нужны
   самостоятельные проверки — их не заменяет одноузловой fixture.
8. **Права/конкуренция:** тест под существующими ограниченными субъектами при
   наличии подходящего стенда, без изменения ролей; два последовательных
   открытия owned документа и сохранение устаревшей копии. Это может обнаружить
   lost update, но не докажет общий transaction/CAS-контракт.

До таких проверок из этого источника можно уверенно получить **имена кандидатов
API, форму TypeScript-сигнатур и перечень заявленных эффектов**. Нельзя получить
готовую универсальную схему CRUD, точную валидацию всех типов, разрешения
MCP-субъекта, атомарность, полноту backup или надёжную стратегию конфликтов.
