# Точечное редактирование XML объектов

Статус 2026-11-18: согласован scope SDK/MCP, реализация и acceptance в работе.
Основание — перенос выборочного присваивания из `feat/platform-objects-sync`,
revision `36cbb1937b148650e13cacc046552658ab3e788e`, а не merge старой CLI-ветки.
Пользователь подтвердил полную замену MULTIPLE без ключа и управляющий XML-атрибут
для режимов элементов с ключом. CLI будет следующим потребителем общего механизма.

## API и область

`WshcmApi.objects.patch({id,readToken,xml,dryRun?})` и
`wshcm_patch_object` работают с существующим объектом после полного get.
`dryRun` по умолчанию false. Вход — XML с корнем объекта и перечисленными полями;
пропущенные поля и соседние объекты не изменяются. Нет implicit create, смены
формы, remap ID, загрузки binary/external data и переноса CLI/runtime startup.
Существующие create/replace и их публичные контракты сохраняются.

Форма выбирается существующим документом. Root `SPXML-FORM` допустим только при
совпадении с actual form URL. Top-level id может отсутствовать или подтверждать
тот же exact ID; менять, очищать или снабжать его режимом нельзя. IDs — positive
decimal strings; integer XML остаётся exact decimal/hex в пределах прежнего
int64/uint64 контракта, без JS Number.

Read token, объектная очередь, 32 snapshots/30 минут и сравнение XML/form/schema
используют текущий ObjectReadState. Каждая попытка patch, дошедшая до handler,
расходует token, включая invalid XML, dryRun, no-op и ошибки. Перед следующим
patch/apply требуется свежий get. Проверка повторяется непосредственно перед
Save, а для preview/no-op — перед успешным ответом. Это не external atomic CAS.

## XML-режимы

Единственный новый управляющий атрибут — `bt-mode`; значения case-sensitive.
Атрибут является metadata patch и не переносится в сохраняемые данные. Любой
другой новый атрибут и неизвестное значение отклоняются до Save.

| Узел               | Без атрибута / merge                                                        | replace                                                            | clear                                                           | remove                                        |
| ------------------ | --------------------------------------------------------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------- | --------------------------------------------- |
| Корень             | Перенести переданные поля                                                   | Запрещён: есть отдельный whole replace                             | Запрещён                                                        | Запрещён                                      |
| Обычный scalar     | Присвоить native typed Value                                                | То же присваивание                                                 | Clear(), вход без данных                                        | Запрещён                                      |
| Обычная структура  | Перенести переданные дочерние поля                                          | Очистить только эту структуру, затем заполнить переданным составом | Очистить структуру, вход без данных                             | Запрещён                                      |
| MULTIPLE с ключом  | Upsert по явно переданному ключу, merge полей найденного элемента           | Заменить только выбранный по ключу элемент                         | Единственный пустой placeholder очищает весь одноимённый массив | Удалить выбранный элемент; отсутствие — no-op |
| MULTIPLE без ключа | Все переданные одноимённые элементы заменяют соответствующий массив целиком | Явное подтверждение той же полной замены                           | Единственный пустой placeholder очищает массив                  | Запрещён                                      |

Явный merge для MULTIPLE без ключа отклоняется: адресация элемента не определена.
Соседние MULTIPLE с другими именами независимы, в том числе при interleaving
под одним родителем. Вложенные массивы обрабатываются на своём уровне.
`<rows/>` в обычном merge — no-op; `<rows bt-mode="clear"/>` — очистка.
`<tag/>` — пустой элемент, `<tag bt-mode="clear"/>` — очистка массива tag.
Для полной замены keyed-массива режим replace ставится на его контейнер.

```xml
<cost_center>
  <name>Новое имя</name>
  <custom_elems>
    <custom_elem><name>setting_a</name><value>new</value></custom_elem>
    <custom_elem bt-mode="remove"><name>setting_b</name></custom_elem>
  </custom_elems>
</cost_center>
```

Для keyed-элемента ключ явно присутствует и не пуст, известен по actual XMD и
сравнивается по native значению/каноническому XML, без JS numeric coercion и без
сравнения Date по object identity. Duplicate keys во входе, неоднозначные совпадения
в целевом массиве, неподдержанная форма ключа и remove с дополнительными полями
отклоняются до Save. Clear нельзя смешивать с данными/другими элементами массива.
Replace keyed-элемента сохраняет его позицию; новые элементы добавляются в конец,
неупомянутые сохраняют порядок. При remove+insert другого ключа это две явные записи.
Старый `default="true"` не входит в первую SDK/MCP-итерацию; его семантика будет
отдельно определена при переносе CLI. Никакой произвольный XML attribute не
должен интерпретироваться платформой как обход выбранной формы.

## Native значения и признак изменения

Строгий SAX разбор сохраняет исходные текстовые данные и собирает bounded plan
с parent/ordinal для каждого реального вхождения. Native XmlForm проверяет пути,
singleton cardinality, scalar/structure shape, методы и integer range. Для patch
дополнительно исключаются тихие invalid scalar conversions: bool/real/date
проверяются до Save; неподдерживаемая conversion отклоняется явно. ISO date/dateTime
принимаются в проверенном платформой диапазоне, некорректные даты не становятся
default. Общая real precision граница платформы сохраняется и документируется.

Typed source нужен для platform conversion, plan — для различения явно
перечисленных полей и defaults формы. Обновляется открытый существующий документ;
его нельзя собирать заново только из TopElem.Xml и терять непричастное external
состояние. Общий native helper выполняет только применение полей и не делает
BindToDb/Save или обращение к БД; SDK владеет чтением, precondition и Save.

`changed` определяется по стабильному снимку persistent XML до и после применения.
Подтверждённый no-op пропускает Save, hooks и обновление doc_info. IsChanged и
сравнение `.Value === previous` не являются достаточным основанием.
Save вызывается максимум один раз. Результат содержит прежние id/formUrl/root/xml,
`changed`, `dryRun` и `writeStatus: not_attempted|saved`. Для no-op и dryRun Save
не вызывался; dryRun возвращает candidate XML. После Save возвращается readback:
hooks могут дополнительно изменить документ. changed описывает отличие кандидата
до Save, а не обещание отсутствия иных native effects.

Ошибки сохраняют phase/known id/writeStatus. Вход в Save — unknown, признанный
возврат — saved, даже если readback/представление сломались. Нет retries,
rollback, UI-equivalent authorization и остановки server code по client timeout.
Form/load/assignments могут исполнять код; not_attempted и dryRun не обещают
отсутствия вообще любых эффектов платформы.

Лимиты сохраняются: XML и schema по 256 KiB UTF-8, 8192 input elements, depth 64,
request 2 MiB; limits включают patch metadata. Метаданные не являются публичным
обходом XML/schema checks. Нет новых dependencies и изменения compiler/module ABI.

## Матрица acceptance

Нужны реальные shipped BS resources в VM tests и отдельный C-runtime acceptance.

- Scalar: string/Unicode/whitespace/CDATA/CRLF, empty versus clear, bool false,
  zero/negative/large integer/hex, finite real и invalid values.
- Dates: DataType Date()/new Date()/OptDate()/XML elem/.Value; equal reconstructed
  date, changed date, nested dates, same instant with offsets, date-only, empty,
  invalid text/calendar; поддержанная precision устанавливается native пробой.
- MULTIPLE: keyed add/update/remove/item replace/container replace/clear;
  сохранение неизвестных полей и неупомянутых элементов; scalar и compound
  unkeyed replacement, empty arrays/items, sibling/interleaved/nested arrays,
  duplicate/missing keys, order, hazardous XML field/key names.
- Каждый meaningful patch повторяется: второй вызов changed=false, Save count 0;
  отдельно structural-only изменения и no-op после перестройки равного массива.
- Lifecycle: SDK/actual MCP readToken consumption, no-op/dryRun, stale object/form,
  missing object, invalid input before Save, precondition recheck, failed Save,
  lost acknowledgement/transport, successful Save followed by readback failure.
- Native product path: собственные cost_center fixtures через SDK и CLI/stdio;
  full generic matrix — на собственных temporary forms/docs, с записанными code
  hashes, platform identity, cleanup и границами. Не распространять Linux C result
  на Windows/MSSQL/cluster и все бизнес-типы.

## Основания Date и IsChanged

Выполненные 2026-11-18 memory и own-file пробы на Linux C HCM 2025.2.1333:
Date()/new Date() дают DataType object/ObjectType BmObject; OptDate и XML .Value —
date; XML-элемент — object/XmElem. Равная реконструированная дата дала strictEqual
false при неизменном XML. IsChanged документа оставался false при изменении
строки/даты и состава массивов; SetChanged(true) давал true без XML изменения.
У TopElem свойство IsChanged отсутствовало. Это ограниченные native наблюдения,
а не утверждение обо всех runtime/местах выполнения.

Документация перечисляет [IsChanged как свойство XmlDoc](https://wshcm-docs.boristype.dev/datex/common/5620203358492510980.html#xmldoc)
и [SetChanged(bool)](https://wshcm-docs.boristype.dev/datex/common/5620276892448878756.html#xmldoc-setchanged).
Declarations: wshcmx/types revision a3b1e43d0b2add53bbc1f2acc2c5128360e8c97b,
[lib/xmldocument/index.d.ts](https://github.com/wshcmx/types/blob/a3b1e43d0b2add53bbc1f2acc2c5128360e8c97b/lib/xmldocument/index.d.ts).
Документация/declarations не заменяют эти наблюдения. Исходные пробы и результаты
будут сохранены в `refs/research/mcp/object-patch/` вместе с acceptance.
