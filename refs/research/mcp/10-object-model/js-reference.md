> Исторический материал из `plans/mcp-server/10-object-model/js-reference.md` (baseline `8ff2739`).
> Статусы, команды и утверждения ниже относятся к описанному этапу; актуальные входы — [refs](../../../README.md).

# Поставляемый JS-reference: XMD, создание и сохранение

Дата анализа: 2026-11-08. Метод: статическое чтение известного JS-артефакта
по навыку `reverse-engineer-anything`; `rg` и чтение ограниченных фрагментов.
REA binary/provider workflow не требовался: цель — открытый текст, а не бинарник.
Артефакт не исполнялся; стенд, браузер, HTTP API и документация MCP не вызывались.

- Указанный путь: `/home/agent/workspace/main.js` — symlink.
- Разрешённая цель: `/home/agent/workspace/wshcm-research/main-1333.js`.
- SHA-256: **`7ad30901c8b58de7255a38059e0793d2def16a9768e15ef603a8ea1a5e75e09c`**.
- Размер текста: 75 507 строк; номера ниже относятся к этой неизменённой цели.
- Заголовок: `SP-XML Web client`, copyright Datex 2012–2022. Имя `1333`
  не считается самостоятельно доказанной версией коробки или C-runtime.

**Граница доказательств:** ниже `JS-static` означает прочитанную реализацию
веб-клиента. Результаты C-runtime переданы основным исследованием и явно
обозначены отдельно; этот файл не воспроизводит их. Декларации сверены отдельно
в [declarations.md](declarations.md). Сходство названий API не устанавливает
одинаковое поведение JS, C и HTTP-сервера.

## 1. Карта исходных мест

| ID  | Место в закреплённом артефакте                                                                                                                                                                                                                                                                 |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| J1  | OpenDoc/OpenDocFromStr/OpenNewDoc wrappers (`/home/agent/workspace/wshcm-research/main-1333.js:19567`; локальный vendor source, вне репозитория), строки 19567–19615                                                                                                                           |
| J2  | FetchForm/CreateFormFromStr/RegisterFormFromStr wrappers (`/home/agent/workspace/wshcm-research/main-1333.js:20108`; локальный vendor source, вне репозитория), 20108–20149                                                                                                                    |
| J3  | XmTagReader.ReadNextAttr (`/home/agent/workspace/wshcm-research/main-1333.js:21830`; локальный vendor source, вне репозитория), 21830–21956; ReadQuotedText (`/home/agent/workspace/wshcm-research/main-1333.js:21990`; локальный vendor source, вне репозитория), 21990–22017                 |
| J4  | XmDecodeTagValue (`/home/agent/workspace/wshcm-research/main-1333.js:22719`; локальный vendor source, вне репозитория), 22719–22797; ParseMethodAttr (`/home/agent/workspace/wshcm-research/main-1333.js:23648`; локальный vendor source, вне репозитория), 23648–23783                        |
| J5  | XmFetchForm/cache (`/home/agent/workspace/wshcm-research/main-1333.js:25391`; локальный vendor source, вне репозитория), 25391–25416; XmForm.Load/LoadCore (`/home/agent/workspace/wshcm-research/main-1333.js:25489`; локальный vendor source, вне репозитория), 25489–25649                  |
| J6  | InitStdProps (`/home/agent/workspace/wshcm-research/main-1333.js:25655`; локальный vendor source, вне репозитория), 25655–25704                                                                                                                                                                |
| J7  | XmOpenDoc (`/home/agent/workspace/wshcm-research/main-1333.js:26169`; локальный vendor source, вне репозитория), 26169–26241; XmCreateNewDocByForm (`/home/agent/workspace/wshcm-research/main-1333.js:26347`; локальный vendor source, вне репозитория), 26347–26383                          |
| J8  | BuildCore/LoadCore (`/home/agent/workspace/wshcm-research/main-1333.js:26541`; локальный vendor source, вне репозитория), 26541–26694                                                                                                                                                          |
| J9  | XmDoc.Save (`/home/agent/workspace/wshcm-research/main-1333.js:26770`; локальный vendor source, вне репозитория), 26770–26818; snapshot/triggers/export (`/home/agent/workspace/wshcm-research/main-1333.js:26821`; локальный vendor source, вне репозитория), 26821–26912                     |
| J10 | XmFetchOptions.LoadFromStr (`/home/agent/workspace/wshcm-research/main-1333.js:27128`; локальный vendor source, вне репозитория), 27128–27147; LastSavedData/access getters (`/home/agent/workspace/wshcm-research/main-1333.js:27259`; локальный vendor source, вне репозитория), 27259–27273 |
| J11 | Save/BindToDb wrappers (`/home/agent/workspace/wshcm-research/main-1333.js:27464`; локальный vendor source, вне репозитория), 27464–27573; SetXml (`/home/agent/workspace/wshcm-research/main-1333.js:31188`; локальный vendor source, вне репозитория), 31188–31212                           |
| J12 | XmDb/registration (`/home/agent/workspace/wshcm-research/main-1333.js:34455`; локальный vendor source, вне репозитория), 34455–34490; URL models (`/home/agent/workspace/wshcm-research/main-1333.js:34863`; локальный vendor source, вне репозитория), 34863–34946                            |
| J13 | ObjectForms (`/home/agent/workspace/wshcm-research/main-1333.js:35041`; локальный vendor source, вне репозитория), 35041–35057; OpenObjectDoc/OpenNewObjectDoc (`/home/agent/workspace/wshcm-research/main-1333.js:35091`; локальный vendor source, вне репозитория), 35091–35182              |
| J14 | create/get/put HTTP (`/home/agent/workspace/wshcm-research/main-1333.js:36284`; локальный vendor source, вне репозитория), 36284–36354; HTTP error handling (`/home/agent/workspace/wshcm-research/main-1333.js:36817`; локальный vendor source, вне репозитория), 36817–36858                 |
| J15 | Object-model flag default (`/home/agent/workspace/wshcm-research/main-1333.js:35484`; локальный vendor source, вне репозитория), 35484–35486; startup override (`/home/agent/workspace/wshcm-research/main-1333.js:39007`; локальный vendor source, вне репозитория), 39007–39012              |

## 2. XMD — диалект с более мягким парсером

**JS-static, J3–J4:** если имя атрибута уже присутствует, `ReadNextAttr`
находит свободное имя с числовым суффиксом и сохраняет туда следующий атрибут.
Комментарий прямо называет это `Quick workaround for PARAM attribute`, но условие
не ограничено только `PARAM`. Повторные `PARAM` превращаются в `PARAM1`, `PARAM2`,
далее по первому свободному суффиксу. Это не поведение строгого XML-парсера.

`XmFormElem.ParseMethodAttr` для старого объявления метода читает `PARAM`,
затем `PARAM1`, `PARAM2` до первого отсутствующего; альтернативно принимает
`PARAMS` со списком через запятую. Для нового `<METHOD>` читает дочерние
`<PARAM NAME="...">` и `<RESULT NAME="...">`. Перенумерация атрибутов и разбор
метода связаны явно, поэтому повторные `PARAM` в vendor XMD выглядят поддерживаемым
входом этого JS-клиента, а не случайным повреждением данных.

Внутри кавычек `ReadQuotedText` ищет только закрывающую кавычку, учитывает строки
и не отклоняет сырой `<`. `XmDecodeTagValue` заменяет известные entities,
сохраняет неизвестные и остаток необработанного `&`; строгую XML entity validation
здесь не видно. Сырые `&&`/`<` в атрибутном коде поэтому нельзя автоматически
оценивать теми же правилами, что стандартный XML. Это статическое объяснение
механизма, не выполненный тест всех vendor-файлов и не доказательство C-парсера.

**C/исследование корпуса, передано основным исследованием:** строгий парсер
отклоняет 71 из 919 vendor XMD, среди причин — повторные `PARAM` и сырые операторы.
Данные согласуются с найденными JS-механизмами. Вывод для исследования: провал
строгого offline XML parsing не доказывает невалидность XMD для платформы.
Для схем нужны runtime reflection и исходный текст; «починка XML» регулярными
заменами может изменить код метода, порядок параметров или foreign-выражение.

## 3. FetchForm и old/new object model

**JS-static, J2/J5:** `CallFetchForm` возвращает `XmFetchForm(formUrl)`.
Внутренняя функция сначала проверяет `gXmFormsCache[formUrl]`, иначе создаёт
`XmForm`, загружает, помечает cached, сохраняет и возвращает форму. Это конкретная
реализация возвращаемого объекта; она расходится с `FetchForm(...): undefined`
в декларациях. `RegisterFormFromStr` сначала удаляет прежнюю запись кэша,
затем вызывает `XmFetchForm(formUrl, formDataStr)`; это изменение client-кэша.

При отсутствии переданного текста `XmForm.Load` запрашивает разные сервисы:
новая модель — `/spxml_web/service/get_form.htm`, старая — `/api/spxml2/get_form`.
Не следует считать, что результат обязательно побайтово совпадает с исходным
XMD на диске: сервисная реализация здесь не исследована.

**JS-static, J12/J13/J15:** `gXmUseObjectTypes` сначала равен `true`, но startup
переключает его в `false`, если в ответе нет `application_module`. `XmDb` создаёт
`objectTypesArray` только в новой модели; `RegisterObjectType` в старой сразу
возвращает управление. `ObjectForms` перечисляет только `objectTypesArray` и
возвращает `objectType.form`. Это не обещание списка всех доступных XMD/каталогов.
`RegisterCatalog` в новой модели явно отклонён как неподдерживаемый.

URL тоже различаются: новая модель строит `x-db-obj://.../<type>/<id>.xml`,
старая — `x-local://.../objects/<разбитый id>.xml` (J12). `BindToDb` в JS
генерирует ID и старый URL; `BindToDbObjectType` требует зарегистрированный тип
и строит новый URL (J11). В JS `BindToDb` не читает дополнительный explicit-ID
аргумент из деклараций — ещё одно различие, которое нельзя переносить в C.

**C, передано основным исследованием:** `UseObjectTypes=false`, `ObjectForms`
пуст. JS объясняет, почему пустой список новой модели совместим с рабочими
старыми каталогами; одного этого свойства недостаточно для discovery.

## 4. OpenNewDoc, OnCreate и пропущенные аргументы

**JS-static, J1/J7/J8:** wrapper `OpenNewDoc` принимает второй строковый аргумент
options и читает ключ **`separate`**. Декларация этого аргумента не содержит.
В `XmCreateNewDocByForm` порядок такой: создать документ, назначить форму/URL,
`wasNeverSaved=true`, `BuildCore`, согласовать ID, пересчитать значения; для
не-separated сделать snapshot и **только при старой модели** выполнить `OnCreate`;
потом выполнить `OnInit` и `OnLocalInit`. `BuildCore` также выполняет
`OnBeforeInit`, если документ не separate.

Wrapper открытия существующего документа использует другой набор options:
`digest`, `ignore-top-elem-name`, `drop-namespaces`, `ignore-form`, `ui-text`,
`form` (J10). В его `LoadFromStr` нет чтения `separate`; поддержка отдельного
параметра `XmFetchOptions(..., isSeparate)` не равна поддержке строкового option
во всех API. Написание `Separated` из комментариев типов здесь не подтверждается.

**JS-static, J13/J14:** `DefaultDb.OpenNewObjectDoc` читает второй explicit ID
и третий options `separate`. При `(!isSeparate && OnCreate имеется) || assignID`
он вызывает серверный `create_doc.htm`, загружает ответ и помечает документ новым.
Это иной путь, чем локальный `OpenNewDoc`; серверное выполнение `OnCreate` нельзя
восстановить из одного клиентского файла. C-наблюдение trace `C` при создании
owned-формы соответствует старой ветви, но самостоятельно не проверяет новую.

## 5. Save: клиентский порядок и серверные hooks

**JS-static, J6/J9/J14:** `InitStdProps` регистрирует `OnCreate`, `OnBeforeInit`,
`OnInit`, `OnLocalInit`, **`OnClientSave`**, `OnClientDelete`. Он не инициализирует
поля `propOnBeforeSave`/`propOnSave`. Прочитанный `XmDoc.Save` делает следующее:

1. Отклоняет пустой URL; при старой модели или `x-db-obj` запускает глобальные
   before-save triggers.
2. Для локального `data_local` пишет через `SaveToUrl`; в остальных случаях
   вызывает `LdsPutDoc`. В части ветвей предварительно согласует ID и отдельно
   записывает изменённые large fields, затем очищает клиентские кэши.
3. При наличии формы и truthy `runActionOnSave` исполняет **`OnClientSave`**;
   затем в предусмотренных ветвях — глобальные after-save triggers.
4. Обновляет client snapshot и снимает `wasNeverSaved`.

`LdsPutDoc` сериализует XML и отправляет POST `/api/spxml/PutDoc`; явно добавляет
`DocUrl` и, для нового документа, `NeverSaved=1`. Не передаёт отдельными параметрами
`RunActionOnBeforeSave`, `RunActionOnSave`, `WriteDocInfo`, `WriteFt`, client snapshot
или version token. Нельзя из этого заключать, что сервер игнорирует данные XML
либо что эти флаги отсутствуют в C: исследован только клиентский producer запроса.

В этой реализации видны дополнительные ограничения: setter
`runActionOnBeforeSave` есть, но в прочитанном `Save` он не используется;
глобальные triggers читаются из `gXmConfig`, тогда как wrappers регистрации
(20247–20280) пишут в `gXmApplication`. Возможность связи этих контейнеров остаётся
неустановленной. Такие детали требуют отделять артефакт от идеального API-референса.

В `Save` нет `try/catch` с rollback вокруг записи и последующих callbacks.
Статически ошибка после успешной записи может прервать snapshot/reset этап;
предшествующая запись автоматически не отменяется видимым кодом.

**C, передано основным исследованием:** owned-проба дала `C` после `OnCreate`,
`CB` в сохранённом файле и `CBS` только в памяти после `OnSave`; исключение
в `OnSave` не отменило запись. Это непосредственное свидетельство порядка
**C hooks**; JS подтверждает лишь общий риск post-write ошибки на своём другом
пути. Код C-пробы: [02-values-and-hooks.bs](probes/02-values-and-hooks.bs).
Ошибку `Save` нельзя автоматически сообщать как «объект не изменился».

## 6. LastSavedData, авторизация и конфликты

**JS-static, J5/J9/J10:** parsing формы явно читает
`USE-CLIENT-LAST-SAVED-DATA`. `ResetLastSavedData` пропускает separate/без формы/
без этого флага, создаёт **элемент** схемы и копирует `topElem`, пропуская external
data (`skipExtData=true`). У нового документа snapshot строится до `OnCreate`,
у открытого — после загрузки до init-hooks, после `Save` — после client-hooks.
Это client snapshot, не перечитывание сохранённого сервером объекта и не lock.

Getter содержит подозрительную проверку **`lastSavedData` без `this.`**, затем
возвращает `this.lastSavedData`. Полнотекстовый поиск этого имени в артефакте не
обнаружил отдельного глобального объявления. Это статический дефект-кандидат,
не выполненная проверка исключения. `USE-LAST-SAVED-DATA` и `UseLastSavedData`
из деклараций нельзя приравнять к отдельному client-флагу.

**JS-static, J8/J10/J14:** входной XML `READ-ONLY="1"` выставляет
`accessReadOnly`, а `HasWriteAccess` возвращает отрицание этого флага. Метод
`XmElem.CheckReadOnly` (28461–28464) пуст. Серверные non-200 ответы обрабатываются;
HTTP 403 отображается как permission denied. Это признаки серверной границы
доступа, а не реализация прикладной авторизации, прав MCP-пользователя или
доказательство, что прямое изменение XML запрещено клиентом.

В просмотренных `XmDoc.Save`, `LdsLoadDoc`, `LdsPutDoc` нет compare-and-save,
передачи expected revision, `If-Match` или ветки обработки version conflict.
`XmOpenDoc` устанавливает `fetchOptions.tryLock=true`, но `LdsLoadDoc` не передаёт
этот флаг в запрос: уходят `DocUrl`, `Charset`. Это ограниченный отрицательный
результат по конкретному пути; серверная блокировка/политика вне файла неизвестна.

**C, передано основным исследованием:** сохранение ранее открытой копии silently
потеряло новое имя; несуществующий foreign ID принят. Эти наблюдения запрещают
обещать CAS или referential validation на проверенном пути. Наличие foreign
метаданных и `LastSavedData` таких обещаний тоже не создаёт.

## 7. Что JS помогает проверить дальше

Нужны отдельные native-проверки доступности каждого API: в текущем C исследование
не нашло `WriteFt`, `IsSeparated`, `SetXml`, хотя здесь имеются setters и
`XmElem.CallSetXml`. Последний очищает dynamic-элемент либо строит новый static-
элемент и присваивает его данные (J11); это полезное объяснение замены XML в JS,
но не разрешение вызывать отсутствующий C-метод.

Приоритеты сверки: runtime reflection vendor XMD; точный C-контракт options и
old/new модели; отдельные server/client hooks; persisted-state после исключения;
конфликты на сохранении; права конкретного субъекта; snapshot без external data.
Разделение источников здесь существенно: статический JS раскрывает алгоритмы
клиента, C-проба устанавливает только выполненный native-сценарий, а HTTP-сервер
и иные версии остаются отдельными границами исследования.
