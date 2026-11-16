# SOAP и XQuery: значения ws-client

`@boristype/ws-client` разделяет integer и real по типам JavaScript. При чтении
`integer` всегда становится `bigint`, при записи `bigint` всегда становится
integer. Любой `number`, включая `1`, передаётся как real. Это несовместимое
изменение для кода, который ожидал `number` от integer-полей.

## Матрица применимости

| Значение HCM          | `callMethod` / `eval`   | `evaluator.xquery`                           | JSON в MCP                                                       |
| --------------------- | ----------------------- | -------------------------------------------- | ---------------------------------------------------------------- |
| integer, signed int64 | `bigint`, в обе стороны | `bigint`                                     | Число в safe integer range, иначе точная decimal string          |
| real                  | `number`, в обе стороны | `number`                                     | JSON number; nonfinite даёт ошибку                               |
| string                | `string`                | `string`, CR/LF защищены                     | JSON string                                                      |
| bool                  | `boolean`               | `boolean`                                    | JSON boolean                                                     |
| null                  | `null`                  | `null`, если native scalar Value равен null  | JSON null                                                        |
| undefined             | `undefined`             | `undefined`                                  | Поле пропущено; элемент массива становится null по правилам JSON |
| array / record        | Рекурсивно              | Рекурсивно, XML-поля проецируются на сервере | Рекурсивный JSON                                                 |
| native date           | Явная ошибка            | ISO string через серверный `EncodeJson`      | JSON string                                                      |
| native XML            | Явная ошибка            | Проекция значений полей, без XML API         | Записи и массивы                                                 |

Диапазон integer: `[-2^63, 2^63-1]`. Выход за него отвергается до запроса.
Hex-ответы разбираются как 64-битный two's complement. Для отрицательного integer
запрос содержит unsigned decimal тех же битов: `-7n` → `18446744073709551609`.
На проверенном native C-parser signed decimal отвергается, а high-bit hex
искажается; арифметическое значение в HCM остаётся `-7`.

## Работа с результатом

```typescript
const result = await evaluator.xquery("sql: SELECT 9007199254740993 AS id");
const row = result.rows[0] as { id: bigint };
const next = row.id + 1n; // точная bigint-арифметика
await client.callMethod("x-local://wt/example.bs", "consume_id", [row.id]);
```

Смешивание `number` и `bigint` в арифметике требует явного преобразования.
`Number(id)` безопасно только после проверки диапазона. Для JSON выбирайте
представление явно; публичный ws-client не меняет тип integer по величине числа.
Тип generic-параметра `callMethod<T>` не преобразует runtime-результат.

Симметрия распространяется на поддерживаемые scalar/array/record значения.
Для SOAP record ключи на входе должны быть допустимыми XML-именами без `:`;
namespace-префиксы в ответе сохраняются, но для повторного ввода требуют
преобразования. Собственные `__proto__`/`constructor` поля сохраняются без смены
прототипа. Ссылочная идентичность не сохраняется. Циклы, custom objects, Date,
accessors, sparse arrays и невалидные XML-символы отвергаются.

## Граница real

JS `number` использует binary64; ограниченные пробы native C соответствуют этому
диапазону. Это не доказательство точного диапазона на всех версиях HCM.
Серверное SOAP-форматирование теряет точность уже на проверенной версии:

| Native значение      | SOAP real → Node |
| -------------------- | ---------------- |
| `1.2345678901234567` | `1.2345678901`   |
| `1.0000000000000002` | `1`              |
| ненулевое `1e-100`   | `0`              |

Поддерживаются `NaN`, `Infinity`, `-Infinity` и `-0`, но JSON не сохраняет эти
значения: MCP отвергает nonfinite, а `-0` отображается как `0`.
Обход серверного форматирования для точной передачи arbitrary real не реализован.
Сравнение `==` на C-runtime может считать близкие значения равными; для проверки
точности использовались signed разность и форматирование, а не одно сравнение.

## XQuery-проекция и пределы

`Evaluator.xquery(query, { maxRows?: number })`,
`WshcmApi.xquery({ query, maxRows? })` и экспортируемый `executeXQuery`
возвращают `{ rows, returnedRows, truncated, limitReason }`. Счётчик — JS number,
integer-поля строк — bigint. `maxRows` по умолчанию 100, диапазон 1–1000. Запрос
непустой, до 65536 UTF-8 bytes, без NUL и unpaired surrogates.

На сервере материализуется `ArrayRange` до `maxRows+1`; исходный lazy результат
не подсчитывается. XML scalar читается через `.Value`; complex XML обходится по
именам и дочерним узлам. Каталожный XMD остаётся на сервере: Node не угадывает тип
по тексту. Дубликаты имён группируются в массив; schema multi сохраняет singleton.
XML attributes, mixed text родителей и XML identity в data-проекцию не входят.

Приватный carrier хранит имена записей парами и JSON-экранирует строки. Integer/real
остаются native typed leaves в SOAP. Это сохраняет ключи вроде SQL aliases с
пробелами и строковые CR/LF, не добавляя пользовательский DSL.

Выдаются целые строки; лимит 65000 символов carrier оставляет место для envelope,
итог проверяется до 256 KiB JSON-compatible data. Глубина — до 32, суммарно до
10000 projected values; превышение этих пределов даёт ошибку. Одна строка
проецируется до проверки её размера. Эти пределы не ограничивают стоимость БД,
размер материализуемой строки или всю память сервера.

`sql:` передаётся без фильтрации. Нет гарантии read-only, идемпотентности, rollback
или отмены по timeout. Вызов не повторяется автоматически.

На Linux C/PG отрицательные SQL integer могут стать пустыми полями/null ещё при
SQL→XML; `CAST(-7 AS VARCHAR(32))` сохраняет signed текст. Untyped SQL NULL и пустая
строка могут оба стать `""`. SOAP-кодек не восстанавливает уже потерянные значения.
Расследование и критерии завершения: [issue #70](https://github.com/BorisType/BorisType/issues/70).

## Источники и проверка

Документация: [DataType](https://wshcm-docs.boristype.dev/datex/common/7172076235998782781.html),
[XmlElem](https://wshcm-docs.boristype.dev/datex/common/5607317807203771901.html),
[Real](https://wshcm-docs.boristype.dev/datex/common/5620276892448878734.html),
[StrReal](https://wshcm-docs.boristype.dev/datex/common/5620276892448878797.html),
[XQuery](https://wshcm-docs.boristype.dev/news/platform/7143925311248265325.html).
Документированный [ToJsValue](https://wshcm-docs.boristype.dev/datex/common/7562996252397277188.html)
на выбранном runtime дал `Unknown method`; адаптер обходит XML явно.

Сигнатуры сверены с `wshcmx/types` revision
`1d76d40c87ad6a9c249bd16f1bfea035dd815940`:
[lib/core/index.d.ts](https://github.com/wshcmx/types/blob/1d76d40c87ad6a9c249bd16f1bfea035dd815940/lib/core/index.d.ts),
[lib/xmlelem/index.d.ts](https://github.com/wshcmx/types/blob/1d76d40c87ad6a9c249bd16f1bfea035dd815940/lib/xmlelem/index.d.ts).
Документация и declarations не доказывают runtime semantics; Node doubles
проверяют логику, а SOAP/native серия — Linux C HCM 2025.2.1333 / PostgreSQL 16.
Windows, MSSQL и другие версии требуют отдельной проверки.

[API и команды проверки](https://github.com/BorisType/BorisType/tree/main/packages/ws-client#readme).
