# Числа, форматирование и SQL→XML

## Область проверки

Наблюдения 2026-11-07/08 относятся к Linux x64 HCM 2025.2.1333, C-runtime,
CLR 9.0.11, managed assembly 2.25.12.4 [202512041524]. Carrier — authenticated
server-side eval во временной BS-библиотеке; SQL проверен на PostgreSQL 16.
Windows HCM, WebTutorAdmin, supplied JS runtime и MSSQL не проверялись.
Это результаты отдельных входов, не аттестация всего signed 64-bit диапазона.

## Отрицательное число и его строковое представление

Для `var n = -1` отдельно проверены:

| Выражение / операция | Результат                            |
| -------------------- | ------------------------------------ |
| `alert(n)`           | В console log `18446744073709551615` |
| `String(n)`          | Строка `"18446744073709551615"`      |
| `"" + n`             | Строка `"18446744073709551615"`      |
| `StrInt(n)`          | Строка `"18446744073709551615"`      |
| `n < 0`              | `true`                               |
| `n + 1 == 0`         | `true`                               |
| `EncodeJson(n)`      | JSON-текст `-1`                      |

Вывод похож на unsigned 64-bit представление, но сам по себе не доказывает
беззнаковую арифметику. Проверки сравнения и сложения в этой пробе сохраняют
отрицательный смысл значения. Внутренняя причина formatter не установлена.

## Выбор formatter

Для знакового целого есть отдельная функция `StrSignedInt`:

| Вызов                             | Полученная строка     |
| --------------------------------- | --------------------- |
| `StrSignedInt(-1)`                | `"-1"`                |
| `StrSignedInt(-11500)`            | `"-11500"`            |
| `StrSignedInt(0)`                 | `"0"`                 |
| `StrSignedInt(11500)`             | `"11500"`             |
| `StrSignedInt(-9007199254740993)` | `"-9007199254740993"` |
| `StrReal(-1)`, `StrReal(-1, 0)`   | `"-1"`                |
| `StrReal(-9007199254740993, 0)`   | `"-9007199254740992"` |

`EncodeJson(-9007199254740993)` также сохранил все цифры как JSON numeric text.
`StrReal` не заменяет точный integer formatter: на проверенном большом входе
теряется единица. Форматирование не исправляет значение, уже округлённое раньше.

**Документация:** [StrInt](https://wshcm-docs.boristype.dev/news/platform/7163366631179989813.html)
описывает неотрицательный аргумент и отдельно предупреждает об ошибочном
результате для отрицательного. [StrSignedInt](https://wshcm-docs.boristype.dev/news/platform/7203008530070830541.html)
предназначен для знакового целого; статья предупреждает о неверном результате
при аргументе >=2^63. Эта граница и все optional arguments native-пробой
не аттестованы. [StrReal](https://wshcm-docs.boristype.dev/datex/common/5620276892448878797.html)
форматирует real с настройкой precision; это описание не доказывает integer
точность. Datex может пропускать аргументы и ошибаться.

Сигнатуры и комментарии сверены с
[wshcmx/types, lib/core/index.d.ts](https://github.com/wshcmx/types/blob/a3b1e43d0b2add53bbc1f2acc2c5128360e8c97b/lib/core/index.d.ts#L252),
revision `a3b1e43d0b2add53bbc1f2acc2c5128360e8c97b`: `StrInt`, `StrSignedInt`,
`StrReal`. Declarations не служат доказательством полученных строк.

## Отрицательные SQL integer теряются до SOAP

В `XQuery("sql: ...")` проверены отдельные SQL-проекции:

| SQL значение                                            | XML/BS                                  | JSON `tools.object_to_text` |
| ------------------------------------------------------- | --------------------------------------- | --------------------------- |
| `42`, `0`                                               | integer, `HasValue=true`                | `42`, `0`                   |
| `-7`, `-2147483648`, `-2147483649`, `-9007199254740993` | integer, `HasValue=false`, `Value=null` | `null`                      |
| `9007199254740993`                                      | integer со значением                    | Строка `"9007199254740993"` |
| `CAST(-9007199254740993 AS text)`                       | string со знаком и всеми цифрами        | `"-9007199254740993"`       |
| `NULL` без явного типа, `''`                            | Пустое string-поле                      | `""` для обоих              |

Серверная диагностика сразу после XQuery уже получала
`<neg TYPE="integer"/>` в `GetXml()`, `HasValue=false`, `Value=null`.
Это до JSON encoder и SOAP-ответа. Независимый SELECT непосредственно в
PostgreSQL сохранял `-7` и `-9007199254740993`. Внутренний компонент SQL→XML,
теряющий значение, не установлен; не приписывай эту потерю строковому formatter.
`StrSignedInt` от отсутствующего XML-значения не является исправлением.

Проверенный обход — привести integer к тексту в SQL до XML mapping.
Дополнительно проверен `CAST(-9007199254740993 AS VARCHAR(32))` через серверный
XQuery: JSON сохранил `"-9007199254740993"`. Для другого столбца выбирай
достаточную длину; пример проекции signed 64-bit ID:

```sql
SELECT CAST(id AS VARCHAR(32)) AS id FROM your_table
```

Это пример для адаптации к реальной schema, а не проверенный запрос к таблице.
Если важен NULL, различай его в SQL до конвертации, например отдельным CASE/IS NULL
marker; его конкретный контракт тоже нужно проверить. Равные пустые строки
после mapping не доказывают эквивалентность NULL и `''` в БД.

В JavaScript consumer точные ID передавай как строки или разбирай исходный JSON
lossless parser-ом. Numeric token `9007199254740993` вне safe integer range:
обычный `JSON.parse` в Number может округлить его. Последующий String/BigInt
не восстанавливает цифры. Передача encoder-ом корректного JSON ещё не доказывает
сохранение точности каждым потребителем.

## Пробы и воспроизводимость

В установленный skill входят точные исходники прежних native-проб:

| Проба                                                                | Что проверяет                                                 | SHA256                                                             |
| -------------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------ |
| [number-output.bs](../probes/number-output.bs)                       | Вывод -1, сравнение/сложение, EncodeJson; также метрики emoji | `8402918ef4edf4ae54a62defb1cca8777daf56dbcb1402ce9a6d0669612dff34` |
| [signed-number-formatters.bs](../probes/signed-number-formatters.bs) | StrSignedInt, StrReal и большой integer                       | `966243313d75baf35e07da891ed19888bfd6ecf0b3fce99274390059f8fa6aa6` |
| [sql-number-mapping.bs](../probes/sql-number-mapping.bs)             | Constant SELECT, XML/type/HasValue/Value/JSON                 | `d1d3cdf04c09d4c2e1beb3a6eca08ca1921557c740dbb4e8ed17ae2a35a6a0d8` |

Это тела BS eval с верхнеуровневым `return EncodeJson(...)`; runner в skill
не требуется. Выбирай доступный carrier тестовой установки и записывай адаптацию,
если он отличается. Первая проба делает один alert; его текст проверяй по
серверному console log, не по JSON result. Остальные результаты возвращаются
JSON-текстом. SQL-проба PostgreSQL-specific из-за `AS text`; она читает константы,
не каталоги/таблицы, её цикл ограничен 20 полями. Пробы не меняют данные БД.
Создание/очистку временной библиотеки обеспечивает выбранный транспорт запуска;
клиентский timeout сам по себе не отменяет серверный код.

В прежних запусках код передавался без адаптации, cleanup evaluator подтверждён,
оба контейнера затем остановлены, OOMKilled=false. Эти сведения относятся к
исторической проверке, а не гарантируют очистку при новом запуске.
Исходники и существенные actual значения доступны без нашего MCP/компилятора
и без доступа к исходному checkout. Полные vendor-файлы и credentials не входят.

Источники SQL API:
[XQuery](https://wshcm-docs.boristype.dev/news/platform/7143925311248265325.html),
[object_to_text](https://wshcm-docs.boristype.dev/news/platform/7163334555835046783.html),
[core/index.d.ts](https://github.com/wshcmx/types/blob/a3b1e43d0b2add53bbc1f2acc2c5128360e8c97b/lib/core/index.d.ts#L2613),
[tools/index.d.ts](https://github.com/wshcmx/types/blob/a3b1e43d0b2add53bbc1f2acc2c5128360e8c97b/lib/tools/index.d.ts#L5104)
того же revision. [История native исследования](https://github.com/BorisType/BorisType/blob/main/plans/mcp-server/09-xquery-native.md)
содержит дополнительные контроли и границы; для применения facts выше она
не является обязательной зависимостью.
