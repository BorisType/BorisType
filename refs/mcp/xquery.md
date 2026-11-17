# XQuery: выдача, потери типов и неизвестный исход

`wshcm_xquery` передаёт query без изменений серверному XQuery, включая `sql:`.
BorisType DLL, отдельное SQL connection и read-only validator не используются.
Запрос может изменять данные; annotations помечают его destructive/non-idempotent.
Row/output limits ограничивают **ответ**, а не работу/память БД. Timeout клиента
не гарантирует отмены, rollback или отсутствие side effects; blind retry после
потери ответа требует сначала выяснить фактический исход.

[Handler](../../packages/mcp-server/src/tools/xquery.ts) ограничивает input
65536 UTF-8 bytes, требует непустую well-formed строку без NUL. maxRows default
100, диапазон 1–1000. BS читает до одной дополнительной строки, возвращает
rows/returnedRows/truncated/limitReason (`rows|output|null`). Ответ ≤256 KiB,
целая oversized строка не обрезается в середине. Пустой rows при output limit
не доказывает отсутствие данных. Carrier и согласованность envelope проверяются;
общий `WshcmApi.xquery` и `Evaluator.xquery` возвращают typed результат.
MCP выдаёт safe integer как JSON number, остальные integer как точную decimal
string; nonfinite real даёт ошибку. [Матрица и API](../../docs/reference/ws-client-values.md).

## Где теряются значения

[Native серия 2026-11-07/08](../research/mcp/09-xquery-native.md) различает
PostgreSQL value → XML/BS → JSON → SOAP → Node. Прямой psql control сохранял
отрицательные числа, тогда как XML уже содержал `<neg TYPE="integer"/>`:
`HasValue=false`, Value=null. JSON затем возвращал null. Это потеря **до SOAP**;
внутренняя причина SQL→XML mapping не установлена и не сводится к formatter.
`CAST(... AS text)`/VARCHAR в SQL сохранял знак и цифры. StrSignedInt после
потери не восстановит отсутствующее значение.

В той же выборке SQL NULL без явного типа и empty string стали одинаковым
`""`; positive 9007199254740993 сохранялся строкой. Для точного обмена задавать
явный SQL representation и, когда важно, отдельный NULL marker. Это не обещание
универсального serializer всех SQL/Datex типов. Новый SOAP-кодек сохраняет
integer как bigint и не восстанавливает уже потерянные SQL значения.
Текущий долг: [issue #70](https://github.com/BorisType/BorisType/issues/70),
[план локализации SQL→XML](../research/sql-xml-mapping.md).

Отдельно direct BS `-1` имел верную знаковую арифметику (`n<0`, `n+1==0`), но
String/concat/StrInt/alert показывали `18446744073709551615`. EncodeJson(-1)
сохранял `-1`. StrSignedInt сохранял знак и цифры проверенных integer, включая
-9007199254740993; StrReal(...,0) округлял последнее до -9007199254740992.
Это разные границы, не «все числа unsigned». [Numbers reference и probes](../../skills/websoft-hcm/references/numbers-and-sql.md)
сохраняют точные inputs/hashes; весь signed64 диапазон не аттестован.

StrCharCount("👋") дал 1, native `.length` — 4; JS VM `.length` измеряет
UTF-16 units. BS response budget использует 65000 characters через StrCharCount
с резервом под UTF-8/envelope. Модель счётчика в VM не становится native proof.
CJK/emoji cases выявили отдельную HTTP chunk decoding ошибку ws-client;
[transport](transport-and-lifecycle.md) объясняет исправление.

## Что подтверждено и где воспроизвести

Датированная native серия: Linux HCM 2025.2.1333/CLR 9.0.11/PostgreSQL 16,
SOAP evaluator; 10 Node tests (9 cases + parent), constant/catalog queries,
limits/Unicode/large output/error/cleanup. DML/DDL, MSSQL, Windows, другие HCM,
JS runtime, все decimal/date/duplicate aliases, transactions и cancellation
не проверялись. Предельные repeat/generate_series fixtures PostgreSQL-specific.
Новый Markdown не является повтором этой серии.

Точный env/команда `test:e2e:xquery` — в [package README](../../packages/mcp-server/README.md).
Требуются уже подготовленный эксклюзивный local stand и credentials; runner не
разворачивает его. Без HCM protocol/VM проверяет carrier/schema и ветвления,
а saved observation verifier проверяет только сохранённые данные. Документация
Datex и [types revision a3b1e43](https://github.com/wshcmx/types/blob/a3b1e43d0b2add53bbc1f2acc2c5128360e8c97b/lib/core/index.d.ts#L252)
задают reference сигнатур, не runtime acceptance.

## Typed SOAP/XQuery после #66–69

Все SOAP integer, включая небольшие значения, представлены bigint; JS number
всегда real. Native date/XML не получают неявного fallback общего кодека.
Query template проецирует XML на сервере по фактическим `.Value`/type/child metadata;
string leaves и имена защищены JSON-string carrier, integer/real остаются typed.
Дубликаты группируются в массивы, schema multi сохраняет singleton; dates — ISO strings.
Проекция ограничена depth32, 10000 values, whole rows и256KiB результата.

С добавлением [execute](execution.md) value projector и decoder вынесены в общие
`packages/ws-client/resources/value-projection.bs` и `src/value-projection.ts`.
XQuery сохраняет свой envelope, whole-row budgets и JSON presentation; отдельный
execution adapter использует ту же проекцию без копии XML/type mapping.

Это меняет прежний путь object_to_text/raw JSON; прежняя native серия выше
остаётся историческим evidence. [Новое решение](../decisions/2026-11-16-ws-values-xquery.md),
[исходная acceptance](../research/ws-values-xquery/results-preintegration.md),
[интеграция и выпуск](../research/ws-values-xquery/integration-release.md).
