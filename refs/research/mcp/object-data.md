# Типы данных объектов и их экземпляры

## Модель HCM

| Сущность                   | Где читать                                                       | Что хранит                                                                                                 |
| -------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `object_data_type`         | Документ `wtv_object_data_type.xmd`, каталог `object_data_types` | Код, название, основной и связанный типы объектов, параметры размещения списка в админке                   |
| Шаблон настраиваемых полей | `custom_templates.object_data_type.items`, ключ — ID типа данных | Определения полей и страниц                                                                                |
| `object_data`              | Документ `wtv_object_data.xmd`, каталог `object_datas`           | Тип данных, состояние и период действия записи, ссылки на объекты, текстовые данные, файлы, значения полей |

`object_data_type` — запись справочника. Экземпляры всех таких типов
хранятся в общем каталоге `object_datas` и выбираются по
`object_data_type_id`. Это же поле служит селектором шаблона в
`wtv_custom_templates.xmd`. Админский `ms_custom_data_view` получает
определения через `tools.get_custom_template('object_data', id, TopElem)`.
Значения хранятся у экземпляра в `custom_elems/custom_elem[name,value]`.
В XML основного объекта данные такой записи не появляются.
[Тип данных объектов](https://wshcm-docs.boristype.dev/news/monolith/6776469108192706622.html)

Связи лежат в парах `object_type/object_id` и
`sec_object_type/sec_object_id`. Тип данных задаёт типы обеих связей.
В поставляемом `wtv_object_data.xms` выбор типа запускает
`tools.common_filling`, который переносит `object_type` и
`sec_object_type` из карточки типа. Выбор объектов в XMS также
заполняет их отображаемые названия. Для записи через XML нужные поля
можно передать явно. `OnBeforeSave` у экземпляра копирует
`object_name` в `name`, когда собственное название пусто.
[Выбор связанного объекта](https://wshcm-docs.boristype.dev/news/monolith/6869614897423337922.html)

## Запросы и формат данных

У настраиваемых полей схема и виджеты общие, а значения находятся
в XML документа. `object_data` позволяет расширять объект через отдельную
запись с собственной строкой в `object_datas`. Тип записи и ID обеих
связей доступны в каталожной проекции, поэтому по ним можно фильтровать
и связывать данные в XQuery или через SQL `JOIN`. Документ экземпляра
по-прежнему имеет общую XML-форму.

Из двух строковых полей `data` хранится в документе, а `data_str`
попадает и в документ, и в каталожную проекцию. По практике пользователя
в оба поля обычно записывают одинаковое значение, чтобы один payload
был доступен из любого пути чтения. Для нескольких прикладных полей
используют сериализованный JSON. При таком подходе код, записывающий
данные, отвечает за их схему и согласованность обеих копий.
Свойства JSON остаются внутри одной строки `data_str`, доступ к ним
требует разбора JSON. Значения `custom_elems` доступны в полном документе.
[Данные объекта](https://wshcm-docs.boristype.dev/news/monolith/6776469558560502816.html)

## Маршрут в админке

В блоке **Дизайнер → Справочники → Типы данных объектов** создаётся
карточка типа. Поля и страницы настраиваются через нижнюю шестерёнку,
**Настраиваемые поля → Тип данных объектов → Добавить объект**.
Обычные записи данных отображаются в разделе, заданном в карточке типа.
Маршрут подтверждён документацией и поставляемыми XMS.
[Создание типа данных](https://wshcm-docs.boristype.dev/news/monolith/6794668908135408319.html)
[Настройка полей и разделов](https://wshcm-docs.boristype.dev/news/monolith/6794661352550713657.html)

Поле `disp_block` хранит настройки размещения. При сохранении экран
`wtv_object_data_type.xms` отдельно вызывает `tools.disp_block_filling`,
который обновляет `wtv_disp_object_blocks.xml`. Это действие экрана нужно
учитывать при автоматизации привязки типа к меню. В нативной пробе ниже
настройки размещения не менялись.
[Привязка к блоку админки](https://wshcm-docs.boristype.dev/news/monolith/6794660374808039331.html)

## Нативная проверка через MCP

2026-11-20, BorisType `030c88c0cbf4432feb953c08e01da66abe04659f`,
`websoft/hcm:2025.2.1333`
(`sha256:0edeac24afc2a5371ea8431c59b1c17ca2b1a9e5a3768275cfdb5023609e34ab`),
Linux C-runtime с PostgreSQL. Вызовы шли через CLI/stdio и SOAP.
Независимое чтение выполнено через SDK evaluator. До пробы на стенде было
9 типов данных и 153 записи, у `object_data_type` было 0 настроенных шаблонов.

1. В `wshcm_get_custom_field_definitions` передать
   `{mode:"list",objectType:"object_data",limit:1}`.
   Ответ содержит `templateType: "object_data_type"` и
   `templateSelector: "object_data_type_id"`.
2. Через `wshcm_save_object` с `mode:"create"` и формой
   `x-local://wtv/wtv_object_data_type.xmd` создать пробный тип.
   Указать уникальные `code` и `name`, `object_type=subdivision` и
   `sec_object_type=group`. Чтение `scope` с типом
   `object_data_type` и ID новой записи даёт `exists: false` и ревизию.
3. Передать эту область и ревизию в `wshcm_patch_custom_field_definitions`.
   Проба создала страницу `details` и поле `stage` типа `combo` с
   вариантами `План` и `Готово`. Повторный поиск вернул ID типа,
   название и счётчики `fieldCount: 1`, `pageCount: 1`.
4. Через `wshcm_save_object` создать документ формы
   `x-local://wtv/wtv_object_data.xmd` с отдельным уникальным кодом,
   `object_data_type_id` нового типа и разными строками в `data` и
   `data_str`. Свежее чтение показало пустые `object_type` и
   `sec_object_type`, несмотря на их настройки в типе.
5. Прочитать экземпляр через `wshcm_get_object`. Передать его ID и
   `readToken` в `wshcm_patch_object` с XML ниже, подставив точные
   десятичные ID существующего подразделения и группы. Свежее чтение
   вернуло значение `Готово`.

```xml
<object_data>
  <object_type>subdivision</object_type>
  <object_id>SUBDIVISION_ID</object_id>
  <sec_object_type>group</sec_object_type>
  <sec_object_id>GROUP_ID</sec_object_id>
  <custom_elems>
    <custom_elem>
      <name>stage</name>
      <value>Готово</value>
    </custom_elem>
  </custom_elems>
</object_data>
```

Для независимой проверки подставить ID созданного экземпляра в запрос ниже.
`get_custom_template` подтвердил правильный тип и пару «поле и страница».
Основная ссылка разрешилась. Второй документ открылся по ID с корнем
`group`. При этом `sec_object_id.OptForeignElem` был пуст. В обеих
формах, `wtv_object_data.xmd` и `wtv_object_datas.xmd`, у
`sec_object_id` объявлен `FOREIGN-ARRAY` с `object_type`, из-за
чего для этого поля был выбран каталог подразделений. XMS открывает
выбор по `sec_object_type`. Свойства `ForeignArrayCodeStr` и
`OptForeignElem` сверены с `lib/xmlelem/index.d.ts` в `wshcmx/types`
на ревизии `1d76d40c87ad6a9c249bd16f1bfea035dd815940`.
[Datex OptForeignElem](https://wshcm-docs.boristype.dev/news/monolith/6934960024317591784.html#optforeignelem)

```bs
var id = Int('OBJECT_DATA_ID');
var doc = OpenDoc(UrlFromDocID(id));
var data = doc.TopElem;
var template = tools.get_custom_template('object_data', id, data);
var row = ArrayOptFirstElem(XQuery(
    'for $e in object_datas where $e/id = ' + StrInt(id) + ' return $e'
));
return EncodeJson({
    templateId: StrInt(template.id.Value),
    fieldCount: template.fields.ChildNum,
    pageCount: template.sheets.ChildNum,
    stage: String(data.custom_elems.GetChildByKey('stage').value.Value),
    primaryResolves: data.object_id.OptForeignElem != undefined,
    secondaryResolves: data.sec_object_id.OptForeignElem != undefined,
    secondaryRoot: OpenDoc(UrlFromDocID(data.sec_object_id.Value)).TopElem.Name,
    secondaryCatalog: String(data.sec_object_id.ForeignArrayCodeStr),
    catalogData: row.ChildExists('data'),
    catalogCustomValues: row.ChildExists('custom_elems'),
    catalogDataStr: String(row.data_str.Value)
});
```

При очистке сначала удалён принадлежащий пробе шаблон. Два документа
удалены через `DeleteDoc(url, true)` после проверки их ID, корня и
уникальных кодов. Поиск по кодам вернул 0 строк в обоих каталогах.
XML реестра восстановлен побайтно, кэш совпал с сохранённым документом
(`a8440cbae51fef6b5793a56a443387a8de434884a94b64cf016aeaa9fbe67d73`).
XML размещения сохранил исходный hash
`7567dde5b69c538d23144e8c95e3419f27c1a445e48c17a2e58dc8ac79dd10e8`.
Набор evaluator после закрытия совпал с исходным.
