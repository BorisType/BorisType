# Симметричные SOAP-значения и общий XQuery-адаптер

**Date:** 2026-11-16  
**Status:** Accepted

## Context

Issues #66–69 показали потери integer, смешение null/undefined, неполные массивы
и отсутствие рекурсивного ввода. MCP отдельно превращал query XML в JSON через
`tools.object_to_text`, поэтому ws-client не давал пригодный для кода typed результат.
Нужна симметрия поддерживаемых значений: результат можно использовать как аргумент.
Идентичность объектов не требуется. HCM SOAP real имеет собственные потери точности.

## Decision

Все integer представлены bigint (signed int64), все JS number передаются как real.
Null/undefined разделены; records/arrays рекурсивны. Отрицательные integer передаются
unsigned decimal тех же 64 битов, как подтверждено native C. Неизвестные типы и
malformed typed values отвергаются. Generic `callMethod<T>` остаётся assertion API.

`Evaluator.xquery` использует ws-client-owned BS-проекцию XML на native scalar и
records/arrays. Тип берётся с сервера, без загрузки XMD в Node. Приватный carrier
передаёт имена парами, string/date через EncodeJson, числовые листья — как native
integer/real через SOAP. Date в query data имеет явный ISO-string контракт.
Публичного DSL и XmlElem API нет. Результаты ограничены целыми строками, глубиной,
числом значений и размером. MCP вызывает общий адаптер и выбирает JSON-представление:
safe bigint → number, большие → decimal string, nonfinite real → ошибка.

## Consequences

Код с ожиданием integer как number должен перейти на bigint. Сохраняются `-7n`,
границы int64, пустые массивы, null/undefined и вложенные структуры. SOAP records
на входе ограничены XML-именами без namespace-префиксов. Невалидные XML characters
и numeric references не должны молча удаляться XML parser.

Точность real в SOAP остаётся известным ограничением. SQL→XML потери integer/NULL
происходят до адаптера. Query limits не ограничивают работу БД; timeout не отменяет
выполнение, автоматических retries нет. Native результаты относятся к Linux C
HCM 2025.2.1333 / PostgreSQL 16. Доказательства и матрица:
[public reference](../../docs/reference/ws-client-values.md).

## Alternatives Considered

- Small integer как number, большие как string: тип зависел бы от значения и терял
  различие integer/real; выбран единый bigint-контракт ws-client.
- Публичный key/value/type DSL: лишняя оболочка для типов, которые уже есть в JS.
- Парсить arbitrary XML/XMD на клиенте: существенно расширяет API и дублирует HCM;
  для XQuery достаточно серверной data-проекции.
- Оставить platform JSON MCP: не даёт общего typed API и смешивает transport с
  presentation. Перенесён в общий adapter с явным MCP JSON policy.
- Дополнительная server-encoding схема для real: отложена, потеря точности принята
  как известное платформенное ограничение.
