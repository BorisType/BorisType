# Документ, XMD, каталог и бизнес-операция

Полный объект HCM имеет XML-представление. XMD задаёт структуру и исполняемое
поведение; XmlDocument связывает данные с формой, identity/URL и lifecycle.
TopElem — корень **данных**, Form.TopElem — корень **описания**. XmlElem —
платформенный объект, а не primitive JS. Каталог — отдельная projection для
запросов; SQL/provider storage не определяет контракт XML API.
Текущие MCP операции и причины XML-first — в [xml-objects](../mcp/xml-objects.md).

## Как различать схемы и представления

Legacy model регистрирует полный объект/каталог отдельно. Новая модель в
документации строит каталоги по типам/pluralization с исключениями DOC-ONLY.
На исследованном Linux C-runtime UseObjectTypes=false, ObjectForms пуст,
GetOptObjectForm был Unknown method, GetObjectFormUrl дал error. Это **недоступность
на этом стенде**, а не отсутствие новой модели во всей платформе. Явный form URL,
actual object form и проверенный registered catalog надёжнее предположения
`wtv_<singular>.xmd`. Прикладной exchange_object_types (414 элементов в пробе)
не доказан полным live registry. Component names могут быть qualified.

| Представление                      | Как использовать и чего не выводить                                                    |
| ---------------------------------- | -------------------------------------------------------------------------------------- |
| Полный объект cost_center          | Есть comment/subdivisions/custom_elems/doc_info; источник для whole replace            |
| Каталог cost_centers               | OnBuild projection; comment отсутствовал при наличии в полном документе                |
| Каталог-связка group_collaborators | Собственный synthetic row ID и group_id владельца; row.id не универсальный document ID |
| common/lists                       | Статические справочники, иногда string keys; не обязательно документы БД               |
| SQL/XQuery result                  | Произвольная проекция; наличие id не делает строку редактируемым объектом              |
| Сокращённая форма                  | Может скрывать поля; native save стирал скрытый массив и менял ссылку формы            |
| TopElem.Xml                        | Платформенный export с defaults/normalization, без обещания raw storage/binary backup  |

[Техническая запись XMD/catalog](../research/mcp/10-object-model/xmd-and-catalogs.md)
сохраняет vendor locators, docs URLs и примеры. В выборке 919 XMD strict parser
отверг 71 (repeated PARAM, raw operators, namespaces), хотя платформа грузила
зависимую форму. 434 CATALOG среди разобранных — нижняя оценка выборки, не полный
registry. SAMPLE, INHERIT и nested TYPE различаются; USE требует базового URL.
Не исправлять vendor SPXML регулярными заменами ради strict XML conformance.

## Defaults, scalar, массивы и foreign

String Value='' и integer Value=null оба имели HasValue=false; bool false/NULL-FALSE
нельзя свести к тому же JSON null. Clear убирал DEFAULT=7 в памяти, но reopen
после Save возвращал 7. LoadData менял только присутствующие данные (merge);
OpenDocFromStr+BindToDb replacement очищал пропущенное. SetXml из declarations
был недоступен на этом native carrier. PROPERTY вычисляет код и не обязано
сохраняться, TEMP в native файл не попал. Dump всех свойств не равен XML export.

NOT-NULL у тестового string не препятствовал empty Save; AddChild допускал
повтор PRIMARY-KEY; Save cost_center принимал dangling parent_id и OptForeignElem
давал undefined. Это ограниченные counterexamples, не отсутствие любых
validators/provider constraints. ObtainByKey и AddChild — разные операции;
первый нельзя аттестовать результатом второго.

FOREIGN-ARRAY может быть выражением каталога, static list или другого массива.
Его вычисление/dereference требует работы и может раскрыть дополнительные
данные/создать циклы. Возвращать raw reference; recursive expansion требует
явного ограниченного контракта. ForeignObjectUrl из declarations может строиться
без поиска; URL сам по себе не доказывает существование.
Custom_elems string[name,value] дополнительно зависит от template/default_value_eval;
custom cc_* типы — другой механизм. Fingerprint одного XMD не покрывает USE,
base-type dependencies и business configuration.

## Почему Save отличается от карточки UI

[XMS/XMD audit](../research/mcp/10-object-model/xms-and-business-logic.md) сохраняет
18 vendor hashes и locators, отдельно от native execution. Полезные различия:

- У сотрудника XMS проверяет fullname/login/duplicate login с условиями view,
  защищает роль/последнего администратора, предлагает уведомления. XMD hooks
  нормализуют данные/пароль, создают system event и очередь иерархии. Это разные
  слои; Save может выполнять бизнес-код, но не обещает все UI actions.
- У event SaveEvent(doc,false) до последнего условного Save уже вызывает webinar,
  virtual class и создание event_result/уведомлений. Это **не dry-run**. XMD
  OnBeforeSave тоже меняет related results и вызывает checker, но видимый код
  не проверяет возвращённый error так же, как SaveEvent.
- Delete UI может удалить вложенный ID, очистить связь, изменить related doc,
  удалить result либо отправить webinar action. Generic DeleteDoc не доказан
  эквивалентом этого cleanup, а DeleteElem не означает delete объекта БД.
- Группы имеют отдельные cache/queue actions, организация может обновлять
  связанные people, resource требует отдельного binary deletion пути.
- System events исполняют configured linked events/actions/handlers, иногда
  catch-and-continue. Наличие вызова не доказывает active handler и завершение
  всех внешних действий; queued work не закончена по одному Save success.

XMS не только authorization: он выполняет validation, prompts, updates и
интеграции. Screen/ActiveScreen/ListElem/view/last_data, CurAuthObject/current-user,
settings и resolver binding существенны. LibEducation source найден, но его
фактическая code_library binding не читалась. Field visible/required и
HasWriteAccess не устанавливают enforcement claims на arbitrary SOAP evaluator.
[Документация claims](https://wshcm-docs.boristype.dev/news/monolith/7158442922489027439.html)
различает top-level permission и вложенный server code; low-privilege native
проверка нужна отдельно. Authentication не означает UI-equivalent authorization.

## Commit, cache и неизвестный исход

[Owned native probes](../research/mcp/10-object-model/native-evidence.md) дали
trace C после OnCreate, CB в файле после Save и CBS только в памяти после
OnSave. OnBeforeSave exception сохранял прежние bytes; OnSave exception уже
оставлял новую запись. Это file XML evidence, не транзакция provider-а для
всех DB/catalog/hooks. Даже first-case не доказывает rollback side effects hook.
LastSavedData после Save содержал CBS и не является доказанным immutable disk
snapshot/monotonic revision/CAS. object_versions и modification.date тоже не
проверены как version precondition.

Две независимо открытые копии cost_center последовательно воспроизвели lost
update без conflict. Mutex MCP не охватывает UI/agents/other nodes. Отсутствие
compare-and-save в просмотренных paths не означает отсутствия любых lock API.
FetchDoc/cache/shared не выбирать как mutable рабочую копию без aliasing
контракта; cluster invalidation исследована отдельно не была.

[JS reference](../research/mcp/10-object-model/js-reference.md) с hash
`7ad30901c8b58de7255a38059e0793d2def16a9768e15ef603a8ea1a5e75e09c`
описывает **клиент**, не C-runtime: OnClientSave, USE-CLIENT-LAST-SAVED-DATA,
separate options, HTTP PutDoc и свой model flag. JS snapshot пропускает external
data; client BindToDb/options отличаются от declarations/C. Его отдельные
static defect candidates (getter без this, trigger containers) не подтверждены
runtime. [Types audit](../research/mcp/10-object-model/declarations.md) закрепляет
revision a3b1e43d0b2add53bbc1f2acc2c5128360e8c97b и противоречия/пропущенные
arguments. Ни JS, ни declarations не переносятся автоматически на native.

Owned trash→restore→permanent-delete проверены только для простого cost_center
без binary; source probes/manifests/sanitized observations и independent
cleanup receipts — в [research entry](../research/mcp/10-object-model/README.md).
Provider transactions, new model, Windows/MSSQL/cluster, business adapters и
binary cleanup остаются отдельными измеримыми проверками.
