# Структура БД: полный XML, каталоги и служебное хранение

Срез 2026-11-11, HCM 2025.2.1333 + PostgreSQL 16.15. Все числа ниже относятся
к одной установке; [методика и ограничения](README.md),
[наблюдения](observed/database.json), [SQL collectors](probes/README.md).

## Слои данных

| Слой                   | Что хранит                                                                                                   | Наблюдавшийся пример                                                   |
| ---------------------- | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| Полный документ        | XML объекта с вложенными данными                                                                             | `dbo.collaborator.data`                                                |
| Каталог                | Подготовленное представление для выборки; часть полей, вычисленные/дублированные значения, иногда arrays/XML | `dbo.collaborators`                                                    |
| Дополнительный каталог | Связи, вложенные элементы, производная или служебная выборка                                                 | `dbo.group_collaborators`, `dbo.event_collaborators`, `dbo.trash_docs` |
| Общие справочники      | Именованные наборы значений; ключ не обязательно bigint                                                      | `dbo."common.event_status_types"`                                      |
| Реестр и metadata      | Соответствие ID/форм/таблиц, сведения о связях                                                               | `dbo."(spxml_objects)"`, `dbo."(spxml_metadata)"`                      |
| URL blobs              | Байты, адресуемые URL: не только картинки, но также XML/XMD                                                  | `dbo."(spxml_blobs)"`                                                  |
| Full-text состояние    | Отметка индексирования формы; сами Lucene-файлы находятся отдельно                                           | `dbo."(ft_last_index)"`                                                |

Таким образом, SQL-БД — не только нормализованная предметная модель: полный XML
и его выборочные представления сосуществуют. Один и тот же бизнес-факт может
попасть в документ, основной каталог и несколько производных каталогов.
Что именно и когда пересчитывается, задают форма и платформа; наличие строк
в этих таблицах не доказывает их атомарное обновление.

Это согласуется с документацией о
[SQL storage](https://wshcm-docs.boristype.dev/news/platform/7119439504986790928.html)
и [физическом хранении](https://wshcm-docs.boristype.dev/news/platform/7141098863175091875.html).
Файловый XML backend — другой вариант хранения: описанный в статье путь
`wt_data/objects/<часть-ID>/<остаток-ID>.xml` не следует искать как обязательный
physical duplicate каждого документа на исследованном SQL backend.

## Проверенные размеры схемы

В schema `dbo` 1153 таблицы и 9277 столбцов. В `(spxml_metadata)` 1148 регистраций:
каждая соответствует существующей таблице, повторов `tablename` нет.

| Группа                                             | Число | Как установлено                                                 |
| -------------------------------------------------- | ----: | --------------------------------------------------------------- |
| Полные документы                                   |   414 | `doc_list=false`                                                |
| Каталоги                                           |   734 | `doc_list=true`                                                 |
| Из них каталоги с одноимённой парой документ + `s` |   414 | Фактическое сопоставление имён; не общий алгоритм pluralization |
| Из них literal `common.*`                          |   270 | Префикс имени SQL-таблицы                                       |
| Прочие каталоги                                    |    50 | Остаток, включая связи, производные и `trash_docs`              |
| Служебные таблицы вне регистраций                  |     5 | Разность списка таблиц и metadata                               |

Все 414 таблиц документов имеют одинаковые четыре столбца:

```text
id        bigint
created   timestamp without time zone
modified  timestamp without time zone
data      xml
```

Это описание физической таблицы. `created`/`modified` не следует автоматически
приравнивать к XML `doc_info` или полям `creation_date`/`modification_date`
каталога. Семантика timezone/обновления дат отдельно не проверялась.

## Пять служебных таблиц

| Таблица                  | Фактические поля                                                                                                                                                               | Назначение и граница вывода                                                                                                                                               |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `(spxml_objects)`        | `id`, `form`, `spxml_form`, `is_deleted`, `modified`                                                                                                                           | Общий реестр идентичности и формы. `is_deleted` — nullable integer, не SQL boolean; значения состояния не интерпретировать без отдельного lifecycle исследования          |
| `(spxml_metadata)`       | `schema`, `form`, `tablename`, `hash`, `doc_list`, `primary_key`, `parent_id_elem`, `spxml_form`, `spxml_form_elem`, `spxml_form_type`, `single_tenant`, `ft_idx`, `is_shared` | Регистрации хранилища; PK `(schema, form)`. Не все поля интерпретированы и не все читаются collector-ом                                                                   |
| `(spxml_foreign_arrays)` | `catalog`, `catalog_elem`, `name`, `foreign_array`                                                                                                                             | Metadata связей FOREIGN-ARRAY; PK первых трёх полей. Это не таблица SQL FK                                                                                                |
| `(spxml_blobs)`          | `url`, `data`, `ext`, `created`, `modified`, `hashdata`                                                                                                                        | `url` — PK, `data` — bytea; байты URL-ресурсов. Алгоритм/назначение `hashdata` не проверялся                                                                              |
| `(ft_last_index)`        | `form`, `last_ft_index_date`, `id`                                                                                                                                             | PK `form`; по имени и полям — отметка FT-индексирования по форме; её обновление в этом проходе не прослежено. Не доказательство, что конкретный объект уже виден в поиске |

Точные SQL-типы сохранены в `observed/database.json`.
[Статья об архитектуре](https://wshcm-docs.boristype.dev/news/platform/7119439504986790928.html)
описывает четыре служебные таблицы, без `(ft_last_index)`.
[Статья о физической структуре](https://wshcm-docs.boristype.dev/news/platform/7141098863175091875.html)
упоминает `created`/`FormURL` для реестра.
В текущем `(spxml_objects)` таких колонок нет; есть `spxml_form` и `modified`.
Запросы надо строить по реальной схеме, не копировать документированные имена.
Отсутствие колонки здесь не означает её отсутствия на MSSQL/другой версии.

## Предметные области: с чего начинать поиск

Ниже имена существующих пар. Колонки примеров проверены в SQL metadata; описание
предметной роли не является полным контрактом бизнес-операции.

| Полный документ → каталог                    | Что искать                                    | Примеры полей каталога                                                      |
| -------------------------------------------- | --------------------------------------------- | --------------------------------------------------------------------------- |
| `collaborator → collaborators`               | Сотрудники/учётные записи, кадровые признаки  | `fullname`, `login`, `email`, `org_id`, `position_id`, `is_dismiss`         |
| `org → orgs`                                 | Организации                                   | `name`, `disp_name`, `account_id`, `place_id`                               |
| `subdivision → subdivisions`                 | Подразделения/иерархия                        | `org_id`, `parent_object_id`, `is_disbanded`                                |
| `position → positions`                       | Должности, назначения                         | `parent_object_id`, `basic_collaborator_id`, `position_common_id`           |
| `group → groups`                             | Группы, правила доступа/отбора                | `person_num`, `is_dynamic`, `conditions`, `access_roles`                    |
| `course → courses`                           | Электронные курсы и параметры доступа         | `base_url`, `mastery_score`, `duration`, `role_id`                          |
| `active_learning → active_learnings`         | Назначенное/активное обучение по курсу        | `course_id`, `person_id`, `state_id`, `score`, `last_usage_date`            |
| `assessment → assessments`                   | Тесты                                         | `title`, `passing_score`, `publish_url`, `testing_system_id`                |
| `event → events`                             | Мероприятия                                   | `start_date`, `finish_date`, `status_id`, `course_id`                       |
| `event_result → event_results`               | Результат/участие человека в мероприятии      | `event_id`, `person_id`, `is_assist`, `score`                               |
| `resume → resumes`                           | Резюме и сведения кандидата                   | `person_id`, `is_candidate`, `min_wage`, `profession_id`                    |
| `pa → pas`                                   | Оценочные анкеты, участники и workflow оценки | `assessment_appraise_id`, `person_id`, `expert_person_id`, `workflow_state` |
| `resource → resources`                       | Metadata ресурса/вложения                     | `file_name`, `file_path`, `size`, `checksum`                                |
| `server_agent → server_agents`               | Настройки серверных агентов/расписания        | `trigger_type`, `period`, `last_run_date`, `block`                          |
| `custom_web_template → custom_web_templates` | Шаблоны портала, включая текст шаблона        | `cwt_type`, `out_type`, `template`, `is_enabled`                            |

Отдельный binary у `resource` не лежит автоматически в SQL XML `resource.data`;
путь ресурса требует следующего перехода к URL storage. Каталог `server_agents`
не содержит всей конфигурации исполняемого кода; её искать в полной форме/объекте
и его ссылках. Статья об
[«исполняемых файлах»](https://wshcm-docs.boristype.dev/news/monolith/6907522068940137248.html)
также называет этим словом объекты БД — библиотеки, агенты, отчёты и шаблоны.
Поиск только по `.js`/`.bs` на диске поэтому неполон.

## Каталог не обязан быть плоской таблицей или самостоятельным документом

Найдено 188 SQL ARRAY-столбцов в 121 каталоге: 172 `bigint[]` и 16 `varchar[]`.
Кроме `data xml` документов, каталоги содержат 74 XML-столбца в 28 таблицах.
Например, `courses.role_id` — `bigint[]`, а `courses.conditions` и
`courses.access_roles` — XML. `wtv/wtv_courses.xmd:21` объявляет `role_id`
с `TYPE="integer" MULTIPLE="1" FOREIGN-ARRAY="roles" INDEXED="1"`.
Это конкретное соответствие XMD/SQL, не полный алгоритм генерации schema.

`group_collaborators` содержит собственный PK `id`, `group_id` и `collaborator_id`,
но полного документа `group_collaborator` в registrations нет.
`event_collaborators` — отдельная проекция; её нельзя заменять понятием
`event_result`, у которого есть своя документная пара. Остальные 50 каталогов
перечислены в JSON; считать их все many-to-many было бы неверно.

У `dbo."common.event_status_types"` PK `id` имеет тип varchar; у
`dbo."common.exchange_object_types"` PK — varchar `name`, есть поле `form_url`.
Точка — часть имени таблицы: `dbo."common.event_status_types"` **не** означает
SQL schema `common`. `common.*` описывает область общих списков; происхождение
и изменяемость каждого из 270 наборов отдельно не проверялись.

Источники модели: [каталоги](https://wshcm-docs.boristype.dev/news/platform/7117695531631503784.html),
[связки и компоненты](https://wshcm-docs.boristype.dev/news/platform/7117676383185647529.html),
ранее проверенные [XMD и catalog projections](../mcp/10-object-model/xmd-and-catalogs.md).

## Связи, ключи и индексы

В схеме 1153 PK и **414 SQL FK**. Все FK исходят из документных таблиц,
валидированы и имеют ровно такой вид:

```sql
FOREIGN KEY (id) REFERENCES dbo."(spxml_objects)"(id)
ON UPDATE CASCADE ON DELETE CASCADE
```

Между бизнес-каталогами SQL FK в этом снимке нет. Например, индексы по
`group_collaborators.group_id` и `collaborator_id` есть, но FK нет.
XMD FOREIGN-ARRAY/ForeignElem и SQL REFERENCES — разные механизмы.
Отсутствие FK не доказывает отсутствие любых проверок в hooks/бизнес-функциях;
наличие каскада к реестру не доказывает корректный бизнес-cleanup через SQL DELETE.

Найдено 2925 индексов: 2807 B-tree и 118 GIN. Все эти GIN относятся к SQL arrays
(116 bigint[], 2 varchar[]). Они индексируют SQL-массивы и отличаются от найденных
Lucene-файлов. Причина и длительность задержки полнотекстового поиска этим срезом
не проверены. Не связывать `ft_idx` из metadata, GIN и расписание FT в один
механизм без проверки.

Документные ID — bigint. На границе JSON/JavaScript сохранять их точное значение
строкой; Number не покрывает весь диапазон. Каталожный `id` может быть ключом
справочника или строки проекции. [Числа и SQL→XML](../../mcp/xquery.md) описывают
отдельные особенности выдачи через платформу; прямой PostgreSQL metadata read
не проверяет корректность того carrier.

## Как находить форму и тип

Metadata связывает `form`, `tablename`, `spxml_form` и `spxml_form_elem`.
Например, `collaborator` указывает на `x-local://wtv/wtv_collaborator.xmd`, а
`collaborators` — на plural форму с элементом `collaborators.collaborator`.
Компоненты также регистрируют документы: в этом срезе wtv — 389/706
документов/каталогов, qti — 4/4, workspace_conversations — 14/16,
kedo_management — 3/3, workspace_calendar — 2/2,
workspace_classifmodel и workspace_timetracker — по 1/1, app — 0/1.
Расположение в `components/<code>` не означает отдельный SQL namespace.

Есть полезные контрпримеры разрешения типа по тегу:
`recruitment_methods.spxml_form_elem = recruitment_methods.budget_type`,
аналогично `recruitment_plans.budget_type`. Это соответствует исходным XMD:
в строке 2 явно указан `OBJECT-NAME="recruitment_method"`/`"recruitment_plan"`,
а в строке 7 дочерний тег называется `budget_type`. Это не доказанный runtime bug;
это причина не угадывать object type по имени дочернего XML-тега.

`spxml_form` в metadata показывает зарегистрированный адрес, но не доказывает,
какие bytes сейчас отдаст FetchForm: возможны URL routing, blobs и cache.
Новая/старая модель регистрации и границы её доступности разобраны в
[объектной модели](../../platform/object-model.md).

## Blobs и фактическое наполнение

Агрегаты дали 27 592 записи реестра и 1725 blobs. Это включает состояния удаления;
число нельзя называть количеством активных бизнес-объектов.
Payloads и персональные данные не извлекались.

В blobs обнаружены 485 записей с `ext=xmd` и 281 с `ext=xml`, а также записи
с расширениями JPG/PNG/SVG, PDF, MP4, DOCX, ZIP и другими. Под `x-local://wtv/`
находятся 436 записей `xmd` и 270 `xml`; под `x-local://wt_data/` — расширения
media/document файлов и 11 `xml`. Остальные 49 `xmd` агрегированы без публикации
отдельных URL. Содержимое не проверялось на соответствие расширению.

Следовательно, blobs нельзя считать только хранилищем вложений. Однако само
наличие записей с расширением XMD не устанавливает приоритет над файлом на диске
при FetchForm.
Управление путями, fallback/import и источник настроек рассматриваются в
[карте файлов](server-files.md) и [исторических routing probes](../dotnet/15-url-storage-routing-research.md).

## Чего этот срез не разрешает

Прямая запись в документные/каталожные таблицы не доказана эквивалентом Save:
hooks, связанные объекты, очереди, cache и FT могут остаться несогласованными.
Эта карта предназначена для чтения и диагностики. Она не устанавливает CAS,
транзакционность между слоями, поведение массового удаления, переносимость SQL
на MSSQL или правила обновления schema после редактирования XMD.

Детали SQL-provider необходимо сверять с конкретной установкой:
[PostgreSQL](https://wshcm-docs.boristype.dev/news/platform/7117716959109456413.html),
[MSSQL](https://wshcm-docs.boristype.dev/news/platform/7117716914289135698.html).
MSSQL в этом исследовании не запускался.
