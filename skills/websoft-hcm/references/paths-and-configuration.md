# URL, физические пути и ini WebSoft HCM

## Область применимости

Обновлено 2026-11-06. Native-наблюдения ниже относятся к **Linux x64 HCM
2025.2.1333, C-runtime, CLR 9.0.11, managed assembly 2.25.12.4 [202512041524]**.
Carrier — authenticated evaluator во временной BS-библиотеке. Корень установки
в этой проверке — `/WebsoftServer`; это пример конкретного сервера.

Windows HCM, WebTutorAdmin, JS-интерпретатор и другая конфигурация этими
запусками не проверены. Документация, код поставки и native-наблюдения
ниже обозначены отдельно.

## Выбор преобразования

Передавай платформенный URL в BS `UrlToFilePath(url)`, затем проверяй пригодность
результата для потребителя. Абсолютность, существование, доступ и поддержка
VFS — отдельные условия. Неизвестную схему или ошибку mapping обрабатывай
как отсутствие подтверждённого физического пути.

Даже существующий путь может указывать на другие байты, чем логический URL:
SQL hook для `x-local` может читать `spxml_blobs`, пока прямой IO читает диск.
Подтверждённые различия, включая импорт файла при чтении, — в
[URL storage и blobs](url-storage-and-blobs.md).

Если операция принимает обычный OS path, определи этот контракт отдельно:
относительно какой базы, на какой ОС и с какими правилами drive/UNC.
ОС клиента интеграции не определяет синтаксис путей сервера.

## Что известно о схемах

| Формат                             | Источник и наблюдение                                                                                                                          |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `x-local://wt/web/...`             | Native: `/WebsoftServer/wt/web/...`; первый компонент проверяется платформой.                                                                  |
| `x-app://wt/web/...`               | Native: тот же физический каталог для `wt`; также проверены `app`, `wtv`, `lngs`, `app_ui`.                                                    |
| `file:///WebsoftServer/wt/web/...` | Native: абсолютный путь сервера; percent escapes декодируются.                                                                                 |
| `server://wt/web/...`              | Статически: `wtv/wtv_translate_result.xmd`, `get_source_file`, явно удаляет префикс и строит другой URL. Native `UrlToFilePath` его отклоняет. |
| `x-sys-image://std-icon/info.ico`  | Статически: источник изображения в `app/sx_task_progress.xms:112`. Native resolver отклоняет схему; доступ в UI не проверялся.                 |
| `http://`, `ftp://`                | Native: `UrlToFilePath` отклоняет схемы. Сетевые загрузки этими пробами не выполнялись.                                                        |

Для `x-local://app/sx_app_config.xmd`, `x-app://app/sx_app_config.xmd` и
`file:///WebsoftServer/app/sx_app_config.xmd` проверены преобразование и чтение
одного физического файла независимой .NET-библиотекой: одинаковые содержимое,
metadata и SHA256. Этот результат не доказывает эквивалентность схем для всех
ресурсов и установок.

### Первый компонент и существование

В `x-local://wt/web/...` `wt` — host по платформенным `UrlHost`/`UrlPath`.
На проверенном сервере неизвестный host `__bt_missing__`, а также `storage`
и `data`, дают `Url host is not allowed`. Физическая `/WebsoftServer/storage`
при этом существует: наличия папки недостаточно.

`x-app://__bt_missing__/a.txt` преобразуется в
`/WebsoftServer/__bt_missing__/a.txt`, хотя такого каталога нет.
Замена `x-local` на `x-app` меняет правила mapping и не является общим
исправлением отказа доступа. `UrlToFilePath` не проверяет существование файла.
Связанные настройки `.ini` описаны ниже; полный алгоритм допуска не установлен.

### Escaping и форма URL: native результаты

| Вход                                                              | Результат на указанном Linux C-runtime                                    |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `x-local://wt/web/space%20name.txt`                               | `/WebsoftServer/wt/web/space%20name.txt` — буквальное `%20`.              |
| `x-app://wt/web/space%20name.txt`                                 | Такой же результат с буквальным `%20`.                                    |
| `file:///WebsoftServer/wt/web/space%20name.txt`                   | `/WebsoftServer/wt/web/space name.txt` — пробел.                          |
| `file:///WebsoftServer/wt/web/a%23b.txt`                          | Физическое имя `a#b.txt`; у `x-app` `%23` сохраняется.                    |
| `x-local:///wt/web/`                                              | Ошибка `Url host is not allowed` с пустым host.                           |
| `x-app:///wt/web/`                                                | Ошибка `Empty url host`.                                                  |
| `x-local://wt`, `x-app://wt`                                      | `/WebsoftServer/wt/`.                                                     |
| `x-local://wt/../app/sx_app_config.xmd`, `x-app://app/../wt/web/` | `Special path elements are prohibited in url`.                            |
| `x-local://wt/web/%2e%2e/app/a.txt`                               | Percent escapes сохраняются буквально.                                    |
| `x-local://wt/web/./default.html`                                 | `.` сохраняется.                                                          |
| `x-local://wt//web/default.html`                                  | Повторный `/` схлопывается.                                               |
| `x-local://wt/web/a?query=1`, `.../a#fragment`                    | Query/fragment отбрасываются.                                             |
| `X-LOCAL://wt/web/`                                               | Схема не распознаётся.                                                    |
| `file://localhost/WebsoftServer/wt/web/`                          | `//localhost/WebsoftServer/wt/web/`, отличается от `file:///...`.         |
| `file://remote/WebsoftServer/wt/web/`                             | `//remote/WebsoftServer/wt/web/`; файловый доступ к адресу не проверялся. |
| `file:///C:/WebsoftServer/wt/web/`                                | `C:/WebsoftServer/wt/web/`, не абсолютный Linux path.                     |
| `/WebsoftServer/wt/web/`, `wt/web/`                               | `UrlToFilePath` отклоняет оба входа.                                      |

Предварительный URI decode, lowercasing схемы или нормализация через клиентский
URI/path parser могут изменить эти результаты. При проектировании входного
контракта отдельно решай, какие формы допускаются, включая query, fragment,
host и пустой путь. Успешное преобразование строки не означает, что имя безопасно
передавать любому последующему декодеру.

## Связанные API и расхождения

- `UrlToOptFilePath(url)` в наших пробах возвращал ту же строку при успехе
  и значение типа `undefined` при отсутствии mapping.
- Документированная `UrlOrFilePathToFilePath()` на этом C-runtime дала
  `not defined` во всех 27 входах первой пробы. Не выбирать её только по имени
  или наличию TypeScript declaration.
- В документации `UrlToFilePath('x-local:///wt/web/')` показан относительный
  Windows-результат. На проверенном Linux-сервере этот вход отклонён.
- `WebAppUrl` документирован для представления `x-app` встроенному браузеру:
  desktop `file` или специальный web-запрос. Это не контракт получения OS path.
- `AddUrlMapping` документирует подмену базовых URL. Новые mappings и их влияние
  на resolver в этих проверках не исследовались.

## Конфигурация: что прочитано и что не проверено

В **серверном `xHttp.ini`** поставки 2025.2.1333 статически обнаружены:

| Настройка          | Документированное назначение                                              | Пример из проверенной конфигурации            |
| ------------------ | ------------------------------------------------------------------------- | --------------------------------------------- |
| `DESIGN-DB`        | Каталоги, откуда администратор может брать шаблоны; повторяемый параметр. | `wtv`, `wt`, `custom`, `lngs`, `platform`.    |
| `DATA-DB`          | Каталоги чтения и записи сервера; повторяемый параметр.                   | `wt_data`, `share`, `components`, `platform`. |
| `DEFAULT-DATABASE` | Папка XML-базы; значение используется в `DefaultDb`.                      | `wt_data`.                                    |

Источники: [описание xHttp.ini](https://wshcm-docs.boristype.dev/news/monolith/6747986263544912377.html)
и статическое чтение конфигурации образа. В последующей конфигурационной пробе
добавление новых DESIGN-DB/DATA-DB и restart с проверкой активных байтов
**не разрешили** два новых host в этом evaluator. Причина, наследование defaults
и полный механизм регистрации остаются неустановленными. Списки также не объясняют
все прежние принятые hosts: например, `app` и `Logs` в них отсутствуют.

Для `wt_data` отдельно активен `DB-STORE-HOOK` на SQL storage; для `share`,
тоже указанного в DATA-DB, его нет. URL-запись в первом случае попала в SQL blob,
во втором — на диск. Подробнее: [storage routing](url-storage-and-blobs.md).

**Для WebTutorAdmin** [отдельная статья](https://wshcm-docs.boristype.dev/news/monolith/7226833524391871257.html)
указывает `SHARED-DATABASE: custom_library` в `SpXml.ini` для доступа
к серверной папке вместо клиентской. Это документация о клиенте, не проверенная
инструкция изменения Linux-сервера. Не подменять этим параметром серверные
`DESIGN-DB`/`DATA-DB` по аналогии.

При ошибке host сначала сопоставь адрес, процесс выполнения и фактическую
конфигурацию этой установки. Затем проверяй гипотезу ограниченной пробой на
тестовой среде. По наблюдению одной установки нельзя вывести полный allowlist.

## Источники и воспроизводимость

- [UrlToFilePath](https://wshcm-docs.boristype.dev/news/platform/7160847139044029573.html).
- [UrlToOptFilePath](https://wshcm-docs.boristype.dev/datex/common/5791375928854455031.html).
- [UrlOrFilePathToFilePath](https://wshcm-docs.boristype.dev/datex/common/5791375928854454940.html).
- [x-local и контекст процесса](https://wshcm-docs.boristype.dev/news/platform/7117695944111423091.html).
- [WebAppUrl](https://wshcm-docs.boristype.dev/datex/common/5791375928854454897.html).
- [AddUrlMapping](https://wshcm-docs.boristype.dev/datex/common/5620250451197911683.html).
- [wshcmx/types, lib/core/index.d.ts](https://github.com/wshcmx/types/blob/a3b1e43d0b2add53bbc1f2acc2c5128360e8c97b/lib/core/index.d.ts#L2407),
  revision `a3b1e43d0b2add53bbc1f2acc2c5128360e8c97b`:
  `UrlOrFilePathToFilePath` — 2407, `UrlToFilePath` — 2415,
  `UrlToOptFilePath` — 2426. Последняя declaration возвращает `string`,
  хотя комментарий и C-пробы показывают также `undefined`.

Native mapping evidence: 53 входа в трёх конечных probes, без сетевых загрузок
или изменения конфигурации; отдельно чтение/info одного файла через три схемы.
Исходники mapping probes имели SHA256:

- [27 входов](../probes/path-mapping.bs): `72b00daa7d14014d9663941b7944771dc6889413a7f9a7fe2fe9d2aeb87c3616`.
- [23 входа](../probes/path-followup.bs): `c47fb94d45962dc5396c0dabcfae86e8a41023180307c4705478479fd17937da`.
- [Три UI-адреса](../probes/path-assets.bs): `29ccede534d94fd381a0ea636e72b0e94dc52e5a348d8ca88cdbe717eb3ada0d`.

Это тела BS eval с верхнеуровневым `return EncodeJson(rows)`; все циклы конечны,
операции ограничены разбором/преобразованием URL. Skill включает исходники,
а транспорт запуска выбирается для доступной тестовой среды. В standalone
агенте способ возврата результата может требовать адаптации; её нужно записать.
Ошибки и `not defined` в результате ожидаемы: это mapping probes, а не тесты,
в которых все входы должны успешно разрешаться. Пробы содержат примеры путей
проверенной установки, включая `/WebsoftServer`; на другой установке сравнивай
семантику и отдельно учитывай её корень.

В `path-followup.bs` вызовы `UrlHost`/`UrlPath` выполняются вне `try`.
Если на другой версии один из них бросит исключение, проба завершится раньше
сборки JSON; исходник сохранён в том виде, в котором проверялся. Эти три файла
проверяют mapping, а наблюдение read/info относится к отдельной прежней пробе.

Для воспроизведения отдельного наблюдения достаточно вызвать `UrlToFilePath`
для соответствующего входа в таблице, поймать ошибку и записать результат/тип.
Для optional-варианта проверяй `DataType(UrlToOptFilePath(url))`, а не строку
`"undefined"`. Сначала уточни версию и carrier; преобразование не требует
создавать файл, но проверку чтения следует делать на своей ограниченной fixture.

Образ `websoft/hcm:2025.2.1333`, image ID
`sha256:0edeac24afc2a5371ea8431c59b1c17ca2b1a9e5a3768275cfdb5023609e34ab`.
Статически прочитанный `xHttp.ini`, SHA256
`2df12d723ede6505468290cc05db84e92e3eb11e1d6bb33defca5c067fd9bcd5`.
Полные vendor-файлы и учётные данные в skill не включены.
