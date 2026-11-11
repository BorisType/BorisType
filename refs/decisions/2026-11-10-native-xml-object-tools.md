# Native XML для первых HCM object tools

**Date:** 2026-11-10

**Status:** Accepted

## Context

Объекты и XMD уже имеют XML-представление. Native C-runtime возвращает раскрытый
root через `XmlForm.TopElem.Xml`; повторная модель XML→JS→XML добавляет неоднозначные
scalar/default/array conversions. Успешный `OpenDocFromStr` при этом не является
валидацией: чужой root, неизвестное поле и неверный integer могут молча стать
default-only документом и очистить существующий объект после Save.

## Decision

Три tools: чтение раскрытой формы, чтение полного экспортируемого XML и явный
create/whole replace из XML. MCP JSON содержит строку XML и служебные параметры.
Платформенные операции выполняет BS XML API, без прямого SQL/.NET CRUD.

Node использует строгий потоковый `saxes` только для проверки XML 1.0 и сбора
ограниченных validation paths/text/cardinality. Исходный XML передаётся платформе
без пересборки. Загруженная `XmlForm` проверяет пути и integer metadata; полного
XSD/business validator нет. Разбор XMD исходников обычным XML parser не нужен.

Create: `OpenNewDoc` + `LoadData` нового документа, чтобы сохранить собственные
defaults/OnCreate. Replace: отдельный `OpenDocFromStr` + привязка к existing ID,
чтобы omitted поля действительно удалялись. Caller не меняет actual form при
replace. Full-read token ограничен текущим MCP instance; XML и форма сравниваются
ещё раз перед Save. Это compare-before-save, не atomic CAS.

Ошибки возвращают фазу, известный ID и статус Save; большой diagnostic не должен
стирать metadata. Никаких автоматических повторов или обещаний rollback/UI rights.

## Consequences

Небольшой XML transport сохраняет платформенные форматы ID, включая hex внутри
XML, без потери через Number. Проверки предотвращают исследованные structural
data-loss случаи, но остальные conversions, hooks, external data и бизнес-правила
остаются платформенными. Прочитанный XML не является полным storage backup.

Используется latest `saxes` 6.0.0 (проверено при добавлении). Его declarations
содержат пять unconstrained generic aliases, которые отвергает TypeScript 6.
В pnpm patch добавлены только требуемые `extends SaxesOptions`; runtime bytes
не меняются, `skipLibCheck` не включается. Patch и hash хранятся в репозитории.

## Alternatives Considered

- Typed JSON/patch DSL: отложены; не нужны для согласованного XML MVP.
- `fast-xml-parser` validator: локально принимает trailing text, top-level CDATA,
  неверные XML delimiters и declarations; набор частных regex-проверок был бы
  хрупким. Этот пакет остаётся в ws-client, новый tool его не использует.
- Direct SQL/.NET mutations: нет доказанного эквивалента object lifecycle.

[Native evidence и scope](../research/mcp/10-object-model/first-implementation.md).
