# Файлы сервера: назначение, форматы и storage routing

Срез 2026-11-11, `/WebsoftServer` остановленного Linux HCM 2025.2.1333.
[Методика и границы](README.md), [инвентарные итоги](observed/filesystem.json),
[hashes и строки источников](observed/source-manifest.json).

## Как читать карту

Физическая директория, logical URL и объект БД — разные адресные пространства.
Путь `x-local://wtv/...` не доказывает чтение именно `/WebsoftServer/wtv/...`:
URL storage может обратиться к SQL. Объект `custom_web_template` тоже может
содержать исполняемый текст, хотя отдельного файла с этим кодом не будет.

Итого найдено **24 044 обычных файла, 2 617 613 517 bytes**. Из них root export
контейнера — 21 529 файлов / 2 249 123 839 bytes, volumes — ещё 2515 файлов.
Симлинки и каталоги не входят в это число. Это размер содержимого, а не занятое
место на диске, backup-size или размер Docker image.

`docker export` не включает содержимое mounts и может показывать скрытую под
mount директорию. При объединении исключались такие underlying paths; в этом
снимке скрытых обычных файлов оказалось 0. Следовательно, приведённые ниже числа
уже включают mounted `applications` и `wt/web/webtutor`.

## Директории

Количество — рекурсивное по top-level каталогу. Назначение определялось по
выборочным исходникам/конфигурации; это не утверждение о загрузке каждого файла.

| Путь относительно `/WebsoftServer`   |      Файлов | Что найдено / как использовать                                                                                                               |
| ------------------------------------ | ----------: | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `wtv/`                               |        4813 | Основные прикладные XMD/XMS, общие определения, библиотеки, agents, reports, API descriptors; первая точка поиска формы стандартного объекта |
| `wt/`                                |      10 574 | Web handlers, скрипты, UI/assets, CourseLab и учебный контент; `WEB-DIR` задан как `wt/web`                                                  |
| `wt/web/webtutor/`                   |        2381 | Отдельный volume с пакетами учебного контента: HTML/JS/assets, XML manifest, XSD/DTD и медиа; уже входит в число `wt/`                       |
| `qti/`                               |          30 | Формы и интерфейсные описания тестов: например `qti_assessment.xmd/.xms/.xmi`                                                                |
| `components/`                        |        1218 | Компоненты с metadata, SPXML библиотеками, forms, remote actions и installation XML                                                          |
| `platform/`                          |         153 | В том числе storage, FTIndex и Lucene компоненты; искать связки BS → managed provider                                                        |
| `applications/`                      |          63 | Отдельный volume: в этом срезе одно приложение с XML/XMS/JS/XMD; не универсальное число приложений                                           |
| `custom/`                            |         148 | Установочные XML-пакеты, ZIP приложений и контента; наличие пакета не доказывает его применение к текущей БД                                 |
| `templates/`                         |         382 | Шаблоны документов/отчётов, включая HTML с серверными вставками                                                                              |
| `i18n/`, `lngs/`                     |    4451, 23 | Языковые ресурсы: JSON/JS constants, XML и HTML help; формат зависит от подсистемы                                                           |
| `app/`, `app_ui/`, `spxml_web/`      | 93, 180, 39 | Платформенные UI ресурсы, XMD/XMS, BS helpers, web/login страницы; контекст каждого loader проверять отдельно                                |
| `dotnetcore/`                        |         624 | Managed assemblies, runtime/deps configs и platform-specific dependencies; активная CLR/набор загруженных DLL этим не установлены            |
| `FT/`                                |        1151 | Файлы Lucene под `dbo-ft-idx/dbo-<catalog>-ft-idx/`                                                                                          |
| `ft-idx/`                            |           0 | Отдельный пустой volume; один из конфигов указывает сюда. Не доказательство отсутствия FT вообще                                             |
| `wt_data/`                           |           0 | Отдельный пустой physical volume; в SQL одновременно имеются документы и URL blobs                                                           |
| `Logs/`                              |          71 | `.log` в отдельном volume; содержимое журналов в этом исследовании не читалось                                                               |
| `source/`, `storage/`, `data_local/` |     3, 3, 1 | Встречены API extension files, legacy storage scripts и local settings. По одному имени не выбирать их как активный обработчик               |

В корне находятся `xHttp.ini`, `spxml_unibridge_config.xml`, `ftindex.json`,
`lucene.json` и другие конфигурационные файлы. Их полные тела могут содержать
секреты; в evidence опубликована только выборка storage/routing параметров.
Полный список top-level counts находится в JSON, а не дублируется этой таблицей.

## Расширение — подсказка, потребитель определяет роль

Числа относятся ко всей объединённой инвентаризации.

| Расширение            |   Число | Подтверждённая роль и ограничение                                                                                                |
| --------------------- | ------: | -------------------------------------------------------------------------------------------------------------------------------- |
| `.xmd`                |    1050 | SPXML-формы объектов/каталогов, shared definitions, свойства и hooks. Это не автоматически XSD и не обязательно strict XML       |
| `.xms`                |    1044 | Screens/dialogs, UI actions, validation, вызовы бизнес-кода. Не только описание внешнего вида                                    |
| `.xml`                |     702 | Данные, конфигурация, libraries, install packs, handlers; XML extension не означает «неисполняемый файл»                         |
| `.bs`                 |    1607 | BorisScript source: agents, library wrappers, remote actions; есть прямые ссылки из загрузчиков/installation XML                 |
| `.js`                 |    2143 | Browser JavaScript, server BorisScript, component init и другие контексты. Решение принимает loader, не расширение               |
| `.html`               |     993 | Статика, UI/course content и server templates с `<% ... %>`/`<%= ... %>`                                                         |
| `.xmi`                |      11 | В прочитанных примерах — описания API методов/параметров для WSDL generator; не предполагать UML XMI                             |
| `.xsd`                |     474 | Среди export-файлов проверены IMS/SCORM package schemas; ещё 456 файлов в course-content volume инвентаризированы без чтения тел |
| `.xsx`                |       1 | Layout XML Schema Designer рядом с IMS schema, auto-generated comment; не найдено оснований считать бизнес-логикой               |
| `.json`               |    5007 | Переводы, component metadata, runtime/provider config и другие данные. `package.json` не всегда npm manifest                     |
| `.dll`, `.so`         | 632, 28 | Managed/native dependencies, в том числе DLL на Linux и платформенные варианты; presence не означает loaded                      |
| `.xaml`               |     392 | Найдены файлы с этим suffix; их формат и способ загрузки в этом проходе не разобраны                                             |
| `.cfe`, `.cfs`, `.si` |  По 234 | Lucene segment/compound artifacts под FT; не бизнес-XML                                                                          |
| `.log`                |      71 | Журналы; структура сообщений и причины отдельных ошибок не исследованы                                                           |

В объединённом inventory не найдено обычных файлов `.xq`/`.xmq`. Это ограниченный
отрицательный результат: он не исключает текст запросов внутри XML/BS/БД,
custom storage или такие файлы в другой установке.

### XMD/XMS/XML

Предыдущий [XMD audit](../mcp/10-object-model/xmd-and-catalogs.md) уже установил,
что vendor SPXML может не проходить strict XML parser: повторные атрибуты,
сырой код операторов, namespace особенности. Не «чинить XML» регулярными
заменами и не вычислять самостоятельно всю effective schema из одного файла.
SAMPLE/USE/INHERIT и зависимые формы требуют платформенной обработки.

XMS может выполнять операции, отсутствующие в generic Save: prompts, validation,
связанные обновления и интеграции. Конкретные пути разобраны в
[XMS и бизнес-логике](../mcp/10-object-model/xms-and-business-logic.md).
Статья об [XMD](https://wshcm-docs.boristype.dev/news/platform/7117696163946095988.html)
полезна для терминов, но не доказывает строгую XML-совместимость всех файлов.

### BS и JS

`wtv/wtv_tools_app.xml:1644–1652` при подготовке агента выбирает файл
`wtv/agents/<code>.js`, если он есть, иначе `.bs`, и записывает URL кода.
Это concrete consumer для обоих расширений, а не вывод только по именам.
`wtv/agents/PdpExtAgentUpdateStatus.bs:1` вызывает метод code library;
`wt/web/library/create_resource.bs:1` присваивает `RESULT` результат вызова `libMain`.

Installation XML компонента `competences_assessment` в строках 2216–2228
объявляет `remote_action` типа `eval` с `.bs` URL. Сам BS в строках 1–11
строит RESULT с `form_url`, library и method. Наличие этих исходников не
проверяет установку соответствующего объекта в БД или успешный вызов метода.

### XMI и кодировки

`wt/web/api_wsdl.xml:91` собирает `.xmi` из wtv/qti, строка 116 читает их XML,
128–162 извлекают описание методов, 244 начинает WSDL. Там же есть обработка
дополнительных descriptor paths из `source/api_ext.xml`.
`wtv_active_learning.xmi:7–9` описывает `complete_course`, API name `complete`
и return type `integer`. Это metadata контракта, а не доказательство доступности,
authorization или корректности вызова сейчас.

Некоторые XMI объявляют `windows-1251`, `qti_assessment.xmi` — UTF-8.
Не декодировать всё дерево как UTF-8 без проверки encoding/BOM/реальных bytes.
Исследование не меняло исходные кодировки.

### Шаблоны и расширения офисных файлов

`templates/account_report.html:6–18` содержит HTML и серверные вставки.
`templates/access_table_for_event.doc` начинается с HTML `<TABLE>`, содержит
`<% ... %>` и `Response.Write`; `wtv_dlg_access_table_for_event.xms:75`
обрабатывает его через EvalCodePageUrl. Поэтому `.doc` здесь не бинарный Word
container. По расширению нельзя выбирать binary parser или считать файл
пассивным документом.

### Компоненты и managed dependencies

`components/competences_assessment/spxml/competences_assessment.js:6–7`
вызывает init_main и обработку custom packs. В sample component XML есть
`SPXML-INLINE-FORM CODE-LIB="1"`. Metadata package содержит platform-specific
`code`, `enableByDefault`, `type`; у platform/ftindex — `nameSpace: websoft`.
Такие `package.json` нельзя автоматически обрабатывать как Node packages.

`platform/ftindex/spxml/component.js:21–22` явно обращается к
`Websoft.FTIndex.dll` и Init; `platform/lucene/spxml/lucene-legacy.xml:9–10` —
к `Websoft.Lucene.dll`. Это связь в static source. Наличие linux/win/нескольких
архитектур dependencies не устанавливает выбранный runtime target.

## Ini, URL roots и provider

В корневом `xHttp.ini` остановленного контейнера:

- `DEFAULT-DATABASE wt_data`, `FTI wt_data`, `CATALOG-STORAGE xdb`;
- `WEB-DIR wt/web`, `DOTNETCORE-PATH dotnetcore/core`;
- повторяемые DESIGN-DB включают `wtv`, `qti`, `wt`, `applications`, `custom`,
  `templates`, `components`, `platform` и другие roots;
- DATA-DB включают `wt_data`, `trash`, `share`, `source`, `components`,
  `platform` и другие; списки пересекаются;
- `DB-STORE-HOOK` для `wt_data` и `trash` указывает на
  `x-local://platform/storage/spxml/sx_store_sql.xml`.

Полная разрешённая выборка с номерами строк находится в JSON. `source`, `udt`,
`components`, `data_translate`, `platform` встречаются в обоих списках.
Это не взаимоисключающие типы директорий и не прямое соответствие
«DESIGN = диск, DATA = БД».

В `spxml_unibridge_config.xml` установлены `LookFailedUrlsOnDisk=true`,
`FetchBackFoundUrlsOnDisk=true`, `LocalFileCache=false`. Документация
[provider settings](https://wshcm-docs.boristype.dev/news/monolith/6756586034472034886.html)
объясняет fallback/cache; статическое значение само по себе не доказывает,
что именно этот конфиг применён текущим процессом.

[Исторические пробы 2026-11-06](../dotnet/15-url-storage-routing-research.md)
на этом семействе стенда отдельно показали: `share` с DATA-DB оставался disk
storage; `wt_data` с SQL hook писал blob; чтение x-local могло предпочесть blob
и импортировать отсутствующий blob с диска. Эти операции сейчас **не повторялись**.
Добавление DESIGN-DB/DATA-DB roots тогда не дало ожидаемого доступа, поэтому
полный registry/allowlist алгоритм остаётся неизвестным.

[xHttp.ini](https://wshcm-docs.boristype.dev/news/monolith/6747986263544912377.html)
— server config; [SpXml.ini](https://wshcm-docs.boristype.dev/news/monolith/7226833524391871257.html)
из документации desktop admin — иной контекст. Не переносить параметры одного
на другой. Переход к x-app/file также меняет контракт; см.
[актуальные правила URL mapping](../../platform/paths-and-storage.md).

## Полнотекстовые файлы: что известно и что ещё нет

В `FT/dbo-ft-idx/dbo-<catalog>-ft-idx/` встречаются `_*.cfe`, `_*.cfs`, `_*.si`,
`segments.gen`, `segments_*`, `.del`. У выборочного `.si` прочитан небольшой
header с `Lucene46SegmentInfo`/4.8, у `.cfe` — `CompoundFileWriterEntries`.
Содержимое `.cfs` не читалось. Это признаки формата найденных файлов, а не
установленная версия активного managed provider.

Найдены несовпадающие значения:

| Источник                     | Значение                                                                                   |
| ---------------------------- | ------------------------------------------------------------------------------------------ |
| `spxml_unibridge_config.xml` | `LuceneFTIndex=true`, `SharedFTDirectory=/WebsoftServer/ft-idx/`                           |
| Корневой `lucene.json`       | `LuceneFTIndex=true`, `SharedFTDirectory` с декодированным Windows-style значением `..\FT` |
| Корневой `ftindex.json`      | `Enabled=true`, `FTIndexBlobs=false`, `FTIndexName=lucene`, `MaxFTDocs=1000`               |
| Файлы на диске               | 1151 файл в `FT/`, 0 в mounted `ft-idx/`                                                   |

Корневые JSON в выборке совпадали с templates по bytes. Кто и в каком порядке
читает конфиги, как разрешается относительный путь и какой backend был активен
при создании файлов, не установлено. Нельзя выводить из `MaxFTDocs=1000`
гарантированный предел MCP/XQuery, а из `FTIndexBlobs=false` — глобальный запрет
индексации blobs во всех providers.

Следующее исследование должно связать конкретный loader, эффективную конфигурацию,
SQL `(ft_last_index)` и actual update owned объекта. Пользовательское наблюдение
о задержке полнотекстового поиска из-за расписания сохраняет смысл, но этот срез
не измеряет период и не подтверждает универсальные «20 минут».
