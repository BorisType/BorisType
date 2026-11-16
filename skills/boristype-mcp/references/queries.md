# XQuery и SQL через BorisType MCP

## Вызов и ограничения

`wshcm_xquery` передаёт `query` без изменения серверному `XQuery` через
существующий evaluator. Новая DLL не нужна; отдельного `wshcm_sql` сейчас нет.
Префикс `sql:` поддерживается сервером без клиентского
`ALLOW-SQL-REMOTE-QUERIES`. Tool не включает этот флаг и не меняет конфигурацию.
Выбирай синтаксис для БД этой установки; PostgreSQL examples не аттестуют MSSQL.

```json
{ "query": "for $elem in collaborators where $elem/id = 123 return $elem", "maxRows": 10 }
```

```json
{ "query": "sql: SELECT CAST(-7 AS VARCHAR(32)) AS signed_text", "maxRows": 1 }
```

Это прямое исполнение запроса, а не read-only SQL sandbox: DML/DDL не
фильтруются. Аннотации destructive/non-idempotent предупреждают об этом,
но не обеспечивают пользовательское подтверждение. Выполняй запросы в пределах
задачи; readToken файловых tools их не ограничивает.

Ответ содержит `rows`, `returnedRows`, `truncated`, `limitReason` (`null`,
`rows` или `output`). `maxRows` по умолчанию 100, допускается 1–1000.
`returnedRows` — число выданных строк, не общий COUNT результата.
`truncated: true` означает неполный ответ; не считай его полным экспортом.
Даже `truncated: false` не доказывает lossless преобразование типов.

Query ограничен 64 KiB UTF-8, должен быть непустым, без NUL и lone surrogates.
Ответ ограничен 256 KiB UTF-8 и выдаётся целыми строками; слишком большая
первая строка даёт пустые rows с `truncated: true`, `limitReason: "output"`.
Лимиты не ограничивают объём обработки в БД, память сервера или время выполнения.
Общий ws-client `Evaluator.xquery` проецирует XML на сервере по фактическим
типам полей; integer/real проходят SOAP как bigint/number, строки защищают CR/LF.
Дубликаты имён группируются в массивы, schema multi сохраняет singleton-массив.
Даты превращаются в ISO-строки через native `EncodeJson`.
Проекция ограничена глубиной 32 и 10000 значений; превышение даёт ошибку.
XML attributes/mixed text не входят в эту data-проекцию.

## Потери SQL→XML и точные ID

**Native evidence:** Linux x64 HCM 2025.2.1333, C-runtime, CLR 9.0.11,
managed assembly 2.25.12.4 [202512041524], PostgreSQL 16;
authenticated eval во временной BS-библиотеке, 2026-11-07.

| SQL значение                             | Полученное JSON значение |
| ---------------------------------------- | ------------------------ |
| `-7`, `-2147483648`, `-9007199254740993` | `null`                   |
| `CAST(-9007199254740993 AS VARCHAR(32))` | `"-9007199254740993"`    |
| `9007199254740993`                       | `"9007199254740993"`     |
| `NULL` без явного типа, `''`             | `""` для обоих           |

В диагностике отрицательное integer уже отсутствовало в `GetXml()`:
`<neg TYPE="integer"/>`, `HasValue=false`, `Value=null`. Проверка проходила
на сервере до JSON и SOAP; независимый PostgreSQL SELECT сохранял знак.
Внутренняя причина SQL→XML не установлена. По одному новому tool response
нельзя самостоятельно локализовать другой сбой; здесь описан конкретный
исследованный случай. `StrSignedInt` и смена JSON encoder не восстанавливают
значение, которое уже потеряно при SQL→XML.

Если важны знак и все цифры integer/ID, верни его текстом в самом SQL,
до платформенного XML mapping. Для отрицательного числа CAST проверен;
для реального столбца выбирай достаточную длину, например
`CAST(id AS VARCHAR(32)) AS id` для signed 64-bit. Для decimal нужен отдельный
контракт точности и формата. При необходимости различать NULL и пустую строку
вычисляй явный marker в SQL, например CASE/IS NULL; это приём, а не проверенный
контракт всех SQL типов и платформ.

Текущая JSON-политика MCP: integer в диапазоне
`[-9007199254740991, 9007199254740991]` выдаётся JSON number, остальные — точной
decimal string. Поэтому `9007199254740993` приходит как `"9007199254740993"`;
обычный `JSON.parse` сохраняет цифры. Если по контракту поля это integer/ID,
`BigInt(value)` позволяет работать с ним точно. Real становится JSON number;
native SOAP-форматирование уже может терять точность, например
`1.2345678901234567` → `1.2345678901` на Linux C 2025.2.1333. Nonfinite real
(`NaN`, `Infinity`, `-Infinity`) даёт явную ошибку, `-0` отображается как `0`.
Undefined-поля пропускаются, undefined в массивах превращается в null по JSON.

Прямой `@boristype/ws-client` всегда возвращает integer как `bigint`, даже `42n`.
Для повторной передачи integer в `callMethod` используй bigint (`-7n`, `42n`),
любой JS number передаётся как real. Диапазон — signed int64. Прямой
`evaluator.xquery` возвращает typed rows с bigint/number; `JSON.stringify`
результата с bigint требует явного replacer. Это отдельный слой от MCP presentation.
SQL-to-XML потерю отрицательного integer клиент не восстанавливает; CAST выше
остаётся обходом на проверенной сборке. Не исправляй произвольный JSON regex-заменами.

Windows HCM, supplied JS runtime, MSSQL и все SQL типы этим evidence не покрыты.

## Ошибка, timeout и повтор

Проверь `isError`; tool сам запрос не повторяет. Timeout транспорта прекращает
ожидание, но не гарантирует остановку запроса или rollback. После потерянного
ответа изменение могло завершиться либо ещё выполняться. Установи исход
предыдущей операции и текущее состояние перед новым write; один SELECT текущих
данных не всегда доказывает, что старый запрос уже остановился. Если исход
не выяснен, сообщи неопределённость вместо автоматического повтора.

## Источники

- [XQuery](https://wshcm-docs.boristype.dev/news/platform/7143925311248265325.html)
  и [XmlElem](https://wshcm-docs.boristype.dev/datex/common/5607317807203771901.html).
  Datex/news и declarations сами по себе не доказывают runtime semantics.
- [wshcmx/types, lib/core/index.d.ts](https://github.com/wshcmx/types/blob/1d76d40c87ad6a9c249bd16f1bfea035dd815940/lib/core/index.d.ts)
  и [lib/xmlelem/index.d.ts](https://github.com/wshcmx/types/blob/1d76d40c87ad6a9c249bd16f1bfea035dd815940/lib/xmlelem/index.d.ts),
  revision `1d76d40c87ad6a9c249bd16f1bfea035dd815940`.
- [Текущий контракт ws-client/MCP, матрица и ограничения](https://github.com/BorisType/BorisType/blob/main/docs/reference/ws-client-values.md).
- [Native query acceptance и диагностика](https://github.com/BorisType/BorisType/blob/main/refs/research/mcp/09-xquery-native.md):
  самостоятельный справочник выше сохраняет существенные результаты без
  обязательного доступа к checkout, стенду или другому skill.
