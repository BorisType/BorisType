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
Строки проходят `tools.object_to_text(row, "json", 5)`; сохранение decimal,
дат, вложенности, NULL и повторяющихся aliases не гарантируется.

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

MCP возвращает исходный JSON text без повторной сериализации чисел в Node.
Если в нём есть numeric token вне safe integer range, обычный `JSON.parse`
в JavaScript может округлить цифры. Используй SQL text projection или lossless
JSON parser/tokenizer; преобразование уже округлённого Number в String/BigInt
не вернёт потерянные цифры. Не исправляй произвольный JSON regex-заменами.

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
  и [object_to_text](https://wshcm-docs.boristype.dev/news/platform/7163334555835046783.html).
  Datex/news и declarations сами по себе не доказывают runtime semantics.
- [wshcmx/types, lib/core/index.d.ts](https://github.com/wshcmx/types/blob/a3b1e43d0b2add53bbc1f2acc2c5128360e8c97b/lib/core/index.d.ts#L2613)
  и [lib/tools/index.d.ts](https://github.com/wshcmx/types/blob/a3b1e43d0b2add53bbc1f2acc2c5128360e8c97b/lib/tools/index.d.ts#L5104),
  revision `a3b1e43d0b2add53bbc1f2acc2c5128360e8c97b`.
- [Native query acceptance и диагностика](https://github.com/BorisType/BorisType/blob/main/refs/research/mcp/09-xquery-native.md):
  самостоятельный справочник выше сохраняет существенные результаты без
  обязательного доступа к checkout, стенду или другому skill.
