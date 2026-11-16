# SQL→XML: потеря signed integer и различия NULL/пустая строка

Статус исследования и дальнейшая работа ведутся в
[issue #70](https://github.com/BorisType/BorisType/issues/70). Это известное
ограничение платформы; исправления SOAP #66–69 его не устраняют и могут выпускаться
независимо. Клиент не должен восстанавливать отсутствующее значение догадкой.

## Подтверждённое наблюдение

Linux C HCM 2025.2.1333 / PostgreSQL 16. Серверный `XQuery("sql: ...")` уже даёт:

| SQL                                              | XML / native значение                                         |
| ------------------------------------------------ | ------------------------------------------------------------- |
| `-7`, `-2147483648`, `-9007199254740993` integer | Пустой `<n TYPE="integer"/>`, `HasValue=false`, `.Value=null` |
| `CAST(-9007199254740993 AS VARCHAR(32))`         | Точная строка `"-9007199254740993"`                           |
| `NULL` без явного типа и `''`                    | В проверенной выборке оба дают string `""`                    |

Независимый PostgreSQL SELECT сохраняет знак. XML и `.Value` исследовались на
сервере до JSON/SOAP; это не следствие JS Number или SOAP parser. Причина внутри
SQL→XML пока не локализована. У signed integer и NULL могут быть разные причины.

Первичные результаты: [native query evidence](mcp/09-xquery-native.md).
Новый код и native runners: [контракт значений](../../docs/reference/ws-client-values.md),
[SOAP/XQuery evidence](ws-values-xquery/results-preintegration.md).

## Обход и границы

Для signed integer проверен SQL `CAST(... AS VARCHAR(32))`; длина должна вмещать
всё число. Для различения NULL/empty можно добавить `IS NULL` marker в SQL;
полную матрицу типов ещё нужно проверить. После потери StrSignedInt и новый JSON
encoder значение не восстановят. Прямой native SOAP integer `-7` теперь точно
передаётся как JS `-7n`: это другой участок обмена.

Нельзя переносить результаты на все SQL integer/decimal, Windows, MSSQL,
другие HCM/runtime/provider. Ни типизированный NULL, ни произвольный numeric
не получают blanket lossless гарантии по этим двум наблюдениям.

## Как локализовать

1. Зафиксировать HCM/OS/runtime, provider/assembly version и hashes; сохранить
   точный SELECT и независимый DB control. Не менять бизнес-записи.
2. Выполнить конечную матрицу smallint/integer/bigint: negative/zero/positive,
   int32/int64 boundaries; отдельно real/float, numeric/decimal, bool, date/time,
   varchar/text. Для NULL сравнить typed/untyped и empty values, не подменять
   native `.Value` строковым форматированием.
3. Для каждой точки сохранить DB value → XML/GetXml/HasValue/Value/DataType →
   SOAP → Node. Отличать преобразование reader/provider от XML construction и
   последующего formatting. Не использовать только native `==` как proof точности.
4. Сопоставить конечные результаты с доступным кодом/статическим анализом reader →
   XML. Если нужен runtime probe, ограничить owned/in-memory/SELECT сценариями;
   crash/hang эксперименты отделить от обычных regressions.
5. Если доступен второй provider/runtime, повторить только минимальные доказанные
   контрпримеры и явно отметить границы. Проверить обходы CAST и NULL marker.

Исследование завершено, когда найдена доказанная причина либо минимальный vendor
repro с точной областью применимости, сохранены regression fixtures и проверенные
обходы, обновлены issue и пользовательский контракт. До этого статус остаётся
«известное ограничение», без неподтверждённого client-side fix.
