# Определения настраиваемых полей HCM

Исследование от 2026-11-20. Проверены нативное чтение, сохранение через
веб-администратор и инструменты CLI/MCP на Linux x64 C-runtime HCM 2025.2.1333
с PostgreSQL. Проверки охватывают один процесс HCM.

## Где лежат определения и значения

| Область                   | Ключ                                   | Узел общего документа                                 |
| ------------------------- | -------------------------------------- | ----------------------------------------------------- |
| Все подразделения         | `subdivision`                          | `custom_templates.subdivision.fields`                 |
| Заявки определённого типа | `request_type` и точный ID записи типа | `custom_templates.request_type.items[item.id].fields` |

`wtv_view_main.xml:59` регистрирует общий документ
`x-local://wt_data/lists/wtv_custom_templates.xml` с формой
`wtv_custom_templates.xmd`. Для чтения и записи ориентироваться на
`custom_templates.Doc.Url`, поскольку логический URL может иметь свой storage
provider. Чтение Docker-пути на выключенном стенде не нашло физического файла.
Это не устанавливает, какой provider хранит документ.

В `wtv_custom_templates.xmd:284` потребитель `request` указывает
`template_field = 'request_type'` и `template_field_id = 'request_type_id'`.
Запись в `items` имеет integer ID со ссылкой на каталог `request_types`.
Другие пары в той же форме включают `response` → `response_type` и
`task` → `task_type`. `tools.get_custom_template` в `wtv_tools.xml:9950`
берёт селектор из переданного объекта через `EvalPath` и ищет шаблон по ключу.
Если форма задаёт общие поля и перенаправление, нативный метод клонирует общие
поля и дополняет или перекрывает их по имени полями выбранного шаблона.
Для `request` в этой поставке общего блока `fields` нет.

Значения объекта имеют собственный путь
`custom_elems/custom_elem[name,value]` (`wtv_general.xmd:2853`). Ключ
`name` и `value` являются строками в XMD, даже если тип определения —
`integer`, `real`, `list` или `foreign_elem`. Форматы отдельных
прикладных типов значений требуют своих проверок. Редактирование значения
проходит через существующий `wshcm_patch_object`, который уже проверен с
ключом `custom_elem.name`. Изменение определения не является миграцией
существующих значений.

## Сохранение в админке

Проверенный маршрут — нижняя левая шестерёнка → «Настраиваемые поля…».
Обычный тип, например «Подразделение», выбирается в дереве слева.
У «Типа заявки» кнопка «Добавить объект…» открывает окно «Выбор объекта».
Выберите существующий тип заявки, нажмите «Применить» и откройте созданный
подраздел. Тип заявки в каталоге при этом не создаётся.

В правой части доступны «Новое поле» и «Новая страница». В карточке поля
редактируются ключ, название, тип, страница, видимость на портале,
обязательность, стиль, комментарий, формула значения по умолчанию и условия.
Типы «Значение из списка» и «Множественный выбор» показывают свой список
допустимых значений. В карточке страницы задаются название и настройки доступа.
Сохранение всего окна вызывается кнопкой «Сохранить (Ctrl+S)».

`wtv_custom_templates.xms:2–40` обновляет окно при открытии. Перед сохранением
экран также чистит ссылки на удалённые разделы и шаблоны отсутствующих
объектов. `SAVE-ACTION` передаёт кандидат в
`ms_tools.obtain_shared_list_elem`. Серверная ветка в `ms_tools.xml:1454`
открывает исходный документ, применяет изменение и зовёт `save_cached_doc`.
Тот вызывает `ReplaceCachedDoc(doc.Url, doc)` перед `doc.Save()` и при
соответствующей capability инвалидирует записи кэша других узлов. Это
основание для выбора нативного пути сохранения, а не подтверждение, что
одиночный `Save` или запись физического файла обновляют все формы.

В браузере на первом сохранении наблюдались POST
`/api/spxml/PutDoc` с URL документа шаблонов и следующий POST
`/api/spxml/CallMethod` с `ms_tools.obtain_shared_list_elem`. Оба вернули
HTTP 200. Пара `PutDoc` и `CallMethod` повторилась при правке и очистке.
Свежий `OpenDoc` и общий `custom_templates` после каждого сохранения
вернули одинаковый XML. Это подтверждает маршрут веб-администратора на
одном процессе, но не доказывает атомарность двух операций.

Для проверки добавили строковое поле `bt_ui_probe_sub_20c9` в «Подразделение».
В «Типе заявки» выбрали существующую «Заявку на замену» без заявок и
настроенного шаблона. В её новом шаблоне создали страницу и поле
`bt_ui_probe_req_20c9` типа `combo`, привязали его к странице и добавили
два значения. Свежий XML подтвердил `sheets/sheet`, связь по `sheet_id`
и порядок `entries/entry/value`. ID шаблона `6405466310999430311`
сериализовался в XML как `0x58E4C9AC17DA54A7`. После повторного сохранения
с изменённым названием изменился только текст названия у созданного поля.
Сверка дерева подтвердила отсутствие изменений вне двух временных добавлений.

Временное поле подразделения и временную строку шаблона удалили через
иконки удаления в соответствующих разделах и снова сохранили. Существующая
«Заявка на замену» осталась доступной как тип для выбора, число шаблонов
вернулось с 17 к 16. XML после очистки побайтно совпал с исходным,
SHA-256 `a8440cbae51fef6b5793a56a443387a8de434884a94b64cf016aeaa9fbe67d73`.
Временная вкладка закрыта, стенд и PostgreSQL остановлены.

`wtv_custom_templates.xmd:8–54` задаёт поля с ключом `name`, список
вариантов `entries` без ключей и отдельные разделы `sheets`.
Определение также хранит `required` (`is_required` в XML), каталог,
`sheet_id`, ширину/высоту, условия, значение по умолчанию и другой
форматный контекст. Коды типов в этой поставке перечислены в
`wtv_common.xml:5117`, включая `combo`, `list`, `file` и
`foreign_elem`. Текущий `wshcm_list_object_types` выдаёт лишь краткую
проекцию определений и ID настроенных шаблонов.

## Контракт

Два инструмента работают с определениями в `custom_templates`.
Обнаружение типов и ID шаблонов остаётся в `wshcm_list_object_types`.
Значения в карточках записываются через `wshcm_patch_object`.

| Инструмент                             | Операция                                                                                                                       |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `wshcm_get_custom_field_definitions`   | Читает поля и страницы одной области в порядке HCM, возвращает коды типов, `exists` и `revision`.                              |
| `wshcm_patch_custom_field_definitions` | Принимает область, прочитанную ревизию реестра и список явных правок. `dryRun: true` возвращает результат применения без Save. |

В обоих вызовах `scope: {objectType: "subdivision"}` выбирает общий блок.
`scope: {objectType: "request_type", templateId: "6405466310999430311"}`
выбирает шаблон конкретного **типа** заявки. ID передаётся точной десятичной
строкой. HCM должен подтвердить допустимость области и принадлежность записи
к типу. Для существующего типа заявки без шаблона чтение возвращает
`exists: false`, пустые списки и ревизию. Первый применённый upsert заводит
запись шаблона. Та же адресация подходит другим владельцам `items`, когда
подтверждены их нативная схема и связь с каталогом.

Для обычной работы выбираем JSON. Он позволяет явно выразить правку одного
свойства, отличить пропуск от очистки и проверить ввод до записи. Полная
замена XML потребовала бы от агента собирать весь шаблон с настройками,
которые он не меняет. Внутри SDK исходные нативные элементы сохраняют
непереданные свойства, страницы и соседние шаблоны.

Пример предварительного просмотра. Поле привязывается к странице, которая
создаётся в том же запросе.

```json
{
  "scope": { "objectType": "request_type", "templateId": "6405466310999430311" },
  "revision": "<revision из чтения>",
  "dryRun": true,
  "operations": [
    { "op": "upsertPage", "id": "details", "set": { "title": "Детали" } },
    {
      "op": "upsertField",
      "name": "office",
      "set": { "title": "Офис", "type": "combo", "pageId": "details", "options": ["Москва", "Казань"] }
    }
  ]
}
```

Поля адресуются по `name`, страницы по `id`. `upsertField` и
`upsertPage` добавляют новый ключ в конец списка или правят существующий
элемент на месте. `moveField` сдвигает поле относительно другого поля в
той же области, например `{op: "moveField", name: "office", before: "comment"}`.
Нужно указать ровно одно из `before` и `after`. `movePage` работает так
же по ID страниц. Порядок остальных элементов сохраняется.
Перестановка поля сохраняет его `pageId`. Для переноса на другую
страницу нужна правка привязки через `upsertField`.

`removeField` и `removePage` удаляют определение по ключу. Удаление
страницы с привязанными полями разрешается, если те же правки удаляют,
переносят или отвязывают эти поля через `pageId: null`. Операции
применяются по порядку к кандидату. Ошибка в любой операции или
итоговой ссылке оставляет весь запрос без Save.

Переданный `options` целиком заменяет варианты в переданном порядке,
`[]` их очищает. Ключ поля остаётся его идентификатором. При изменении
типа или удалении определения существующие значения остаются в XML
объектов. Для их миграции нужен отдельный вызов редактирования объектов.

Тип проверяется по нативным кодам этой версии HCM. `renameField`
меняет ключ определения на месте, как присваивание `_field.name` в
`wtv_custom_templates.xms`. Другие определения и значения карточек
по старому ключу остаются доступными для отдельной миграции.

## Расширенные настройки

В `wtv_custom_templates.xmd` у поля есть `xquery_qual`, `condition_eval`,
`comment`, `default_value_eval`, `width`, `height`, `class` и `max_chars`.
`wtv_custom_templates.xms` показывает фильтр для `foreign_elem`,
открывает диалог стиля для четырёх последних свойств и редактирует
остальные строки в карточке поля. `max_chars` в XMD имеет тип `string`.
В API этим свойствам соответствуют `catalogFilter`, `validationCondition`,
`comment`, `defaultValueFormula`, `width`, `height`, `visualClass`
и `maxChars`. Инструмент сохраняет выражения как текст. Их использование
зависит от конкретной формы HCM.
[Создание настраиваемых полей](https://wshcm-docs.boristype.dev/news/monolith/6668447373194701289.html)

В `wtv_general.xmd` видимость состоит из `view.conditions.condition`
с наследованием `view_condition_base`. Редактор вызывает
`wtv_dlg_edit_filter_conditions.xml` с `script_type = 'javascript'`,
`is_catalog = false`, `use_scheme = false` и переносит только
`conditions`. Соседний `conditions_qual` принадлежит общей схеме
условий, используется в генераторе XQuery и сохраняется при правке
поля. Генератор JavaScript для видимости использует упорядоченные
строки с `and_or`, `bracket` и ссылками на системные и настраиваемые
поля. Множественные `value_multiple` проецируются в `values` для
переноса нативной конфигурации. Проверки JavaScript используют
`value`, в том числе для `is_multiple` с оператором «содержит».
[Условия видимости](https://wshcm-docs.boristype.dev/news/monolith/6668447094875302101.html)

Нативная операция `condition.value_multiple.Add().Value = value`
добавляет скаляр в порядке вызовов и допускает повторы.
`conditions.AddChild()` добавляет структурированную строку. Декларация
`XmlElem.AddChild` есть в `lib/xmlelem/index.d.ts` репозитория
`wshcmx/types` на ревизии `1d76d40c87ad6a9c249bd16f1bfea035dd815940`.
На C-runtime для множественного скаляра `AddChild` вернул ошибку,
вызов `Add()` вернул ссылку на новый элемент.
[Datex XmlMultiElem.Add](https://wshcm-docs.boristype.dev/news/monolith/6988547916048887913.html#add)

Страница наследует `admin_access_base` с `user_access_role`
и `user_group_id`. В `wtv_custom_templates.xms` эти элементы
показываются роли `admin`. Просмотр страниц в `ms_general.xms`
проверяет оба заданных ограничения одновременно для остальных ролей,
сравнивая группу с `curUser.access.user_group_id`. API использует
`accessRole` и `accessGroupId`, а новые ссылки сверяет со списком
ролей и каталогом групп.
[Настройка разделов карточки](https://wshcm-docs.boristype.dev/news/monolith/6668444634709904061.html)

Нативный тест CLI/stdio/SOAP на `websoft/hcm:2025.2.1333`, Linux
C-runtime и PostgreSQL, проверил расширенные настройки общего поля и
отдельного типа заявки `6405466310999430311`. Свежее чтение подтвердило
точный ID группы, порядок условий и их множественных значений, сохранение
строк формулы и фильтра, сохранение `conditions_qual` при очистке условий
и переименование на месте. Выражение `tools.create_filter_javascript`
дало `true` и `false` на двух значениях `status_id` у несохранённой заявки.
Рендеринг страницы под другой ролью, показ на портале и вычисление
формул в прикладных формах отдельно не проверялись. Исходный XML
восстановлен побайтно, список временных evaluator совпал с исходным.

## Ревизия и сохранение

Ревизия относится ко всему общему документу, как у схем пакетов.
Изменение соседнего шаблона тоже даёт конфликт при проверке. SDK
открывает свежий документ, применяет операции к выбранной ветке,
проверяет итоговые ссылки и повторно сверяет ревизию перед сохранением.
Для preview и no-op Save пропускается. Успешная запись возвращает
свежее чтение и новую ревизию. При потере ответа исход остаётся
`unknown`. SDK удаляет использованную ревизию этой области, поэтому перед
следующим запросом правки требуется чтение. Две проверки ревизии
не образуют атомарное сравнение и запись в HCM.

При различии общего кэша и открытого документа SDK возвращает
`CacheMismatch` на чтение и запись. Исправление требует сверки состояния
на узле HCM. SDK не подменяет чужой кэш после ошибки. Для patch требуется
учётка с ролью, отличной от `read_only`, по образцу ограничения
`OnCheckPutDoc` в поставляемом `wtv_view_main.xml`. Полная эквивалентность
правам интерфейса и проверкам кластерных узлов не устанавливалась.

## Проверка записи

Прямой нативный вызов `ms_tools.save_cached_doc` сохранил временный
шаблон, а `OpenDoc` и общий кэш показали одинаковый XML. Перестановка
выполнялась через `XmlElem.ChildIndex` и `SetChildIndex`. Декларация
есть в `lib/xmlelem/index.d.ts` той же ревизии `wshcmx/types`. Похожий
вызов использует редактор списков в `ms_general.xms`.

[Приёмочный тест CLI/stdio/SOAP](../../../packages/mcp-server/test/e2e/custom-fields.mjs)
проверил общий тип и ненастроенный тип заявки. Подтверждены preview, Save,
порядок полей и страниц, конфликт ревизии, удаление и no-op. Независимое
чтение подтвердило сохранение непереданного нативного комментария и
побайтное восстановление исходного документа после очистки. SHA-256 XML
до и после равен `a8440cbae51fef6b5793a56a443387a8de434884a94b64cf016aeaa9fbe67d73`.
В тесте также на время заменили только кэш собственным кандидатом, без
записи в хранилище. Оба инструмента вернули `CacheMismatch`. Вернули кэш
после проверки точных XML кандидата и сохранённого документа. Так
воспроизведено расхождение между стадиями сохранения. Реальную ошибку I/O
при Save не вызывали.

Запускать на отдельном тестовом стенде. Нужны существующий
`request_type` без шаблона и заявок, одна группа и учётная запись
с ролью `admin`. ID типа заявки передаётся в
`WSHCM_E2E_TEMPLATE_ID`, параметры стенда в `WSHCM_E2E_CONTAINER`,
`WSHCM_E2E_USERNAME` и `WSHCM_E2E_PASSWORD`. После сборки SDK и MCP
выполнить `pnpm --filter @boristype/mcp-server test:e2e:custom-fields`.

## Подтверждение нативного чтения

Поставляемый образ `websoft/hcm:2025.2.1333`,
`sha256:0edeac24afc2a5371ea8431c59b1c17ca2b1a9e5a3768275cfdb5023609e34ab`.
Срез исходников BorisType — `5e8c23708de0e20fd1d8493bc8ac53ffd59b3c78`.
Вызовы сделаны через SDK `WshcmClient` и временный evaluator по SOAP,
Node v24.22.2. Для воспроизведения передайте каждый блок в
`evaluator.eval` на демостенде и разбирайте `JSON.parse(JSON.parse(wire))`.
Вызовы не меняют документы и шаблоны. Собственные временные evaluator
удалены, сверены восемь исходных файлов. Стенд и PostgreSQL после проб остановлены.

Первый блок подтвердил URL, совпадение открытого документа с общим кэшем,
поле `subdivision.is_department` и 16 элементов `request_type.items`.
Результат явного чтения одного шаблона (семь полей) совпал при вызове через
`request_type` и через `request`. У этого типа в тесте не нашлось готовой заявки.
SHA-256 текста первого блока без завершающего перевода строки —
`2d62e6c7722809a1b33b54c115b7ef630e7a757c8baa297ed36cabd0c3c490b6`.

```bs
var registryDoc = custom_templates.Doc;
var fromStorage = OpenDoc(registryDoc.Url);
var requestMeta = custom_templates.request;
var plain = tools.get_custom_template('subdivision', null, null);
var first;
var item;
for (item in custom_templates.request_type.items) {
    if (item.fields.ChildNum > 0) { first = item; break; }
}
var direct = tools.get_custom_template('request_type', first.id.Value, null);
var throughRequest = tools.get_custom_template('request', first.id.Value, null);
var contextual = {existingRequest:false};
try {
    var row = ArrayOptFirstElem(XQuery('for $elem in requests where $elem/request_type_id = ' + StrInt(first.id.Value) + ' return $elem'));
    if (row != undefined) {
        var source = OpenDoc(UrlFromDocID(row.id.Value)).TopElem;
        var resolved = tools.get_custom_template('request', null, source);
        contextual = {existingRequest:true, selectedIdMatches:resolved.id.Value == first.id.Value,
            requestValueContainer:source.ChildExists('custom_elems'),
            sourceTemplateMatches:resolved.fields.Xml == direct.fields.Xml};
    }
} catch (err) {
    contextual = {error:String(err)};
}
var types = [];
var kind;
for (kind in common.template_field_types) types.push(String(kind.name.Value));
return EncodeJson(EncodeJson({
    url:String(registryDoc.Url), root:custom_templates.Name,
    sameAsFresh:fromStorage.TopElem.Xml == custom_templates.Xml,
    standaloneCount:plain.fields.ChildNum,
    standaloneKey:String(ArrayFirstElem(plain.fields).name.Value),
    requestHasOwnFields:requestMeta.ChildExists('fields'),
    owner:String(requestMeta.template_field.Value), selector:String(requestMeta.template_field_id),
    templateCount:custom_templates.request_type.items.ChildNum,
    selectedFields:direct.fields.ChildNum,
    chosenOwnerMatches:direct.fields.Xml == throughRequest.fields.Xml,
    contextual:contextual,
    nativeFieldTypes:types
}));
```

Второй блок нашёл существующую заявку другого настроенного типа. Селектор
имел runtime-тип `integer`. Вызов с `source` выбрал тот же ID и XML тех же
четырёх полей, что и явное чтение по ID типа. SHA-256 текста второго блока
без завершающего перевода строки —
`2d204056fad57666b174981babb7ed6327fd68085e6a0aee2eb8ff07a5f91f55`.

```bs
var template;
var candidate;
var filter = '';
for (candidate in custom_templates.request_type.items) {
    if (candidate.fields.ChildNum == 0) continue;
    if (filter != '') filter += ' or ';
    filter += '$elem/request_type_id = ' + StrInt(candidate.id.Value);
    if (template == undefined) template = candidate;
}
var row = ArrayOptFirstElem(XQuery('for $elem in requests where (' + filter + ') return $elem'));
var source;
var carrier;
if (row == undefined) {
    source = OpenDocFromStr('<request/>').TopElem;
    source.AddChild('request_type_id', 'integer').Value = template.id.Value;
    carrier = 'in-memory request root with integer selector';
} else {
    source = OpenDoc(UrlFromDocID(row.id.Value)).TopElem;
    template = custom_templates.request_type.items.GetOptChildByKey(source.request_type_id.Value);
    carrier = 'existing request';
}
var resolved = tools.get_custom_template('request', null, source);
var explicit = tools.get_custom_template('request_type', template.id.Value, null);
return EncodeJson(EncodeJson({
    carrier:carrier, root:source.Name, selectorType:DataType(source.request_type_id.Value),
    selectedIdMatches:resolved.id.Value == template.id.Value,
    fieldsMatch:resolved.fields.Xml == explicit.fields.Xml, fieldCount:resolved.fields.ChildNum
}));
```

Источники по пользовательскому поведению и API:
[Настраиваемые поля и разделы](https://wshcm-docs.boristype.dev/news/monolith/6665632474391410577.html),
[Настройка формы подачи заявок](https://wshcm-docs.boristype.dev/news/monolith/6669556613957111436.html),
[Datex get_custom_template](https://wshcm-docs.boristype.dev/news/monolith/6680799737529721815.html#get-custom-template).
В `wshcmx/types@1d76d40c87ad6a9c249bd16f1bfea035dd815940`
`lib/core/index.d.ts` объявляет `RegisterSharedDoc` и
`GetCachedDoc`. Декларация `ReplaceCachedDoc` неполна, вызов с двумя
аргументами взят из `ms_tools.xml`. В `lib/xmlelem/index.d.ts` описаны
`GetOptChildByKey`, `ObtainChildByKey` и `GetXml`.
