> Исторический материал из `plans/mcp-server/09-xquery-native.md` (baseline `8ff2739`).
> Статусы, команды и утверждения ниже относятся к описанному этапу; актуальные входы — [refs](../../README.md).

# Серверный XQuery: native acceptance и ограничения типов

Дата: 2026-11-07. Ветка: `feat/mcp-xquery`, база `d18b33e`.

Реализован один `wshcm_xquery`: передаёт query без изменений серверному `XQuery`,
включая `sql:`. Новая DLL, отдельное SQL-соединение и проверка запросов на чтение
не добавлялись. Успешный ответ содержит ограниченные rows и metadata усечения.
Read-only, идемпотентность, откат, отмена по transport timeout и lossless SQL типы
не гарантируются. Все SQL-запросы самой acceptance серии читают константы/каталог;
выполнение DML/DDL не проверялось.

## Среда и воспроизводимость

| Параметр            | Значение                                                                       |
| ------------------- | ------------------------------------------------------------------------------ |
| Образ C-runtime     | `websoft/hcm:2025.2.1333`, Linux amd64                                         |
| Image ID            | `sha256:0edeac24afc2a5371ea8431c59b1c17ca2b1a9e5a3768275cfdb5023609e34ab`      |
| Managed assembly    | `2.25.12.4 [202512041524]`                                                     |
| CLR / OS            | `.NET 9.0.11`, Ubuntu 24.04.3 LTS, x64                                         |
| БД                  | PostgreSQL 16, уже установленный локальный demo stand                          |
| Carrier инструмента | Node CLI → stdio MCP → authenticated SOAP → временная BS library/eval → XQuery |
| Query DLL           | Не используется                                                                |

Существующие postgres/wt контейнеры были остановлены перед проверкой. Они
запущены без recreation; готовность подтверждена HTTP 200, авторизацией,
SOAP `2 + 2 → 4` и `OK: net9-smoke`. Настройки WebSoft/SQL не менялись.
После всех проверок оба контейнера снова остановлены; OOMKilled=false.

Важные SHA256 исполнявшихся файлов:

| Файл                        | SHA256                                                             |
| --------------------------- | ------------------------------------------------------------------ |
| `resources/xquery.bs`       | `e0b1e6f433add50e2f0a0e242b1d433c18fc879b8e6910515578f5dc98853de1` |
| `test/e2e/xquery.mjs`       | `2b2966db664d13c66bef1a6ba82749d725089940eb1f4cd3e4e1bf552e0229d0` |
| `ws-client/build/client.js` | `d27e5856f4b3fde391aa7d031b7419c244ce1ca10ce02fac78410d679b3cfc1c` |

Raw evidence хранится вне git: локальный stand,
`research/xquery-native-9rnjdz2x/`: smoke, исходные диагностические BS-пробы и
их хеши/результаты, начальные неуспешные прогоны, итоговые e2e logs,
`source-build-hashes.json`, `post-tests-state.json` и `final-state.json`.
Vendor sources, credentials и дампы каталога в репозиторий не добавлялись.

## Пройденные проверки

`pnpm --filter @boristype/mcp-server test:e2e:xquery` с environment из package
README: **10/10 Node tests** (9 сценариев + parent), без skips/failures:

1. Обычный catalog XQuery с пустым результатом.
2. Непустая XML-строка каталога с `id`/`fullname`.
3. `sql:` с Unicode, кавычками, template-like текстом, большим positive integer
   и явным text cast отрицательного integer.
4. Сохранение quote/backslash, CR/LF, tab, U+2028/U+2029, `$&`, `${query}` и emoji.
5. Ограничение строк и lookahead на трёхстрочном SQL-результате.
6. Ровно maxRows и пустой SQL-результат без ложного truncated.
7. Oversized first row и усечение между двумя целыми строками по 40000 CJK
   символов; содержимое проверено SHA256, ответ укладывается в 256 KiB.
8. Ответ из 64000 emoji с точным SHA256 и итоговым UTF-8 envelope <=256 KiB.
9. Ошибка SQL передаётся как tool error; после серии подтверждён cleanup.

Большие output fixtures используют PostgreSQL `repeat`/`generate_series`;
этот набор нельзя считать MSSQL acceptance.

Из-за исправления общего HTTP клиента повторены существующие native команды:

| Команда               | Результат |
| --------------------- | --------- |
| `test:e2e`            | 28/28     |
| `test:e2e:edit`       | 1/1       |
| `test:e2e:read-aware` | 1/1       |
| `test:e2e:search`     | 1/1       |

Все без skips/failures. Для файловых регрессий использована ранее установленная
DLL alpha.4/API 2, SHA256
`47487c24cdd4cce518c718aa1336a80c7d4e52777ea2609cb7a1053267d843af`.
Ожидание tool inventory в файловом e2e обновлено с девяти tools до десяти.
Независимая проверка ФС после всех запусков: `unsafe_eval_*.bs` и `mcp-e2e-*`
не осталось; fixture/evaluator cleanup не потребовал fallback.

## Исправленная ошибка нашего HTTP транспорта

Первый большой CJK ответ имел 40001 JS code unit вместо 40000 и U+FFFD на
позиции 5660. `WshcmClient.makeRequest` накапливал строку через `data += chunk`,
неявно вызывая UTF-8 decoding отдельно для каждого Buffer. Граница HTTP chunk
могла оказаться внутри многобайтового символа.

Добавлен regression с реальным локальным HTTP server: SOAP payload передаётся
по одному байту на chunk, включая 2/3/4-byte символы. До исправления тест
получал `�`; после `res.setEncoding("utf8")` Node сохраняет незавершённую
последовательность между chunks, и строка совпадает точно. Native CJK/emoji
acceptance после этого также прошла. Это исправление ws-client, не нормализация
платформенных числовых значений.

## Наблюдения платформы: знак числа и строковые метрики

Отдельная BS-проба через тот же authenticated evaluator:

```javascript
var n = -1;
// alert(n), String(n), "" + n, StrInt(n) -> 18446744073709551615
// n < 0 -> true; n + 1 == 0 -> true
// EncodeJson(n) -> JSON text "-1"
var s = "👋";
// StrCharCount(s) -> 1; s.length -> 4
```

`alert` проверен по console log. SHA256 успешной пробы
`negative-number-output-v2.bs`:
`8402918ef4edf4ae54a62defb1cca8777daf56dbcb1402ce9a6d0669612dff34`.
Это подтверждает наблюдение пользователя о беззнаковом выводе числа для
конкретной C-сборки, но не означает беззнаковую арифметику. `EncodeJson(-1)`
в этой пробе сохраняет знак; другие значения/encoders требуют своих проверок.

Дополнение 2026-11-08: по уточнению пользователя проверены отдельные знаковые
formatters на той же C-сборке и через тот же carrier:

| Вызов                             | Полученная строка      |
| --------------------------------- | ---------------------- |
| `StrInt(-1)`                      | `18446744073709551615` |
| `StrSignedInt(-1)`                | `-1`                   |
| `StrSignedInt(-11500)`            | `-11500`               |
| `StrSignedInt(0)`                 | `0`                    |
| `StrSignedInt(11500)`             | `11500`                |
| `StrSignedInt(-9007199254740993)` | `-9007199254740993`    |
| `StrReal(-1)`, `StrReal(-1, 0)`   | `-1`                   |
| `StrReal(-9007199254740993, 0)`   | `-9007199254740992`    |
| `EncodeJson(-9007199254740993)`   | `-9007199254740993`    |

Таким образом, `StrSignedInt` сохраняет знак и цифры проверенных integer,
а `StrReal` не является точной заменой для больших integer. Это не аттестация
всего диапазона signed 64-bit или всех вариантов optional arguments.
В [документации StrInt](https://wshcm-docs.boristype.dev/news/platform/7163366631179989813.html)
отрицательный аргумент явно отмечен как некорректный; для знакового вывода описан
[StrSignedInt](https://wshcm-docs.boristype.dev/news/platform/7203008530070830541.html).
Сигнатуры и назначение сверены с
[wshcmx/types, lib/core/index.d.ts, revision a3b1e43](https://github.com/wshcmx/types/blob/a3b1e43d0b2add53bbc1f2acc2c5128360e8c97b/lib/core/index.d.ts#L252).
Декларации и статьи не использованы как доказательство native semantics.

Исходник и переданный код `signed-number-formatters.bs` идентичны, SHA256:
`966243313d75baf35e07da891ed19888bfd6ecf0b3fce99274390059f8fa6aa6`.
Результат и cleanup сохранены в `signed-number-formatters.log`,
сведения о референсе — в `signed-number-formatters-metadata.json` рядом с
остальными raw evidence. HTTP/authenticated SOAP smoke и независимая проверка
отсутствия evaluator/fixture files успешны; оба контейнера снова остановлены,
OOMKilled=false (`signed-number-final-state.json`). SQL→XML потери этим
форматтером не исправляются: там значение отсутствует уже до сериализации.

Бюджет query output использует `StrCharCount` и 65000 символов, оставляя место
для envelope даже при четырёх UTF-8 байтах на символ. JS VM с `.length` по UTF-16
не доказывает native единицу измерения. Перед native запуском эта граница уже
проверялась отдельным VM-тестом со счётчиком code points.

## Наблюдения платформы: SQL → XML → JSON

Первоначальный acceptance ошибочно предполагал сохранение отрицательного integer.
Диагностический SELECT возвращал 42, -7, 0, -2147483648, -2147483649,
9007199254740993, -9007199254740993, text cast отрицательного числа, NULL и `''`.
Полученные свойства XML и JSON:

| SQL значение                                            | XML/BS значение                                    | JSON `tools.object_to_text` |
| ------------------------------------------------------- | -------------------------------------------------- | --------------------------- |
| `42`, `0`                                               | integer, HasValue=true                             | `42`, `0`                   |
| `-7`, `-2147483648`, `-2147483649`, `-9007199254740993` | integer, HasValue=false, Value=null, XmlValue пуст | `null`                      |
| `9007199254740993`                                      | integer, Value сохраняет значение                  | `"9007199254740993"`        |
| `CAST(-9007199254740993 AS text)`                       | string со знаком и всеми цифрами                   | `"-9007199254740993"`       |
| `NULL` без явного типа, `''`                            | string, HasValue=false, Value=`""`                 | `""` для обоих              |

Независимый SELECT через psql вернул корректные `-7` и `-9007199254740993`.
XML `GetXml()` уже содержит `<neg TYPE="integer"/>`: отрицательное значение
отсутствует в платформенном представлении до JSON/MCP. Внутренняя причина
SQL→XML преобразования не установлена; не приписываем её строковому formatter.

SHA256 диагностической BS-пробы: `d1d3cdf04c09d4c2e1beb3a6eca08ca1921557c740dbb4e8ed17ae2a35a6a0d8`.
В итоговом acceptance signed integer явно приведён к `VARCHAR(32)` в SQL,
а ограничение отражено в tool description и документации. Восстановление
потерянных SQL значений и новый канонический serializer не реализованы.

## Границы evidence

Это одна Linux C-сборка с PostgreSQL. Supplied JS runtime, Windows HCM, MSSQL,
все SQL/Datex типы, decimal precision, даты, duplicate aliases, transactional
semantics и отмена запросов этим набором не аттестованы. Усечение ответа не
доказывает ограниченную работу SQL, а успешный cleanup не доказывает отмену
после timeout. Прогон не содержит performance/memory benchmark или зависающих
запросов. Развивать дополнительные гарантии можно отдельным измеримым шагом.
