> Исторический материал из `plans/mcp-server/05-dotnet-search-research.md` (baseline `8ff2739`).
> Статусы, команды и утверждения ниже относятся к описанному этапу; актуальные входы — [refs](../../README.md).

# MCP: .NET в установленном WebSoft HCM и возможность поиска

Дата: 2026-11-06. Статус: **исследование поставки, конфигурации и существующих
логов; собственная DLL не собиралась и не загружалась**.

## Область и способ проверки

Исследована та же локальная установка, что в [native e2e](04-local-e2e.md):
`websoft/hcm:2025.2.1333`, image ID
`sha256:0edeac24afc2a5371ea8431c59b1c17ca2b1a9e5a3768275cfdb5023609e34ab`.
Контейнер HCM и PostgreSQL оставлены остановленными.

`docker export` прочитан потоково без сохранения полного rootfs. Посчитаны
обычные файлы с расширением `.dll` под `/WebsoftServer`; для каждого вычислен
SHA256. Export не включает named volumes: каталоги Logs, applications,
wt/web/webtutor, wt_data и ft-idx проверены отдельно, DLL там нет. В bind-каталоге
установочных файлов `/tmp/wt` DLL также нет. Symlink/hardlink DLL в rootfs
не обнаружены. Vendor binaries, полные конфигурации и логи в git не добавлялись.

## Инвентаризация файлов

- **631 файл DLL**, 540 452 840 байт (около 515,4 МиБ).
- **513 разных имён** без учёта регистра; **623 разных SHA256**.
- По префиксу имени: Datex — 17, Websoft — 42, System/Microsoft — 471,
  остальные — 101. У Datex и Websoft внутри каждой группы имена уникальны.

| Каталог относительно `/WebsoftServer`      | DLL |
| ------------------------------------------ | --: |
| `dotnetcore/core`                          | 434 |
| `dotnetcore/libs`                          |  98 |
| `platform/storage`                         |  43 |
| `platform/mediaservice`                    |  38 |
| `platform/lucene`                          |   7 |
| `components/datex_mediasoup_virtualclient` |   4 |
| `platform/libssl`                          |   2 |
| Другие каталоги                            |   5 |

Это число файлов, а не число загруженных сборок или доказательство языка C#
для каждого файла. Два файла с одинаковым именем могут иметь разные версии
или содержимое; одинаковые SHA256 подтверждают только совпадение байтов.

Примеры реально присутствующих библиотек:

- `dotnetcore/core/linux/Datex.Core.dll`, `Datex.Global.dll`, `Datex.XHTTP.dll`;
- `dotnetcore/core/components.platform/Datex.Components.Handler.dll` и
  `Datex.Components.PackageManager.dll`;
- `platform/lucene/bin/Websoft.Lucene.dll` и зависимости `Lucene.Net*.dll`;
- `platform/ftindex/bin/Websoft.FTIndex.dll`;
- `platform/storage/bin/Websoft.spxml_pssql_bridge_core.dll` и unibridge;
- `dotnetcore/libs/WebSoft.RegExp.dll`, `Websoft.Office.*.dll`, `Websoft.Zip.dll`;
- `components/push_notifications/bin/Websoft.PushNotifications.dll` и
  `components/workspace_conversations/bin/Websoft.Workspace.Conversations.dll`.

## Подтверждение по runtime-логам

В существующем `/WebsoftServer/Logs/dotnetcore_2026-11-06.log`:

```text
Assembly Version: 2.25.12.4 [202512041524]
CLR Version: .NET 9.0.11
Inform: xHttp .Net initializing...
Inform: xHttp .Net initialized
```

В логе за 2026-11-05 есть debug-сессии: **25 событий загрузки managed library,
23 разных имени загруженных сборок**. Среди них Datex.Components.Handler,
Datex.Components.PackageManager, Websoft.FTIndex, Websoft.Lucene, Lucene.Net,
Websoft.spxml_pssql_bridge_core, Websoft.PushNotifications.
Это наблюдения нескольких запусков, а не полный список сборок одного процесса.

Там видны `Starting in Debug Mode`, `Librarys Dirs`, `Native Librarys Dirs`,
`Loading managed library`, найденный путь DLL, полное имя/версия сборки,
а также сообщения об ошибках со stack trace. В составе поставки находится
`Datex.XHTTP.runtimeconfig.json` с net9.0 и included frameworks 9.0.11;
отдельный Datex.Core.runtimeconfig.json ещё содержит net8.0. Версия реально
работавшего CLR установлена по логу, а не по одному выбранному JSON.

Дополнительные существующие журналы: `components_YYYY-MM-DD.log`,
`xhttp_middleware_YYYY-MM-DD.log`, `spxml_unibridge_YYYY-MM-DD.log`.
Components debug-log содержит этапы инициализации компонентов.

## Конфигурация и отладка

Проверены только относящиеся к .NET строки фактического `/WebsoftServer/xHttp.ini`:

```ini
DOTNETCORE: 1
DOTNETCORE-XHTTP: 1
DOTNETCORE-PATH: dotnetcore/core
DOTNETLIBS-PATH: dotnetcore/core,dotnetcore/core/components.platform,platform,dotnetcore/libs,dotnetcore/tempdll,dotnetcore/shared,components
DOTNETCORE-DEBUG: 0
DOTNETCORE-XHTTP-DEBUG: 0
DOTNETCORE-DEBUG-INVOKE-GLOBAl-ENV: 0
DOTNETCORE-XHTTP-WRITE-STATIC-CONTENT: 0
```

Следующие назначения описаны в [справочнике xHttp.ini](https://wshcm-docs.boristype.dev/news/monolith/6747986263544912377.html).
Присутствие флага в справочнике не подтверждает его реализацию на всех версиях;
отдельных native probes для этих флагов не проводилось.

| Флаг                                                      | Документированное назначение                                               |
| --------------------------------------------------------- | -------------------------------------------------------------------------- |
| `DOTNETCORE-DEBUG`                                        | Общий режим отладки; требуется для `DOTNETCORE-DEBUG-*`                    |
| `DOTNETCORE-DEBUG-CREATE-OBJECT`                          | Создание объектов: тип, ключ, наличие в кеше                               |
| `DOTNETCORE-DEBUG-INVOKE-METHOD`                          | Вызовы методов объекта                                                     |
| `DOTNETCORE-DEBUG-INVOKE-GLOBAl-ENV`                      | Вызовы методов JS xhttp (PrimeStatic); регистр имени сохранён из источника |
| `DOTNETCORE-DEBUG-CANCELLED`                              | Контролируемое прерывание Cancel/Kill                                      |
| `DOTNETCORE-DEBUG-UNHANDLED`                              | Прерывание кода по ошибке                                                  |
| `DOTNETCORE-XHTTP-DEBUG`                                  | Отладка xHTTP middleware; требуется для его debug-подфлагов                |
| `DOTNETCORE-XHTTP-DEBUG-CANCELLED`                        | Прерывания операций middleware                                             |
| `DOTNETCORE-XHTTP-DEBUG-CONTROL-WEBSOCKETS`               | Работа WebSocket                                                           |
| `DOTNETCORE-XHTTP-DEBUG-WEBSOCKETS-BODY` и `...-BODY-LEN` | Содержимое WebSocket-сообщений и предел вывода                             |
| `DOTNETCORE-XHTTP-DEBUG-HEARTBEAT`                        | WebSocket ping                                                             |
| `DOTNETCORE-DEBUG-VFS`                                    | Отладка VFS                                                                |

Флаги не менялись, сервер не перезапускался. Возможность пошаговой отладки
собственной DLL через IDE здесь не проверена; трассировка в логах и подключение
managed debugger — разные проверки.

## Следствие для MCP-поиска

Собственный managed-компонент соответствует уже используемому устройству
платформы. Для файлового поиска можно использовать .NET IO и Regex без запуска
внешнего grep и без реализации обхода/поиска на BS. Одна DLL может обслуживать
Linux и Windows при совместимом target framework и отсутствии зависимостей
от конкретной ОС. Наличие DLL на Linux не доказывает её переносимость на Windows.

Предлагаемый следующий измеримый шаг — отдельная минимальная DLL, возвращающая
строку/JSON через документированный bridge. Проверить загрузку, аргументы,
Unicode/CRLF и передачу исключения; лишь затем реализовывать поиск. JSON carrier
предпочтителен для первого опыта из-за [уже найденных проблем SOAP](04-local-e2e.md).
Это предложение, не реализованный или принятый контракт.

Остаются вопросы для точечных проверок: сопоставление `x-local://` с файловой
системой/VFS, доступ к разрешённым корням, symlink/junction, кодировки,
отмена/timeout, лимиты файлов/байтов/результатов и жизнь загруженной сборки.
Наличие Lucene.Net не доказывает готовый API поиска по произвольным файлам;
полнотекстовый индекс HCM и поиск по дереву исходников требуют разных контрактов.

## Источники и границы доказательств

- [Подключаемые библиотеки](https://wshcm-docs.boristype.dev/news/platform/7117698192299190042.html):
  Datex.Global, платформенные ссылки; простое размещение в dotnetcore/libs названо устаревшим способом.
- [Библиотеки программного кода](https://wshcm-docs.boristype.dev/news/platform/7181083125928132263.html):
  инициализация DLL компонента, `assembly.Object.CallClassStaticMethod`, преобразование типов.
  Указанный там `spxml/libs` отличается от реально найденных выше `bin`.
- [Установка OmniCode](https://wshcm-docs.boristype.dev/news/platform/7165801003752482207.html):
  .NET SDK, DotNetBuild/OmniCode, включение debug-сообщений. Наличие этих IDE/build
  компонентов в исследованной поставке не подтверждено.
- [DOTNETCORE-XHTTP-DEBUG](https://wshcm-docs.boristype.dev/news/monolith/7106320523189059556.html):
  отдельное описание debug-сообщений о буферизации видео.
- [wshcmx/types, lib/dotnetcorehost/index.d.ts](https://github.com/wshcmx/types/blob/a3b1e43d0b2add53bbc1f2acc2c5128360e8c97b/lib/dotnetcorehost/index.d.ts),
  revision `a3b1e43d0b2add53bbc1f2acc2c5128360e8c97b`: `Object.GetAssembly`,
  `CreateClassObject`, `CallClassStaticMethod`. Это дополнительный референс
  сигнатур, не подтверждение native semantics собственного компонента.

Документация Datex может пропускать аргументы и содержать ошибки. Инвентаризация
и существующие C-runtime логи выше подтверждают только исследованную установку.
Новых C-runtime запусков, JS/mock проверок или тестов собственной DLL не было.
