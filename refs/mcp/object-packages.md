# Пакеты объектов: контракт и основания

Статус на 2026-11-17: SDK и десять MCP tools реализуют схемы → ZIP → immutable
preview → import/status без браузера. Объектный путь принят на Linux C/PostgreSQL;
дополнительные типы, flags и ограничения evidence перечислены ниже. Исходные
маршруты исследования сохраняются в [журнале администратора](../platform/admin-journal.md).

## Что находится на клиенте и сервере

На исследованном HCM 2025.2.1333 схема и собранный архив — разные сущности:

- Схемы хранятся в общем логическом документе
  `x-local://<DefaultDb>/lists/wtv_package_objects.xml`, форма
  `x-local://wtv/wtv_package_objects.xmd`. В одном документе несколько схем,
  у каждой строковый id, имя, объекты и дополнительные настройки. Физический
  файл по этому URL не обнаружен; это не основание обходить URL storage.
- Текущая схема интерфейса выбирается через `local_settings.package_id`.
  Нельзя считать её изолированным состоянием конкретного MCP-вызова.
  Видимость и права между разными учётными записями отдельно не проверены.
- XMS управляет окном, выбором и сохранением схемы. Добавление объектов вызывает
  `tools.add_object_to_package`; с явными schema/options возможен вызов без UI.
- «Сохранить полный пакет» вызывает `ms_tools.create_package_objects`, который
  обращается к серверному `tools.create_list_package(resultUrl, schema)`.
  Веб-клиент затем открывает полученный временный URL для скачивания.
- «Создать пакет в базе» дополнительно создаёт `upload_package`. Это может
  участвовать в обмене между серверами; экспорт ZIP не должен выполнять эту
  операцию неявно.
- При загрузке веб-клиент отправляет multipart POST на
  `/spxml_web/service/upload_file.htm?json_response=1`. Ответ содержит относительный
  `Url`; UI обращается к архиву через `x-local://share/uploaded_files/<Url>`.
  Сессионные заголовки/токены не являются частью предлагаемого публичного API.
- Просмотр вызывает `tools.get_package_log(url, options)` и возвращает native
  XML-форму `view_package`. После выбора элементов UI вызывает
  `tools.uni_process_package(url, form)`, далее `process_package` /
  `download_package` / `package_process`. Архив распаковывается на сервере.

Таким образом, браузер организует диалог, а сборку ZIP, чтение пакета и применение
выполняет серверная платформа. Не нужно воспроизводить пользовательские клики в MCP.

## Важные границы штатных функций

- Внешний ZIP содержит `desc.xml` и вложенные ZIP; объектный вложенный ZIP содержит
  `update.xml`. Проверенный объект имел в XML hex id, в API его нужно выдавать
  точной десятичной строкой.
- `modify` в схеме соответствует «Редактируемый», а не выбору включения объекта.
  `create_inst_package` передаёт его как обратный `bInvariable`.
- Штатное добавление умеет включать ресурсные файлы объекта, категории (`role_id`),
  вопросы разделов assessment и foreign objects. Категории объекта и глобальные
  **роли доступа** — разные настройки.
- Документация описывает рекурсивное добавление связанных объектов. В исходнике
  этого стенда обходятся вложенные поля, но добавление foreign object вызывается
  с `add_foreign_elem_objects: false`. Полное транзитивное замыкание зависимостей
  не подтверждено и не должно обещаться по названию флага.
- Штатный обход читает `ForeignArrayCodeStr` полей формы и распознаёт только часть
  объявленных foreign arrays. Он не устанавливает смысл произвольного строкового
  значения. Пользователь уточнил два важных пропуска: hex-ссылки в `wvars` объектов
  `custom_web_template` / `override_web_template` и связь шаблонов с «Типом страницы»
  (`web_mode`) через строковое поле `mode`. Статически подтверждено на этом стенде:
  у обоих видов шаблонов `mode` имеет `TYPE="string"` без `FOREIGN-ARRAY`, при этом
  явные ссылки вроде `custom_web_template_id` / `include_custom_web_template_id`
  объявлены с foreign array. Оба шаблона наследуют `web_variables_base`.
  Значения реальных `wvars` и полнота прикладных связей отдельной пробой не проверялись.
- В `wtv_package_objects.xms` BEFORE-INIT выполняет `fldPackage.files.Clear()`.
  Это статическая находка; сохранение/повторное открытие файловых вложений в
  именованной схеме не проверено. Не обещать их долговечность до отдельной пробы.
- `create_list_package` возвращает `error/error_text/counter`, но отдельные ошибки
  сборки перехватываются, а ошибки файлов могут уходить в `alert`. Нужна проверка
  полученного ZIP и соответствия запрошенному составу, а не только `error == 0`.
- Импорт возвращает число обработанных **вложенных пакетов**. `package_process`
  перехватывает ошибки отдельных объектов и пишет их в отчёт, продолжая работу.
  `progress_count == list_count` не доказывает успешное применение каждого объекта.
  Общая транзакция/rollback не подтверждены; есть последовательные `Save` и
  постобработка, которая зависит от каталога.
- Штатный UI предупреждает о другой версии сервера, ранее загруженном package id
  и конфликте id с другим типом объекта. Выбор new id может потребовать согласования
  ссылок; первая версия API не должна автоматически перенумеровывать объекты.
- `get_package_log` извлекает архив во временные каталоги: preview имеет временные
  побочные эффекты, хотя не применяет объекты. Флаг очистки и отмена UI оставили
  некоторые каталоги на этом стенде; причина не локализована. Удалять можно только
  однозначно принадлежащие операции пути, проверяя фактическую очистку.

## Выбор API первой версии

Выбор — работать со штатными схемами через серверные функции и возвращать локальные
артефакты MCP. Альтернативы: автоматизация браузера привязана к текущему окну и
сеансу; отдельный собственный формат схем не виден в админке и дублирует модель.

Логика платформы и хранение локальных архивов располагаются в `ws-client`; MCP
регистрирует те же schemas и сериализует результаты. Названия операций:

| Операция                 | Смысл и результат                                                                  |
| ------------------------ | ---------------------------------------------------------------------------------- |
| `list_package_schemas`   | Список штатных схем: id/name/count/revision, без переключения UI                   |
| `get_package_schema`     | Состав по schemaId, настройки, revision; большие списки постранично                |
| `save_package_schema`    | Создать именованную схему или изменить имя, настройки и editable прочитанной схемы |
| `add_package_objects`    | Добавить objectIds в schemaId с явными опциями категорий и связанных объектов      |
| `remove_package_objects` | Удалить перечисленные objectIds из schemaId, сохранив сами объекты в базе          |
| `delete_package_schema`  | Удалить явно указанную прочитанную схему                                           |
| `export_package`         | schemaId или objectIds/customTemplates → штатный ZIP → локальный artifact и отчёт  |
| `inspect_package`        | artifactId/localPath → неизменяемая копия ZIP → состав, конфликты, inspectionId    |
| `import_package`         | inspectionId + optional subset → импорт объектов и отчёт                           |
| `get_package_operation`  | Состояние операции, известные этапы, native ids/reports, артефакт                  |

У MCP имена получают префикс `wshcm_`; strict schemas экспортированы SDK.
«Открыть сохранённую схему» означает получить её по id. MCP не меняет выбор в
чужом окне; UI сможет выбрать ту же сохранённую схему после обновления.

Все операции со схемами используют явный `schemaId`; имена не считаются уникальными.
Создание сохраняет схему сразу. Редактирование добавляет/удаляет элементы по id,
не заменяя молча соседние схемы в общем документе. Перед сохранением нужно заново
прочитать весь документ и проверить revision. Локальная сериализация и hash recheck
уменьшают lost updates, но не дают atomic CAS относительно администратора/другого
процесса. После попытки записи требуется свежий read.

По умолчанию добавляются только перечисленные объекты. Дополнительные файлы,
категории, связанные объекты и глобальные настройки включаются явно; ответ
показывает фактически полученный состав. Не обещать полноту переноса зависимостей.

Добавление/удаление состава выполняется отдельными `add_package_objects` /
`remove_package_objects`. Полная замена списка не является основным API.
У добавления есть явные `includeCategories` и `includeRelatedObjects`, соответствующие
штатным опциям «Включать категории» и «Добавлять связанные объекты». На этом стенде
они передаются как `add_roles` и `add_foreign_elem_objects`. `includeCategories`
не означает включение глобальных ролей доступа. `includeRelatedObjects` обозначает
штатный обход объявленных в XMD связей, с указанными выше пропусками; ответ показывает
фактический результат и известные пропуски. Собственное разрешение прикладных связей
должно в будущем включаться отдельным флагом/стратегией, независимо от штатного.
Примеры для такой стратегии: известные ссылочные wvars и сопоставление `mode` с
`web_mode`, включая нужное направление обхода. Она требует правил по типу объекта
и полю, объяснения каждой добавленной зависимости, дедупликации, пределов обхода
и проверки существования/типа цели. Любая hex-строка сама по себе не доказывает
ссылку на объект. Эта стратегия пока не реализуется в первой версии.
При удалении меняется только список схемы; связанные объекты и категории удаляются
из него только при явном перечислении их id, без автоматического каскада.

Схема хранит ссылки на объекты, поэтому последующий экспорт получает актуальные
данные; только ZIP фиксирует полученное содержимое. Снимок списка объектов не даёт
общего транзакционного снимка их данных: штатная сборка читает объекты последовательно.

## Прямая выгрузка по IDs

`export_package` принимает сохранённую схему по `schemaId` и ревизии или прямой
список `objectIds` и/или `customTemplates`. Для одноразовой выгрузки агент
передаёт IDs объектов или коды типов непосредственно и получает ZIP без
промежуточных create/add/save/delete схемы. Отдельный дублирующий tool не требуется;
при необходимости SDK может предоставить удобный wrapper с тем же исполнителем.

В прямом режиме используется несохранённый native XML-элемент схемы. Он явно
передаётся в `tools.add_object_to_package` и `tools.create_list_package`; код не
обращается к текущей схеме для выбора состава и не меняет `local_settings.package_id`.
Общий документ схем не сохраняется; запись `upload_package` не создаётся.
Настройки категорий и штатных связей доступны явно, с теми же ограничениями.
По умолчанию экспортируются только перечисленные IDs, повторяющиеся IDs устраняются.
Пропущенные/недоступные объекты отражаются в результате, без молчаливого обещания
полного архива. Возвращаемый состав относится к фактически собранному ZIP.

Один объект в таком режиме уже выгружен в выполненной native-пробе: исходный
документ схем до/после совпал. Отсутствие сохранённой схемы не означает отсутствие
любых побочных эффектов: штатная функция создаёт `action_report`, временные файлы
и ZIP; выданный локальный артефакт сохраняется по своему lifecycle. Эти данные
нужно учитывать при очистке, не затрагивая пользовательские схемы и архивы.

Пользовательский сценарий — перенос большого набора объектов между стендами.
Для него нужны ограничения размера списка/архива и проверенный потоковый либо
порционный перенос бинарного файла. Не пропускать весь ZIP через модель или одну
неограниченную SOAP/base64-строку. Успех на одном объекте не аттестует массовый
экспорт: нужны отдельные проверки больших наборов, отсутствующих IDs, частичной
сборки, памяти, timeout и очистки.

## Пакеты с настраиваемыми полями

В `wtv_package_objects.xms` вкладка «Настраиваемые поля» записывает выбранные
коды в `custom_templates/catalog_name` и ставит `process_custom_templates`.
В сохранённой схеме им соответствуют `settings.customTemplates` и
`settings.processCustomTemplates`. При прямом экспорте SDK задаёт флаг
автоматически для непустого `customTemplates`.
[Формирование пакета данных](https://wshcm-docs.boristype.dev/news/monolith/6738779645850949369.html)

В `wtv_tools.xml` метод `create_inst_package` берёт узел
`custom_templates.OptChild(catalog_name)` и передаёт его целиком в
`set_field_to_form_upload_data`. Для `request_type` это весь список
`items`, включая поля и страницы каждой записи шаблона. Для включения
типа достаточно одного поля в общем блоке или одной записи в `items`.
Штатный экспорт пропускает тип с одними общими страницами. SDK перечисляет
дочерние типы из `data/custom_templates` внутри `update.xml` и сверяет
их с выбранными типами прямого запроса или сохранённой схемы. Отсутствующий тип отмечается в
`missingCustomTemplates`, receipt и ответ получают статус `partial`.

`includeCustomTemplates: true` включает штатную обработку этого раздела
при импорте. `obtain_custom_templates` обновляет поля по `name`, страницы
по `id` и запись шаблона по ID владельца. Секцию определений можно
перенести отдельно от объектов.

На Linux HCM 2025.2.1333/PostgreSQL [нативный CLI/stdio тест](../../packages/mcp-server/test/e2e/packages.mjs)
проверил именованную схему с объектом и двумя типами определений, прямой
смешанный экспорт с пропущенным типом и ZIP только с определениями
`cost_center`. После удаления пробных определений импорт вернул поле
`combo` с вариантами и его страницу. Свежее чтение сравнилось с исходной
конфигурацией. Для прогона на отдельном стенде область `cost_center`
должна быть пустой. Исходные XML реестра определений и схем пакетов
восстановлены побайтно. Временные записи, собственные архивы и каталоги
очищены по идентификаторам прогона.

## Область первой версии

Полный цикл первой версии относится к пакетам, формируемым «Содержимым пакета».
Это не универсальный установщик обновлений платформы, приложений и компонентов.
Неподдерживаемый тип вложенного пакета нужно назвать и отклонить до применения,
не пропускать молча. Объекты и настраиваемые поля проверены отдельно,
access roles и файловые вложения ещё требуют своей acceptance.
Исходный ZIP сохраняется целиком.

## Реализованный контракт SDK/MCP

Статус 2026-11-17: полный объектный цикл реализован в `WshcmApi.packages` /
`WshcmPackages`, strict inputs экспортированы как `packageSchemas`. MCP содержит
тонкие JSON adapters к тем же десяти методам; native BS, ZIP validation/transfer,
artifact store и политика выбора принадлежат ws-client. Точный публичный inventory,
inputs и примеры — в [README MCP](../../packages/mcp-server/README.md#пакеты-объектов)
и [README SDK](../../packages/ws-client/README.md#пакеты-объектов).

Схемы явно адресуются schemaId; list/get регистрируют hash всего общего XML.
Save/delete/add/remove recheck этот XML и сохраняют соседние схемы. Текущий UI
package_id не переключается. Экспорт из IDs строит несохранённую схему; экспорт
из schemaId требует revision. Сериализация внутри SDK instance плюс recheck
не являются external atomic CAS или распределённой блокировкой.

ZIP находится на машине SDK/MCP в отдельном persistent artifact directory,
по умолчанию `~/.boristype/package-artifacts`. Ответ возвращает artifactId,
localPath, MIME, sizeBytes, sha256 и expiresAt; JSON не содержит archive base64.
Handle действует 24 часа; файлы переживают завершение MCP. Очистка expired
файлов и native receipt/temp/report пока не автоматизирована. Resources и upload
attachments не зарегистрированы. Прочтение существующего source не даёт права
его перезаписи. Path другой среды/удалённого клиента автоматически недоступен.

Для передачи между процессами экспорт публикует отдельный ZIP в `~/.boristype/packages/export`. Флаги `--package-import-directory` и `--package-export-directory` позволяют задать общие каталоги. Оба доступны при просмотре. Служебные снимки с метаданными остаются в отдельном хранилище, поэтому изменение переданного файла не затрагивает выданный handle. Публикация создаёт временную копию рядом с назначением и связывает её с новым именем через `link`. Операция требует поддержки жёстких ссылок файловой системой назначения. В Linux каталог публикации привязан к открытому дескриптору через `/proc/self/fd`. Доверие к ACL каталогов и их родителей остаётся условием эксплуатации.

Для проектных путей stdio-сервер на SDK 2.4 использует согласованный при `initialize` capability `roots` и запрашивает актуальный список только при обращении к проекту. Без подходящего ответа остаются общие каталоги. Явный `--project-directory` заменяет список корней. `cwd` может принадлежать лаунчеру; поэтому берём его только при явном `--project-directory .`. Локальные проверки SDK и MCP покрывают корень, подпапки, смену проекта между вызовами, неоднозначные относительные пути и отказ в перезаписи. SDK сверяет принадлежность пути каталогу и идентичность открытого обычного файла до чтения байтов. В Linux для этой проверки нужен `/proc/self/fd`. [MCP client roots](https://modelcontextprotocol.io/specification/2025-11-25/client/roots).

Inspect копирует архив в immutable snapshot, проверяет ZIP и загружает его для
native preview. inspectionId связывает **весь** нормализованный состав, hash,
target/account; pagination служит представлению. Default import выбирает все
объекты snapshot (либо все объекты явно выбранных packages); явные objectIds могут
быть на любой странице, внешние IDs отклоняются. Прежняя идея ограничения выбором
возвращённой страницы отклонена. Binding хранится в памяти SDK instance; после
restart требуется новый inspect существующего artifactId. Перед apply повторяются
hash/context/version/type/reimport checks; исходный path не перечитывается.

Поддерживаются objects/courses/web/custom_file, другие типы отклоняются до native
распаковки/apply. Custom templates/access roles/files/lists/deletions требуют явных
opt-ins. custom_file destination допускается только ниже x-local://custom/.
Native дополнительные типы/extra содержимое не приняты реальными fixtures.
includeRelatedObjects остаётся XMD/foreign обходом; прикладные wvars/mode связи
не реализованы и не замаскированы дополнительными flags.

Лимиты: ZIP 128 MiB, expanded total 512 MiB, 10000 entries, depth 2, XML 32 MiB,
input IDs 10000, страницы 1–1000/default 100, chunk 256 KiB. Проверки ZIP не
являются доказательством принятия max-size нагрузки. MCP text ≤256 KiB; wrapper
сохраняет SDK pages и при необходимости уменьшает страницу с nextPage/truncated.
Diagnostics/settings могут сокращаться с truncatedFields. Standard Schema wrapper
делегирует SDK validation и JSON Schema, ограничивая также Zod/ generic errors;
отдельных бизнес-правил в MCP нет.

OperationId можно выбрать до dispatch. SDK принимает UUID handles operationId,
artifactId и inspectionId в любом регистре и приводит их к lowercase перед lookup
и dispatch; результаты используют lowercase. Native schemaId/packageId и decimal
objectIds сохраняют исходные значения. Серверные receipts связаны
с tools.get_cur_user_id() и persistent target identity marker. getOperation доступен
после потери SDK/evaluator. Если receipt отсутствует, недоступен или повреждён,
lookup сохраняет unknown с operationId, code ReceiptUnavailable и phase receipt;
это не доказательство отсутствия прежней мутации. Lookup не восстанавливает
receipt и не повторяет операцию. Нет retries/cancellation/rollback/exactly-once.
WshcmPackageError.details сохраняется в MCP, включая operationId/status,
lastKnownOperation/cleanupError. Export проверяет архивный состав и может сообщить
partial; import completed с platform_report_only — завершение native вызова,
а не per-object success. Для делового результата требуются отчёты/readback.

## Product acceptance и границы

Отдельные [SDK final-fix receipt](../research/mcp/object-packages-sdk-final-fix-2026-11-17.json)
и [CLI/stdio final-fix receipt](../research/mcp/object-packages-mcp-final-fix-2026-11-17.json)
содержат hashes изменённых source bytes. После доказанного собственного Save
missing/corrupt receipt дали ReceiptUnavailable/receipt/unknown с тем же operationId,
без восстановления receipt или изменения схемы. SDK status использовал новый
экземпляр API; CLI проверен через реальную регистрацию tools. Uppercase public
UUID handles прошли lookup/dispatch с lowercase результатами. Недоступное чтение
проверено только VM doubles, не native permissions. Эти проверки не расширяют
перечисленные ниже типы, timeout, load и другие границы прежних запусков.

[Свежий native CLI/stdio receipt](../research/mcp/object-packages-mcp-2026-11-17.json)
содержит code hashes, stand identity, операции и результаты cleanup. Runner:
[packages.mjs](../../packages/mcp-server/test/e2e/packages.mjs), запускается через
`pnpm --filter @boristype/mcp-server test:e2e:packages`; нужны существующий stand,
WSHCM_HOST/PORT/USERNAME/PASSWORD и WSHCM_PACKAGE_CONTAINER для контроля evaluators.
Ничего не устанавливает и не перезапускает. SDK runner:
[packages.mjs](../../packages/ws-client/test/e2e/packages.mjs), script
`pnpm --filter @boristype/ws-client test:e2e:packages`.

MCP проверяет реальные CLI/stdio/listTools/callTool и SOAP: schema CRUD с сохранением
baseline, direct-ID export, local artifact bytes/size/hash, paged immutable inspect,
default import двух cost_centers после изменения и точный readback, durable status.
Исходный документ baseline irsd/novyy/0 objects сохранён byte-for-byte. Удалены
только exact own fixture IDs, связанные report/download записи, известные operation
и native extraction directories, две own ZIP/sidecar пары и own evaluators. Общий
artifact directory/чужие записи не удаляются. Stderr измеряется отдельно от stdout.

[SDK native receipt](../research/mcp/object-packages-sdk-2026-11-17.json)
дополнительно покрывает 32 cost_centers, import create/update/
selection skip, version/type/reimport negatives, standalone update ZIP и chunk boundary
524307 bytes/valid ZIP 525074 bytes. Это Linux C HCM 2025.2.1333/PostgreSQL 16,
не Windows/MSSQL, не проверка maximum limits. VM/Node suite исполняет shipped BS
resource с doubles и отдельно проверяет unsafe ZIP negatives, full-snapshot default
на 1001 объектах вне первой страницы и unknown/cleanup correlation. Эти проверки
не считаются native доказательством тех же сценариев.

После native delete/reimport SDK fixture может остаться deleted cost_center catalog
projection при отсутствующем OpenDoc. Общий test-only cleanup helper допускает
opt-in `WSHCM_PACKAGE_DB_CONTAINER` для PostgreSQL fallback: exact allocated ID,
exact run marker, OpenDoc missing и metadata is_deleted=1 обязательны. Удаляется
только этот projection, tombstone сохраняется и указывается в receipt. Product SDK
SQL cleanup не выполняет; MCP acceptance с обновлением не нуждается в этом fallback.
Причина не установлена; отдельное исследование зарегистрировано в
[общих наблюдениях платформы](../platform/object-model.md#открытая-находка-строка-каталога-после-удаления-импортированного-объекта)
и корневом TODO.

Остаются native acceptance courses/web/custom_file/roles/files/lists/
deletions/related traversal, cross-client lost update, другие аккаунты, native
package timeout, большие нагрузки и иные платформы. Нет доказательства полного
замыкания зависимостей, UI permission equivalence или каждой бизнес-валидации.

## Историческое основание: preview-проба до реализации

Браузерное наблюдение и native-проба выполнены на Linux C HCM 2025.2.1333,
PostgreSQL 16, CLR 9, образе из [журнала](../platform/admin-journal.md).
В репозитории сохранён [краткий receipt](../research/mcp/object-packages-2026-11-17.json).
Поставка vendor не копируется в репозиторий.

Исходники этой поставки (SHA-256, байты до декодирования):

| Файл                                | SHA-256                                                            |
| ----------------------------------- | ------------------------------------------------------------------ |
| `wtv/wtv_tools.xml`                 | `1addfe3642811ad749210580b251c62a318ccca2cab8b396470c4bc13348fc5b` |
| `wtv/ms_tools.xml`                  | `37d6458010f2bc42b844ed264642f03c9b1e78a4186006c64ad8c875d59d3f50` |
| `wtv/wtv_package_objects.xms`       | `4b12a607f13128952a18408cd2c6927efa1d211d2a95aa2f97fdf065674644ee` |
| `wtv/wtv_view_package.xms`          | `f76dc0d3b0539923a52110443c09c200ae0e5f45d7a0105e1bec3896f9e0ea14` |
| `wtv/wtv_override_web_template.xmd` | `7954561e768190172e24d3bf11e10712cc06e7a775e916ac3aa5d6f31388671e` |
| `wtv/wtv_custom_web_template.xmd`   | `f2aad78d7cb5414d4a428b2969b142c5d40d23d4f564c02c043fcf4ad9a19062` |

Ключевые маршруты по исходникам: `wtv_tools.xml` — `create_list_package`,
`create_inst_package`, `create_package`, `get_package_log`, `uni_process_package`,
`process_package`, `package_process`, `add_object_to_package`; `wtv_view.xms` —
handler `ProcessPackage`. `ms_tools.xml` — `create_package_objects`.

Сигнатуры сопоставлены с
[wshcmx/types, lib/tools/index.d.ts](https://github.com/wshcmx/types/blob/1d76d40c87ad6a9c249bd16f1bfea035dd815940/lib/tools/index.d.ts)
на revision `1d76d40c87ad6a9c249bd16f1bfea035dd815940`: рядом существуют старые и новые
overloads, часть типов вроде `paramSource: string` не соответствует передаваемому
XML-элементу в поставке. Наличие declaration не доказывает переносимость поведения.

Проба через SOAP/evaluator без BorisType DLL:

1. Прочитан исходный документ схем; создан собственный cost_center с уникальным
   code `bt-package-probe-8c515b19-93d3-4bf7-86fe-7ee3b3b5ef38`.
2. Создана несохранённая схема через `OpenNewDoc` с явным id объекта. Вызван
   `tools.add_object_to_package(null, id, null, schema, options)` с
   `apply_to_all: true` и остальными флагами добавления `false`.
3. `tools.create_list_package(ownedUrl, schema)` вернул error 0/counter 1.
   Получены 959 байт через `Base64Encode(LoadUrlData(ownedUrl))`; Node проверил
   внешний ZIP/desc.xml и вложенный ZIP/update.xml.
4. `tools.get_package_log(ownedUrl, {bDeleteTempDir: true, bCheckVersion: true})`
   вернул error 0, пакет `acjpyybsft`, один объект типа cost_center с исходным id.
5. Этот же ZIP загружен через UI «Обработать пакет»; preview показал пакет и один
   «Центр затрат». Нажата «Отмена». **Применение не выполнялось**.
6. Свой объект удалён без корзины, свой action_report удалён, URL-архив удалён
   через `DeleteUrl`; известные собственные upload/temp-каталоги удалены после
   проверки принадлежности. Документ схем до/после совпал; evaluators закрыты.

Неудачные первые вспомогательные шаги не скрываются: `LoadFileData(URL)` получил
«Файл не найден» (нужен physical path, для логического URL использован LoadUrlData);
`for (var x in ...)` дал syntax error; `Bool()` отсутствует. После исправления
только вспомогательного кода preview завершился. Эти ошибки не были ошибкой сборки ZIP.
`DeleteDirectory` не удалил URL storage bytes; это согласуется с известным
[разделением physical/URL storage](../platform/paths-and-storage.md).

На момент этой исторической preview-пробы оставались проверки: именованные create/edit/delete с обновлением UI,
видимость для другого пользователя, lost update, фактический import/apply своего
fixture (new/update/skip/conflict/partial), timeout receipt, files/custom fields/roles,
отсутствующие объекты и зависимости, malformed/oversized ZIP, resource lifecycle,
Windows/MSSQL и другие HCM. Часть закрыта product acceptance выше; историческая проба сама не доказывает apply.

Источники документации:

- [Формирование пакета](https://wshcm-docs.boristype.dev/news/monolith/6738779645850949369.html).
- [Именованные схемы](https://wshcm-docs.boristype.dev/news/monolith/7261342547182835672.html).
- [Загрузка и обработка](https://wshcm-docs.boristype.dev/news/monolith/6739766340687312103.html).
- [Современный ExportObjectPackage](https://wshcm-docs.boristype.dev/news/platform/7320867593086524313.html)
  относится к `object_package` и библиотеке «Формирование пакетов». Это отдельный
  сценарий; его API не подменяет проверенный вызов `tools.create_list_package`.
- [MCP tool resources/resource_link](https://modelcontextprotocol.io/specification/2025-11-25/server/tools).
- [MCP binary resources](https://modelcontextprotocol.io/specification/2025-11-25/server/resources).
