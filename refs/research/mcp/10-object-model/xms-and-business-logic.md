> Датированное техническое evidence; текущие основания — [тематическая запись](../../../platform/object-model.md).
> XMS содержит права, validation, prompts и побочные бизнес-действия; его hooks не являются чистой авторизацией. Native execution этих business operations не проводился.

# XMS, XMD hooks и бизнес-операции над объектами

Дата: 2026-11-08. Статическое исследование поставляемых исходников для будущих
MCP-инструментов создания, изменения и удаления объектов системной БД. Реализация
инструментов здесь не предлагается как готовый контракт.

**Основной вывод:** XMD описывает больше, чем поля, а XMS — больше, чем внешний
вид формы. Форма проверяет права и значения, вызывает бизнес-библиотеки,
поддерживает связанные документы и отправляет уведомления. Сохранение документа
нельзя объявлять эквивалентом сохранения карточки в UI. При этом утверждение
«обычный Save не запускает никакой бизнес-логики» тоже неверно как описание
поставляемого кода: XMD содержит отдельные save hooks с существенными действиями.
Какие из этих hooks вызываются конкретным серверным способом сохранения,
проверяется отдельными native-пробами; одного имени свойства недостаточно.

## Источники и границы доказательства

Исследован образ `websoft/hcm:2025.2.1333`, image ID и RepoDigest
`sha256:0edeac24afc2a5371ea8431c59b1c17ca2b1a9e5a3768275cfdb5023609e34ab`.
Общая сборка стенда: `2.25.12.4 [202512041524]`; версия сборки взята из общего
контекста исследования, image ID и digest независимо сверены через Docker metadata.

Выбраны 18 файлов из `/WebsoftServer/wtv/`. Они скопированы **из** контейнера
`boristype-c-runtime-net9-wt-1` через `docker cp` в локальный каталог вне git:

`/home/agent/workspace/wshcm-stand-net9/research/object-model-20261108/xms-agent/`

Там находятся `manifest.json`, `SHA256SUMS` и `wtv/` с исходниками. Первое
наблюдение контейнера показало `exited`; позднее root запустил стенд для своей
отдельной серии проб. Этот статический аудит не запускал контейнер, не выполнял
`docker exec`, платформенный код или запись внутрь контейнера. Vendor source,
настройки, credentials и данные БД в git не добавлены.

Все ссылки вида `wtv/имя:строка` ниже относятся к этим исходным байтам, с BOM и
CRLF; строки нумеруются с единицы. Это **evidence из реализации**, а не результат
выполнения C-runtime. Внешняя документация и TypeScript declarations здесь не
используются как доказательство поведения. Проверки транзакционности, вызываемых
hooks, RPC-авторизации и реальных интеграций этой заметкой не выполнялись.

Код обращается к библиотеке по коду `libEducation`. В поставке найден
`wtv/libs/event_library.js` с соответствующими функциями; текущая запись
`code_library`, связывающая `libEducation` именно с этим файлом, не читалась.
Ниже это явно рассматривается как найденная поставляемая реализация, а не как
проверенный на текущей БД resolver binding.

## Разные уровни одного изменения

| Уровень                     | Конкретное свидетельство                                                                     | Следствие для исследования CRUD                                                   |
| --------------------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| XMD поля и наследование     | `wtv_collaborator.xmd:12` наследует `person_base`; `wtv_general.xmd:85` задаёт поля человека | Тип поля и наличие значения ещё не описывают бизнес-валидность.                   |
| XMD lifecycle hooks         | `wtv_collaborator.xmd:682` — `OnBeforeSave`; `:653` — `OnSave`                               | Прямое документное сохранение потенциально имеет побочные эффекты.                |
| XMS lifecycle actions       | `wtv_collaborator.xms:133` — `BEFORE-SAVE-ACTION`; `:186` — `SAVE-ACTION`                    | Скрипт формы нельзя считать автоматически выполненным при серверном `doc.Save()`. |
| XMS control actions         | `ms_general.xms:3506` — email validation в `SET-VALUE-ACTION`                                | Проверка при редактировании контрола отличается от присваивания XML-поля.         |
| Бизнес-библиотека           | `libs/event_library.js:9963` — `SaveEvent`                                                   | Сервисный helper может затронуть несколько документов и интеграций.               |
| Каталожная проекция         | `wtv_group_collaborators.xmd:28` — `OnBuildExt`; `:70` — `OnDeleteExt`                       | Производная строка не равна самостоятельному объекту/команде включения в группу.  |
| LDS server access callbacks | `wtv_view_main.xml:1514` — `OnCheckWriteAccess`                                              | Авторизация зависит от пути вызова и контекста.                                   |
| Настраиваемые события       | `ms_tools.xml:365` — `raise_system_event`                                                    | Последствия save зависят от установленной конфигурации событий и обработчиков.    |

## Пример 1: карточка сотрудника

### Проверки и ограничения самой формы

`wtv/wtv_collaborator.xms:3` сначала вызывает
`ms_tools.check_doc_screen_access(TopElem)`. Затем вычисляет `view.is_admin` из
текущего пользователя, а в `:130` — видимость секций access/auth. В частности,
отсутствие `tools.cur_user_id` в этом коде ведёт к `view.is_admin = true`.
Это наблюдение о ветке кода, а не разрешение использовать пустого пользователя
как эквивалент администратора в будущем MCP.

В `BEFORE-SAVE-ACTION` (`:133–185`) форма:

- Запрещает изменение собственных login/password/`access.is_arm_admin`, возвращает
  прежние значения из `last_data` и вызывает `Cancel()`.
- Запрещает неадминистратору сохранять сотрудника, у которого прежняя роль была
  `admin`, и назначать роль `admin` другому сотруднику.
- Требует непустое после `Trim` значение `fullname`.
- Требует непустой login только при `view.disp_auth`.
- При `view.disp_auth` ищет другой объект с тем же login через XQuery и отменяет
  сохранение при совпадении.
- При другом сотруднике с тем же `fullname` запрашивает подтверждение. Это
  допускаемое пользователем совпадение, а не безусловная уникальность ФИО.
- Вызывает `TopElem.view.desc_save()` для содержимого редактора.

`fullname` при этом является вычисляемым `PROPERTY="1"` в
`wtv_general.xmd:24`, на основе lastname/firstname/middlename. `login` и
`password` в `wtv_general.xmd:103–104` объявлены обычными string без `NOT-NULL`.
Следовательно, правило формы о login нельзя получить, просто прочитав флаг
nullable. Это не доказывает, что иной server API позволит сохранить пустой login:
другие уровни enforcement и runtime этой проверкой не охвачены.

Отдельные `SET-VALUE-ACTION` в `wtv_collaborator.xms:966` и `:982` защищают
последнего ARM-администратора при изменении роли/флага. В `:992–1013` выбор одного
из `is_arm_admin`/`is_content_admin`/`is_application_admin` сбрасывает другие.
Произвольный XML patch автоматически этот control action не воспроизводит.

### Действия формы после сохранения

`wtv_collaborator.xms:186–243` обновляет UI screens, при снятии должности очищает
`basic_collaborator_id` в другом документе должности через `ObtainUiDoc` /
`UpdateUiDoc`, предлагает уведомления `7` и `11` при изменении authentication/
blacklist-данных, обновляет `last_data`, текущего пользователя и при `pol_changed`
запускает `BuildPersonObjectLinks`. Это различающиеся действия, часть из которых
требует интерактивного выбора. Значение `NeverSaved` в `SAVE-ACTION` нельзя
интерпретировать без проверки порядка callback относительно изменения этого флага.

### Отдельные действия XMD

`wtv_collaborator.xmd:682–835`, `OnBeforeSave`:

- Сравнивает position с текущей каталожной строкой и выставляет временный
  `view.drop_pers_hier_entry`.
- Заполняет/очищает name/parent/org, связанные с должностью, и отображаемые имена
  подразделения/организации; при недоступной ссылке может ставить маркер удаления.
- При настройке `password_auto_rebuild` вызывает `tools.make_password`.
- При настройках заполняет path подразделений и журнал изменений человека.
- Вычисляет `current_state` из увольнения и истории состояний.
- Сбрасывает picture cache, нормализует СНИЛС через `libMain`, поднимает
  `common_save_collaborator`, затем обновляет `last_data`.

`OnSave` (`:653–680`) при установленном флаге отправляет сообщение в
`person-hierarchy-update-queue` и сбрасывает флаг. Синхронное завершение `Save`
не доказывает завершения работы потребителя очереди.

Порядок внутри `OnBeforeSave` виден непосредственно: вызов системного события
находится **до** обновления `last_data`. `SAVE-ACTION` формы использует тот же
`last_data` для сравнения изменений. Это основание отдельно проверить серверный
и UI-контекст lifecycle; вывод о точном взаимном порядке этих callback здесь
не делается. Порядок тегов в XMD тоже не является расписанием: `OnSave` в файле
расположен раньше `OnBeforeSave`.

## Пример 2: мероприятие и участники

### Что добавляет XMS поверх XML

`wtv_event.xms:16–61`, `BEFORE-SAVE-ACTION`, последовательно:

1. Сбрасывает user-data marker `skip_check_fields_<id>`.
2. При пустом name спрашивает пользователя и может подставить имя по умолчанию.
3. Достраивает finish date/type ID, очищает элементы, сохраняет editor state.
4. Ставит `need_create_results = true`, обновляет типы результатов при изменении
   default result type.
5. Вызывает `libEducation.SaveEvent(TopElem.Doc, false)`; по возвращённому `error`
   показывает сообщение и отменяет сохранение.
6. Вызывает `change_tutor_list`, `change_even_preparation_list`,
   `change_lector_list`.

`SAVE-ACTION` (`:62–66`) перечитывает объект и `event_results`, затем вызывает
`libEducation.AfterSaveEvent`. `change_*_list` в `wtv_event.xmd:718–812` сравнивают
списки с временными `view.*` snapshots и при настройках вызывают уведомления
`51–56`. Простое присваивание массива не описывает эти уведомления или snapshots.

### Почему `SaveEvent(doc, false)` не является dry-run

Найденная реализация `libs/event_library.js:9963–10107`:

- Получает временный marker `SaveEvent_<id>` через `get_set_user_data`; ожидает
  освобождения с ограниченным числом повторов. Это конкретный механизм helper,
  а не доказанный транзакционный lock всех writers.
- Проверяет `tools.check_event_fields` и обрабатывает его error.
- При online event/webinar может вызвать `NeedCallSaveMethod`, `onEventSave` и
  изменить webinar settings.
- Для virtual class может вызвать `CreateVclassSetting`, получая conversation ID.
- При `need_create_results` вызывает `create_results()` и сбрасывает флаг.
- Только затем, если `bNeedSave`, выполняет `docEvent.Save()` и `AfterSaveEvent`.

Таким образом, `false` отключает последнюю собственную пару Save/AfterSave,
но **не** предыдущие действия. XMS именно так использует helper перед своим
сохранением. `AfterSaveEvent` (`:10135–10202`) отдельно может вызвать webinar
`NeedCallAfterSaveMethod` и `onAfterEventSave`.

`wtv_event.xmd:710` передаёт `create_results` в `CreateResultsEvent` библиотеки.
Найденная реализация `libs/event_library.js:1795–2037`:

- Создаёт недостающие документы `event_result`, делает filling, копирует
  admin access, BindToDb и Save каждого документа.
- Отправляет уведомления `23`, `25` и `common_event_add_participant` при
  соответствующих настройках и состоянии.
- Для удалённых участников отправляет `24`, поднимает
  `common_event_delete_participant`, вызывает webinar `onUserRemove`, затем
  удаляет документы результатов.
- Может очистить cost centers или expense items результатов при изменении
  distribute cost type; сохраняет изменённые документы результатов.

Следовательно, вызов перед сохранением основного события может уже выполнять
многодокументные записи и внешние действия. В видимом коде нет общего rollback
этих действий при последующей ошибке. **Это не доказывает отсутствие транзакций
в платформе**, но исключает обещание атомарности на основании этого исходника.
Существуют catch-and-continue ветки, поэтому отсутствие exception наверху также
недостаточно как доказательство выполнения всей бизнес-операции.

### Что отдельно находится в XMD hooks

`wtv_event.xmd:2021–2084`, `OnBeforeSave`, пересчитывает статистику обучения,
чистит вложенные educ groups, обновляет name/start date в уже существующих
`event_result` с Save каждого документа, заполняет education org name, вызывает
`check_event_fields`, при `need_create_results` создаёт результаты и поднимает
`common_save_event`.

Критическое отличие видно в коде: возвращённый `oResult` из `check_event_fields`
в этом hook присваивается, но не проверяется. Напротив, `SaveEvent` проверяет
`oResCheck.error`. Предшествующее обновление результатов стоит до этой проверки.
Нельзя считать эти два пути равнозначным validation contract.

`OnSave` (`:2086`) при conversation ID вызывает `libChat` для обновления
участников. `OnClientSave` (`:2115`) может перечитать объект; `OnLocalInit`
(`:2122`) создаёт snapshots. `need_create_results` (`:602`) имеет DEFAULT=false
и не помечен TEMP: присваивание `collaborators` само по себе не означает,
что флаг станет true.

`tools.check_event_fields` (`wtv_tools.xml:23018–23093`) зависит от user-data
marker, online event type и подключённой webinar system; может вызвать её
`CheckFields`, принять обратно изменённый `teEvent`, установить marker с TTL 10
и вернуть error/message. Результат зависит от контекста и интеграции.

## Пример 3: группа и организация

`wtv_group.xms:5` в before-save только сохраняет editor state, однако
`SAVE-ACTION` (`:7`) дополнительно обновляет группы текущего пользователя,
screens и при флаге запускает `BuildPersonObjectLinks`. XMD `OnSave`
(`wtv_group.xmd:302`) независимо очищает provider user-data с префиксом
`user_groups_*` и ставит сообщение `update_conversation_participants` в очередь.
Обновление видимого списка, cache invalidation и фоновые участники разговора
относятся к разным механизмам с разными признаками завершения.

`wtv_org.xms:4–19` предлагает заполнить `disp_name` из `name` или отменить
сохранение, затем сохраняет editor state. В `SAVE-ACTION` (`:20`) условно вызывает
`tools.update_document_persons`, если установлен `view.do_update_document_persons`.
Следовательно, изменение имени организации может предполагать отдельное
обновление связанных людей; одного сохранения нового string в XML недостаточно
как доказательства выполнения этого UI-действия.

## Удаление: документ, элемент массива и бизнес-операция

В XMS одинаковая UI-кнопка удаления может обозначать разные действия.

| Пример                                                      | Найденное действие                                                                                                  | Что не следует обещать автоматически                                       |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `wtv_org.xms:65` — удалить сотрудника из списка организации | `clear_subs_fields()` в документе сотрудника + `UpdateUiDoc`                                                        | Это не DeleteDoc сотрудника.                                               |
| `wtv_group.xms:203` — удалить позицию из группы             | Удалить position ID из вложенного массива; удалить строку collaborator, если позиций больше нет                     | Это не удаление position из БД.                                            |
| `ui_tools.xml:98` — `list_elem_delete_action`               | Проверить EditMode, `ListElem.Delete()`, пометить Doc изменённым                                                    | Это не полная очистка связанных бизнес-объектов.                           |
| `wtv_event.xms:1484` — удалить участника                    | Проверить право delete на `event_result`, затем вызвать list helper                                                 | Право изменять event не описывает все требуемые права на side effects.     |
| `libs/event_library.js:815` — `DeletePersonFromEventXmd`    | Webinar onUserRemove; удалить вложенного участника; условно Save; событие; удалить event_results; условно уведомить | Это отдельная бизнес-команда с несколькими последствиями.                  |
| `wtv_event.xmd:1786` — `remove_collaborator`                | Удалить child, Save event, найти и удалить один result; catch возвращает false                                      | Даже два поставляемых helper одного намерения имеют различающуюся очистку. |

`ms_tools.view_delete_doc` (`ms_tools.xml:118–363`) демонстрирует ещё один уровень:

- Сначала запрещает linking views и проверяет LDS delete access.
- Для collaborator запрещает удаление себя и последнего ARM admin.
- Для forum удаляет forum entries; для forum_entry рекурсивно удаляет потомков.
- Для document очищает `parent_document_id` у дочерних документов и сохраняет их.
- Для document_comment_entry может физически удалить ветвь или лишь установить
  `deleted=true` в зависимости от UI-выбора.
- После `DeleteDoc` события отдельно удаляет все его `event_results`; ошибки
  отдельных удалений перехватываются, общий возврат может оставаться true.

Этот helper имеет `CALLER-ENV="1"` и использует `ListElem`, `ActiveScreen`,
`Screen`, `TopElem`; механическое выполнение вне UI не является готовым API.
Наличие этих действий в helper не доказывает, что прямой `DeleteDoc` не имеет
дополнительных platform hooks. Однако переносить cleanup helper на DeleteDoc
без отдельной проверки тоже нельзя.

`OnDeleteExt` в `wtv_events.xmd:153` удаляет catalog entries по `SrcDocID/id`;
`wtv_group_collaborators.xmd:70` — по `SrcDocID/group_id`. Это явная очистка
каталожной проекции, а не показанное удаление event_results, collaborators или
forum documents. Отсутствие runtime-проверки этих hooks здесь отмечается отдельно.

## Права и контекст вызова

Вызов формы использует `ms_tools.check_doc_screen_access`
(`ms_tools.xml:1355–1400`), который обращается через `CallServerMethod` к
`tools_auth.check_lds_access_obj` с `create` для NeverSaved и `read` для остальных.
Открытие карточки этим кодом не является самостоятельным подтверждением write.

`wtv_view_main.xml:1478` и `:1514` задают `OnCheckReadAccess` /
`OnCheckWriteAccess`. Write callback проверяет read_only, стандартные удаляемые
объекты, `doc_info.invariable` с учётом interface mode, затем
`check_lds_access_obj(Doc, write/delete)`; для collaborator журналирует изменения
access fields. По исходнику это callbacks LDS; вызов их из любого server-side
BorisScript или SOAP eval автоматически не доказан.

`wtv_tools_auth.js:261–548` показывает, что решение не сводится к роли строкой:
используются `CurAuthObject`, object-specific admin access, content access,
ARM/application admin, access role claims, каталоги/блоки, access level.
`ms_tools.xml:3688–3753` дополнительно проверяет access blocks и object_claims
приложений; `:3777` — обёртка текущего пользователя по именам каталогов.

Для будущего tool отдельно требуется определить, **чьи** полномочия действуют:
авторизованного пользователя транспорта, `CurAuthObject`, `tools.cur_user_id`,
service account или явно переданного субъекта. Эти переменные нельзя считать
взаимозаменяемыми. Сообщение об успешном сохранении не доказывает, что те же
field/object restrictions UI были применены.

Значимые зависимости контекста в найденном коде:

| Контекст                                             | Зачем требуется                                                |
| ---------------------------------------------------- | -------------------------------------------------------------- |
| `TopElem`, `Doc`, `Child(0).Parent`                  | Объект, форма и scope вычисляемого XMD-свойства.               |
| `Screen`, `ActiveScreen`, `ListElem`, `NewValue`     | UI actions, dialogs, edit mode и выбранная строка.             |
| `view.*`, `last_data`                                | Временные snapshots, сравнение изменений, flags.               |
| `CurAuthObject`, current-user helpers, claims        | Проверка прав, логи и параметры системных событий.             |
| `global_settings`, `common`, `local_settings`        | Ветвление правил, уведомлений, UI и defaults.                  |
| `LdsIsServer`, user-data markers, `CallServerMethod` | Различие клиент/сервер, кэши, RPC и координация.               |
| `DefaultDb`, provider queues, code-library resolver  | Привязка созданных связанных документов и отложенные действия. |

## Требуемость, control validation и конфигурация

Из `NOT-NULL`, `DEFAULT`, `NULL-FALSE`, `is_required` и `mandatory` нельзя сделать
один общий флаг «поле обязательно при создании объекта» без указания слоя:

- У сотрудника непустой ФИО/login проверяет XMS с условиями, которых нет в
  string-декларации `person_base`.
- `ms_general.xms:3506` рисует `*` при `is_required`, а email validation вызывает
  `libMain.check_email_value` именно в `SET-VALUE-ACTION`; это не показанный
  универсальный server validator required-полей.
- В `ms_tools.xml:6023`/`:6103` `mandatory` из описания формы переносится в
  `is_required`. Наличие metadata не доказывает enforcement во всех путях записи.
- Для event результат validation может зависеть от подключённого webinar API
  и временного marker (`wtv_tools.xml:23018`).

Будущему описателю полей полезно разделять schema default/nullability,
UI required hint, конкретный validator и business precondition, сохраняя
происхождение и условие правила. Статическое извлечение JS-условия не делает
его безопасным универсальным валидатором.

## Настраиваемые события и порядок

`ms_tools.raise_system_event` (`ms_tools.xml:365–575`) выбирает активные
`system_events` по коду, открывает объект, проверяет условия через eval, сначала
вызывает linked system event, затем sections/actions, затем handlers.
Actions могут выполнять код, журналировать, создавать notification, запускать
operation, создавать и сохранять statement. Handlers могут загрузить code URL
или встроенный код и выполнить BS либо C#. Несколько веток перехватывают ошибки
и продолжают выполнение.

Поэтому перечень действий `OnBeforeSave` не замыкается статическим XMD:
`common_save_collaborator`/`common_save_event` может расширяться конфигурацией
конкретной БД. Наличие вызова события не доказывает, что в demo/production
установлен хоть один активный обработчик. Полный порядок между XMS actions,
native Save, catalog build, XMD hooks, triggers и commit этой заметкой не установлен.

Отдельно `wtv_view_main.xml:1200` регистрирует `trigger_onsavedoc`;
`ms_tools.xml:1592` вызывает `tools.create_object_version(Doc)` для `/objects/`.
Это ещё одна причина проверять, какие initialization и triggers реально действуют
в выбранном carrier. Нельзя из этого исходника обещать versioning для любого save.

## Следствия для проектирования будущих инструментов

1. Нужны два явно описанных намерения: документное изменение и бизнес-команда
   (например, добавление участника события). Называть generic patch полным
   повторением карточки UI нельзя.
2. Каталожные relation rows следует распознавать как производные представления
   владельца. Наличие ключа/каталога не доказывает существование отдельного XML
   документа, который можно открыть и удалить по ID этой строки.
3. В mutation contract требуется указать enforcement прав, validators, hooks,
   уведомлений, связанных документов и интеграций. Неизвестность должна оставаться
   явной, а не заменяться «стандартным Save».
4. Dry-run не должен реализовываться через вызов бизнес-helper с `bNeedSave=false`:
   конкретный `SaveEvent` уже опровергает такую трактовку.
5. Array patch должен отличать вложенный элемент, ссылку на объект и самостоятельный
   связанный документ; удаление child не означает business cleanup.
6. Retry после timeout опасен для notification/external side effects и не имеет
   доказанной идемпотентности. Счётчики очередей и success-флаг не подтверждают
   завершённость всех зависимых действий.
7. Предпросмотр последствий потребует профилей типов/операций и сведений о текущих
   обработчиках/интеграциях. Универсальное XML-schema reflection этого не решает.

Ничего из этого не требует сейчас переносить UI engine в MCP или копировать
vendor helpers в проект. Это границы доказательства и список вопросов к будущему
контракту.

## Что осталось проверить отдельно

- Порядок XMD hooks, catalog build, write-access callback, registered trigger и
  commit для конкретного server-side API, включая `last_data` и NeverSaved.
- Поведение save с выключенными/пропущенными hooks, если поддерживаются такие
  options; неизвестные опции не следует выдумывать по названию.
- Реальное действие schema nullability/defaults и required hints для создать/
  очистить/удалить значение, отдельно от полей формы.
- Текущую привязку `libEducation`, active system events/handlers и фактические
  claims выбранного transport user.
- Границы транзакции многодокументных записей, результаты ошибки на втором шаге,
  сохранность уже отправленных notifications и внешних запросов, способы repair.
- Runtime cleanup при прямом DeleteDoc; soft/trash/hard delete и восстановление
  связанных объектов/проекций, включая то, что дополнительно делает платформа.

Эти вопросы не проверялись запуском vendor business operations в рамках данного
статического аудита. Исходники достаточно убедительно показывают наличие разных
путей и их локальный порядок, но не доказывают межслойные runtime-гарантии.

## SHA256 выбранных файлов

Пути относительно `/WebsoftServer/`. Полный machine-readable manifest остаётся
в локальном evidence-каталоге, vendor source — вне git.

| Файл                              | SHA256                                                             |
| --------------------------------- | ------------------------------------------------------------------ |
| `wtv/wtv_collaborator.xms`        | `57311256057789701dfa2b2eae9eaba679eabcb4bb01e97f4d232617ac1f9a02` |
| `wtv/wtv_collaborator.xmd`        | `583b5f216e63680c8095e2164a8de995770fdc1df00e4055ae21f72c7be6a99f` |
| `wtv/wtv_group.xms`               | `93f58bbc1543854bf5cb9e519ea1ec03ab578f1f79fe8b4dfedab0644ce5a285` |
| `wtv/wtv_group.xmd`               | `7b6ae8b28b637bf1be0160b6cb678a9a47ef058e8b6f3db09812f2285aff70f1` |
| `wtv/wtv_org.xms`                 | `47599414f278dda2f99f54113c3e9722be7d18c1ed3f0c58a2ae7f2d2d718f77` |
| `wtv/wtv_event.xms`               | `db7fdd20cced8a0a21ec28351804edcf10884cf20cf65a03eb49ca57d5414518` |
| `wtv/wtv_event.xmd`               | `31ac4cae38b5f713b5c26072a3a660fc35acff06f0c0bf17ac4dcb6b1c70d528` |
| `wtv/wtv_events.xmd`              | `acf5bbdfb54ebb8861de6df3e156b96a0303c2258d0678a2522a9e3c9fd99c00` |
| `wtv/wtv_group_collaborators.xmd` | `fb243572d7aaa978b46baf75bedb17fd96e9844d542155656765c64f18523128` |
| `wtv/ms_general.xms`              | `b9c9e0ae403b765d4a187abf794d08fe261a5bd7a2a992fce89ce3fb7218c5de` |
| `wtv/ms_general.xmd`              | `954847f3cc4a2c93dc1582a7f7f85c9b0225512f51023a46362a01dc847648d8` |
| `wtv/wtv_general.xmd`             | `f4cd5b32f094ae5f212591bf08afdf2ec0a6fe072b9e77a898f160d99986969d` |
| `wtv/ms_tools.xml`                | `37d6458010f2bc42b844ed264642f03c9b1e78a4186006c64ad8c875d59d3f50` |
| `wtv/ui_tools.xml`                | `1d48aa18302850da726a36367a2aa14e54dd550ad4bf71f23d214c6b27c1d94c` |
| `wtv/wtv_tools.xml`               | `1addfe3642811ad749210580b251c62a318ccca2cab8b396470c4bc13348fc5b` |
| `wtv/wtv_tools_auth.js`           | `54e286e2f1ea67a507ebd60ea927375ed1b06cdfb8d1ff2cc6f4ac2a8a3ffe0a` |
| `wtv/wtv_view_main.xml`           | `ff768c0c0e3ce8069f3fdbd9fbad01dfb6590d4ca86873da634949255c58b8d3` |
| `wtv/libs/event_library.js`       | `5fef33bb0a60ed346676831afbfe085fd5e317ca9a81625e9cd9cfa4061127ca` |
