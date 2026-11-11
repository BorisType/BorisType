> Датированное техническое evidence; текущие основания — [тематическая запись](../../platform/paths-and-storage.md).
> Прямые x-app/file probes не расширили публичную MCP file schema. Последующий routing research различает physical mapping и SQL blobs.

# Схемы путей WebSoft и границы файловых tools

Дата: 2026-11-06. Статус: исследование; MCP по-прежнему принимает только
`x-local://`. Расширение публичного контракта пока не реализовано.

Переносимый справочник платформы и последующее дополнение о `DESIGN-DB`/`DATA-DB`
в серверном `xHttp.ini` — в [skill WebSoft HCM](../../../skills/websoft-hcm/references/paths-and-configuration.md).
Последующая [проверка storage routing](15-url-storage-routing-research.md)
подтвердила расхождение логического URL и физического файла, включая импорт
дискового файла в SQL при чтении. Простое добавление новых DESIGN-DB/DATA-DB
не разрешило новые hosts в исследованном evaluator.

## Вывод для следующего шага

Кандидаты для файловых tools — `x-local://`, `x-app://` и `file:///`.
Преобразование следует оставить на стороне **BS через `UrlToFilePath`**,
а .NET передавать полученный физический путь. Подстановка префикса или
нормализация через Node `URL`/`path` меняют наблюдаемую семантику.

Речь о контракте физической ФС. После проверки SQL storage установлено,
что одинаковый результат resolver не обеспечивает одинаковое логическое
содержимое URL. Для поддержки платформенных ресурсов нужен отдельный выбор
backend, описанный в [следующем исследовании](15-url-storage-routing-research.md).

На проверенном сервере `x-app://app/sx_app_config.xmd`,
`x-local://app/sx_app_config.xmd` и `file:///WebsoftServer/app/sx_app_config.xmd`
разрешились в один путь. Наша установленная DLL прочитала одинаковое содержимое,
SHA256 и metadata через все три варианта. Это проверка BS resolver → .NET read/info,
а не проверка новых форматов через публичные MCP schemas: те их пока отклоняют.

`x-app` и `x-local` **различаются правилами разрешения первого компонента**.
Неизвестный компонент `__bt_missing__` у `x-local` даёт `Url host is not allowed`,
а у `x-app` превращается в `/WebsoftServer/__bt_missing__/a.txt`.
Наличие физического каталога для преобразования не требуется.

## Найденные схемы и обозначения

| Формат                                    | Что установлено                                                                                                                                  | Отношение к файловым tools                                                              |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| `x-local://wt/web/...`                    | На нашем сервере — `/WebsoftServer/wt/web/...`; допустимость первого компонента проверяет платформа.                                             | Текущий поддерживаемый формат.                                                          |
| `x-app://app/...`                         | Используется в поставляемых формах и библиотеках; на этом сервере — `/WebsoftServer/app/...`. Также проверены `wt`, `wtv`, `lngs`, `app_ui`.     | Подходит для следующего расширения через штатный resolver.                              |
| `file:///WebsoftServer/...`               | Абсолютный путь файловой системы **сервера**; преобразование и чтение DLL проверены на Linux.                                                    | Второй кандидат; форму с host нужно рассмотреть отдельно.                               |
| `server://wt/web/...`                     | Найден в `wtv_translate_result.xmd`. Функция `get_source_file` сама удаляет `server://` и строит другой URL. `UrlToFilePath` схему не принимает. | Прикладное обозначение в исследованном коде, не общий формат для наших tools.           |
| `x-sys-image://std-icon/info.ico`         | Встречается как источник изображения в `.xms`, например `app/sx_task_progress.xms:112`; resolver C-runtime отклоняет его.                        | Ресурс интерфейса; файловый backing и доступ в UI не исследованы.                       |
| `http://`, `https://`, `ftp://`           | Найдены в поставке. Для `http` и `ftp` проверено отсутствие преобразования в файловый путь.                                                      | Отдельные сетевые операции, вне текущего файлового контракта.                           |
| Абсолютный OS path или относительный путь | `/WebsoftServer/wt/web/` и `wt/web/` не принимаются `UrlToFilePath`.                                                                             | Для их поддержки нужен отдельный явно описанный вход; не добавлять молчаливый fallback. |

Также в клиентских зависимостях встречаются `ws`, `wss`, `webpack`, deep links
и другие URL. Наличие строки со схемой не означает, что сервер умеет читать
её как файл. Инвентаризация ограничена текстовыми файлами выбранных каталогов,
это не полный реестр протоколов платформы.

`x-db`, `x-data`, `x-temp` использованы только как отрицательные входы probes:
в исследованных файлах они не обнаружены, resolver их отклонил. Это не список
подтверждённых платформенных схем.

## Наблюдения на C-runtime

| Вход / сравнение                                         | Фактический результат                                                                   |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `x-local://wt`, `x-app://wt`                             | Оба возвращают `/WebsoftServer/wt/`.                                                    |
| `x-local://`, `x-local:///wt/web/`                       | Ошибка `Url host is not allowed` с пустым host.                                         |
| `x-app://`, `x-app:///wt/web/`                           | Ошибка `Empty url host`.                                                                |
| `x-local://storage/...`, `x-local://data/...`            | `Url host is not allowed`, хотя физическая `/WebsoftServer/storage` существует.         |
| `x-app://storage/...`, `x-app://data/...`                | Получается путь под `/WebsoftServer/`; существование не проверяется.                    |
| `x-local://wt_data/...`, `x-local://Logs/...`            | Получается физический путь в соответствующем каталоге.                                  |
| `x-local://wt/../app/...`, `x-app://app/../wt/...`       | `Special path elements are prohibited in url`.                                          |
| `x-local://wt/web/./default.html`                        | `.` сохраняется в результате.                                                           |
| `x-local://wt//web/default.html`                         | Повторный `/` схлопывается.                                                             |
| `x-local://wt/web/space%20name.txt`, аналогичный `x-app` | `%20` сохраняется буквально в имени.                                                    |
| `file:///WebsoftServer/wt/web/space%20name.txt`          | `%20` превращается в пробел.                                                            |
| `x-local://wt/web/%2e%2e/app/a.txt`                      | `%2e%2e` сохраняется буквально; это не проверка доступа к родительскому каталогу.       |
| `file:///WebsoftServer/wt/web/a%23b.txt`                 | `%23` превращается в `#`; у `x-app` остаётся `%23`.                                     |
| `x-local://wt/web/a?query=1`, `.../a#fragment`           | Query/fragment отбрасываются. Наши schemas уже запрещают оба.                           |
| `X-LOCAL://wt/web/`                                      | Схема не распознаётся; автоматическое приведение регистра меняло бы поведение.          |
| `file://localhost/WebsoftServer/...`                     | Возвращается `//localhost/WebsoftServer/...`, а не обычный локальный путь.              |
| `file://remote/WebsoftServer/...`                        | Возвращается `//remote/WebsoftServer/...`. Сетевой доступ не выполнялся.                |
| `file:/WebsoftServer/wt/web/default.html`                | Однослешевая форма тоже преобразуется; поддержка такого написания в MCP не согласована. |
| `file:///C:/WebsoftServer/wt/web/` на Linux              | Получается `C:/WebsoftServer/wt/web/`; это не абсолютный Linux path для .NET.           |

`UrlToOptFilePath` для исследованных успешных преобразований возвращал ту же
строку, для отклонённых — значение типа `undefined`. Существование файла
эта функция также не доказывает. Для ошибки в нашем bridge удобнее сохранить
обычный `UrlToFilePath`, а не подменять отсутствие mapping произвольным путём.

Документированная `UrlOrFilePathToFilePath()` во всех 27 входах первой пробы
дала `not defined`. Наличие декларации в types не делает её доступной на стенде.

## Документация, declarations и статические примеры

Документация Datex может ошибаться и пропускать детали; сведения ниже различаются
по источнику и не подменяют запуск на платформе.

- [UrlToOptFilePath](https://wshcm-docs.boristype.dev/datex/common/5791375928854455031.html)
  перечисляет `file:`, `x-app:`, `x-local:` и `undefined` при отсутствии mapping,
  включая случай базы вне локальной файловой системы. Внешняя БД/VFS нами не проверялась.
- [UrlOrFilePathToFilePath](https://wshcm-docs.boristype.dev/datex/common/5791375928854454940.html)
  описывает приём URL и OS paths. На этом C-runtime функция не определена.
- [UrlToFilePath](https://wshcm-docs.boristype.dev/news/platform/7160847139044029573.html)
  не обещает проверку существования. Пример `x-local:///wt/web/` с относительным
  Windows-результатом **не воспроизвёлся** на нашем Linux-сервере.
- [x-local](https://wshcm-docs.boristype.dev/news/platform/7117695944111423091.html)
  связывает корень с процессом выполнения. Статья
  [Что такое x-local?](https://wshcm-docs.boristype.dev/news/monolith/7226833524391871257.html)
  отдельно описывает клиент WebTutorAdmin и `SHARED-DATABASE`.
  Работа в администраторе и настройки общего доступа нами не проверялись.
- [WebAppUrl](https://wshcm-docs.boristype.dev/datex/common/5791375928854454897.html)
  описывает преобразование `x-app` для встроенного браузера: `file` для desktop
  и специальный запрос для web. Это другой контракт, не resolver для System.IO.
- [AddUrlMapping](https://wshcm-docs.boristype.dev/datex/common/5620250451197911683.html)
  описывает автоматическую подмену базовых URL. Мы не регистрировали mappings;
  их взаимодействие с конвертерами и чужой конфигурацией остаётся непроверенным.
- [wshcmx/types, lib/core/index.d.ts](https://github.com/wshcmx/types/blob/a3b1e43d0b2add53bbc1f2acc2c5128360e8c97b/lib/core/index.d.ts#L2212),
  revision `a3b1e43d0b2add53bbc1f2acc2c5128360e8c97b`: `AbsoluteUrl` — строка 2224,
  `WebAppUrl` — 2233, `AddUrlMapping` — 2246, `FilePathToUrl` — 2255,
  `UrlOrFilePathToFilePath` — 2407, `UrlToFilePath` — 2415,
  `UrlToOptFilePath` — 2426. У последней declaration возвращает `string`,
  хотя комментарий и native probe показывают также `undefined`.

В поставке `x-app` используется, например, в `wtv/ms_tools.xml:789` для `lngs`,
в `wtv/wtv_view_report_template.xml:55` для формы `app/sx_view_html.xmd`,
в `wtv/wtv_general.xms:1506` для `app_ui/theme/pict/drop.svg`.
`server://` разобран по `wtv/wtv_translate_result.xmd:177–180`.
Это статические примеры из Linux-образа ниже; исполнение этих UI-сценариев
не проверялось. Для managed wrapper resolver см. [предыдущее исследование](03-path-resolution-research.md).

## Варианты расширения контракта

1. **URL allowlist `x-local`, `x-app`, локальный `file`.** Рекомендованный первый
   шаг. Общий validator для файлов и поиска; BS вызывает штатный resolver;
   .NET продолжает проверять абсолютность физического пути, ссылки и лимиты.
   Проще проверить без знания ОС MCP-клиента. Для первого контракта `file`
   разумно ограничить формой `file:///...` без host: `file://localhost` не является
   её эквивалентом на проверенном runtime. Windows drive URLs требуют native проверки.
   Добавление `x-app` открывает имена каталогов, которые отклоняет `x-local`,
   а `file` позволяет адресовать пути вне каталога установки. Это нужно явно
   описать как поведение интерфейса, не представлять расширение набором синонимов.
2. **Дополнительно принимать абсолютные OS paths сервера.** Удобно при работе
   с внешними каталогами, но нужно отдельно различать URL, Windows drive/UNC
   и POSIX path, проверять их на сервере. Относительным путям потребуется
   явный базовый каталог. В этом исследовании такой контракт не выбран.
3. **Принимать любой URL и пробовать fallback.** Не рекомендуется: URI может
   обозначать UI-ресурс, сетевой ресурс или объект БД. Конвертация строки
   не гарантирует доступ через System.IO; fallback скрывал бы реальную ошибку.

Для первого варианта сохранить текущую привязку read grants к **точной строке URL**:
чтение через `x-local` не выдаёт разрешение edit/overwrite через `x-app` или `file`.
Такое ограничение понятно и уже совместимо с текущим состоянием. Объединение
алиасов потребовало бы серверной идентичности файла и отдельного решения об
инвалидации; нормализовать их на ОС клиента нельзя. Hash-проверка содержимого
в DLL остаётся обязательной при редактировании.

## Измеримый следующий шаг

- Описать схемы/host, регистр, query/fragment, escaping и политику read-token.
- Объединить validators поиска и файлов; добавить положительные и отрицательные
  schema/protocol tests для всех девяти tools, включая оба адреса move.
- Не делать `decodeURIComponent`, Node path normalization, подстановку `x-app`
  вместо `x-local` или fallback к исходному пути после ошибки resolver.
- Проверить на своих временных fixtures read/list/search/create/edit/overwrite/
  move/delete через новые схемы, Unicode, буквальные `%20` и пробелы,
  алиасы read grants, неизменность байтов после отказа, ошибки mapping и ссылки.
- Отдельно проверить Windows HCM: drive/UNC, форму результата resolver и host.
  До этого не объявлять native Windows-поддержку новых схем подтверждённой.

## Воспроизводимость и границы доказательства

Проверен существующий локальный **Linux C-runtime HCM 2025.2.1333 / x64**,
CLR **9.0.11**, managed assembly **2.25.12.4 [202512041524]**.
Image: `websoft/hcm:2025.2.1333`, ID
`sha256:0edeac24afc2a5371ea8431c59b1c17ca2b1a9e5a3768275cfdb5023609e34ab`.
Carrier — authenticated ws-client evaluator во временной BS-библиотеке;
arithmetic smoke `2 + 2 → 4`, никакой адаптации исходников.
Это не JS mock, не запуск `main.js` и не Windows-проверка.

В git сохранены только наши ограниченные probes. В каждой конечный `for` с
одним `i++`; чтение не меняет проверяемые файлы. Mapping probes намеренно
возвращают также ошибки: их количество не является счётчиком прошедших тестов.

| Probe                                                                   | Объём                                    | SHA256 исходного и исполненного файла                              |
| ----------------------------------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------ |
| [path-mapping.bs](../../../skills/websoft-hcm/probes/path-mapping.bs)   | 27 входов, четыре URL-функции            | `72b00daa7d14014d9663941b7944771dc6889413a7f9a7fe2fe9d2aeb87c3616` |
| [path-followup.bs](../../../skills/websoft-hcm/probes/path-followup.bs) | Ещё 23 входа, host/path и два конвертера | `c47fb94d45962dc5396c0dabcfae86e8a41023180307c4705478479fd17937da` |
| [path-assets.bs](../../../skills/websoft-hcm/probes/path-assets.bs)     | Три входа из поставляемых UI-форм        | `29ccede534d94fd381a0ea636e72b0e94dc52e5a348d8ca88cdbe717eb3ada0d` |
| [managed-alias-read.bs](probes/path-schemes/managed-alias-read.bs)      | ReadJson + InfoJson через три схемы      | `9f1a0ac84572e376135022e2c08cf43e15b51cc67860d4382d4b4eacac15a4f2` |

Read/info: `app/sx_app_config.xmd`, 484 bytes, SHA256
`c65fc41c764cf829ba7f30380eb00029bbe64eca8bdf2c19536ee56482524b7d`.
Хеш независимо совпал с `sha256sum` внутри контейнера. DLL alpha.4/API 2:
`47487c24cdd4cce518c718aa1336a80c7d4e52777ea2609cb7a1053267d843af`.

Статические файлы поставки, SHA256:

- `wtv/wtv_translate_result.xmd`: `b6f4dc0bea20bbda0451905069baaf5ff6f46c4d325658d4e23739a58a44d527`.
- `wtv/ms_tools.xml`: `37d6458010f2bc42b844ed264642f03c9b1e78a4186006c64ad8c875d59d3f50`.
- `wtv/wtv_view_report_template.xml`: `1d45d594d3d171838b34b3e3d0f134051ecd8f086d575bca5c67824966a4e75f`.

Raw JSONL/results и прочие локальные evidence находятся вне git:
`/home/agent/workspace/wshcm-path-research-20261106/`.
Все evaluator cleanup подтверждены; независимый поиск `unsafe_eval_*` пуст.
После probes оба контейнера снова остановлены, как до исследования.
Новые mappings, сетевые обращения к URL из таблицы и CRUD через новые MCP-входы
не выполнялись. Разрешение URI не доказывает эквивалентность платформенной VFS
обычному файловому доступу на других установках.
