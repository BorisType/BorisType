# Сведения о стенде

Публичный контракт — в [README SDK](../../packages/ws-client/README.md#сведения-о-стенде)
и [MCP](../../packages/mcp-server/README.md#сведения-о-стенде).
`WshcmApi.systemInfo()` владеет сбором и разбором; `wshcm_get_system_info` только
валидирует общий input и выдаёт JSON в text content, как остальные tools.

## Источник и выбранный формат

В веб-администраторе: шестерёнка внизу слева → «О программе…» → «Информация
о системе». Захваченный UI SOAP запрос вызывает
`tools_report.gather_system_info()` без аргументов; результат — `VALUE-TYPE="string"`.
Это штатный текст, а не XML-объект: заголовок с версиями/флагами и блоки
`xHTTP.ini`, `spxml_unibridge_config.xml`, `Global Settings`.

Поиск `gather_system_info` в `wshcm-docs` не дал статей. Declaration
[wshcmx/types, revision 1d76d40](https://github.com/wshcmx/types/blob/1d76d40c87ad6a9c249bd16f1bfea035dd815940/lib/tools_report/index.d.ts#L74)
задаёт `function gather_system_info(): unknown`: это подтверждение нулевого
числа аргументов, но не возвращаемого типа. Строка установлена UI capture
и native вызовами на указанной ниже сборке.

По согласованному контракту `summary` выдаётся всегда, исходный `report` —
только при `includeReport: true` (default false). Версии и режим — nullable
строки, флаги — nullable boolean. Известные labels разбираются только перед
первым разделителем из трёх или более `/`; неизвестные поля не угадываются.
Нераспознанные флаги — `null`. Значения в конфигурационных блоках не могут
переопределить сводку. Локализованные/изменённые заголовки требуют отдельной
проверки; отсутствие поля не превращается в false или пустую строку.

Подробные INI/XML блоки пока остаются текстом: INI содержит повторяющиеся
`DESIGN-DB`, а произвольный XML нельзя без выбранного контракта свести к
key/value. Будущий формализованный JSON с сохранением неизвестных секций,
повторов/порядка и исходного текста записан в [TODO](../../TODO.md).
Дополнительная очистка отложена по решению пользователя: сохраняется маскировка
поставщика, но не предполагается, что она скрывает все реквизиты Global Settings.
В fixtures используется только синтетический отчёт; реальные конфигурации
не включаются в репозиторий или native test output.

## Carrier и границы

Один evaluator вызов выполняет:

```js
return EncodeJson(tools_report.gather_system_info());
```

Клиент декодирует JSON string один раз. Это защищает CRLF/CR от нормализации
в SOAP XML. Пустой, malformed/non-string carrier, неполный Unicode и текст
более 256 KiB UTF-8 отвергаются целиком. До JSON.parse также ограничен размер
carrier. Лимиты действуют и для summary-only; они проверяются после сбора,
не ограничивают стоимость штатного сборщика и сетевой SOAP response.

DLL/runtime gate не используется, retry отсутствует. Временный evaluator
по-прежнему создаётся и удаляется общим connection lifecycle. Сведения относятся
к ответившему процессу; сборщик не объявлен согласованным снимком кластера.
Unsupported platform method/permissions/transport errors передаются как ошибки,
без fallback на чтение произвольных файлов.

`REAL-PRECISION: 10` наблюдался в xHTTP.ini. Связь с известным округлением real
остаётся гипотезой. Настройка не менялась и её влияние этим tool не проверяется.

## Native проверка 2026-11-17

Linux C `websoft/hcm:2025.2.1333`, image
`sha256:0edeac24afc2a5371ea8431c59b1c17ca2b1a9e5a3768275cfdb5023609e34ab`,
Ubuntu 24.04.3, PostgreSQL 16.16, Unibridge 2.25.10.8, run mode XHTTP.
Сводка: cluster=false, fullTextIndex=true, personalData=false.

После build SDK/MCP команда `test:e2e:system-info` прошла **1/1**, без skips.
Исходник: [native runner](../../packages/mcp-server/test/e2e/system-info.mjs).
Проверены реальные CLI → stdio → SDK → SOAP → native collector, default summary,
полный отчёт, version oracle и cleanup evaluator. Нет изменений бизнес-записей,
подготовки DLL, рестарта/изменения конфигурации стенда.

Версия сверяется с независимым SOAP `tools.get_version("wtv")`. Уточнение
первоначального UI observation: в capture этого запроса есть строковый аргумент
`wtv`; вызов без аргументов через текущий клиент дал `Empty url scheme` в
`wtv_tools.xml`. Он не используется реализацией нового инструмента.

Полный отчёт: **15835 bytes UTF-8**, **340 CRLF**, SHA256
`4e92f2dbbc42366796dc54ed40a3f2a9deab92ab01ea0b00b252efbcbb6131e8`.
С прямым SOAP `gather_system_info()` сравнивались SHA256 после нормализации
переводов строк, поскольку XML-парсер нормализует literal CR/CRLF. Отдельный
native probe с тем же EncodeJson carrier точно сохранил CRLF, CR, LF, tab,
кириллицу, CJK и emoji. Старый UI capture с нормализованными переводами строк
не является hash этого JSON carrier.

Дополнительная проба с U+0001 показала ограничение native EncodeJson/SOAP:
получился `VALUE-TYPE="binary"`, который общий SOAP codec явно отвергает.
Произвольные C0 controls этим carrier не аттестованы; успешная проба обычного
текста не означает поддержки всякого Unicode/control payload. Реальный штатный
отчёт текущего стенда прошёл. Windows HCM, MSSQL, другие версии/локализации
не проверялись.

Локальные Node suites прошли: SDK **215/215**, MCP **176/176**; сборка обоих
пакетов, MCP tarball smoke, ESLint затронутых TS, syncpack и docs checker также
прошли. Node suites используют синтетические данные и JS doubles, а не
C-runtime; их результаты не заменяют native acceptance. Команды сборки,
unit/pack и native проверки описаны в package README.
