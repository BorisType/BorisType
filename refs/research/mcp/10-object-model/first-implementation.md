> Датированное техническое evidence; текущие основания — [тематическая запись](../../../mcp/xml-objects.md).
> Сохранены source revisions, hashes, provenance и ограничения исходного исследования. Текущий контракт проверяется отдельно; повторного native запуска при миграции не было.

# Первая реализация XML object tools

**2026-11-10.** Реализована ограниченная вертикаль «форма → XML объекта →
создание/полная замена». Исходный XML передаётся платформе без пересборки.
Это checkpoint трёх tools с native acceptance на одном типе, а не завершение
исследования всех объектов HCM.

## Контракт

| Tool                | Вход                                       | Результат                                                  |
| ------------------- | ------------------------------------------ | ---------------------------------------------------------- |
| `wshcm_get_form`    | `formUrl`                                  | Раскрытый root загруженной `XmlForm`: `{formUrl,root,xml}` |
| `wshcm_get_object`  | Точный decimal string `id`                 | Весь `TopElem.Xml`, actual form и `readToken`              |
| `wshcm_save_object` | `mode:"create"`, `formUrl`, `xml`          | Новый ID и readback после Save                             |
| `wshcm_save_object` | `mode:"replace"`, `id`, `readToken`, `xml` | Полная замена существующего объекта и readback             |

Create использует `OpenNewDoc → TopElem.LoadData → BindToDb → Save`. Replace
создаёт отдельный документ через `OpenDocFromStr`, привязывает к существующему
ID и сохраняет; пропущенные поля удаляются либо получают defaults. Переключать
форму существующего объекта или передавать arbitrary open options нельзя.
Tools работают через BS XML API и не требуют BorisType DLL.

Token выдаётся только после полного чтения, относится к одному MCP instance,
действует 30 минут; максимум 32 snapshots. Повторное чтение меняет token.
Каждая попытка replace после schema validation расходует grant, включая
неверный XML, конфликт и transport failure. Локальная очередь сериализует
операции. Сравниваются XML объекта, URL формы и XML раскрытой схемы, повторно
непосредственно перед Save. Это не atomic CAS относительно внешних writers.

XML и schema ограничены 256 KiB UTF-8 каждый, input depth 64 и 8192 элементами,
внутренний запрос — 2 MiB. Большое чтение отклоняется целиком без token.
Строгий SAX parser проверяет XML 1.0 и собирает только validation metadata;
native `XmlFormElem` проверяет paths, root, cardinality, scalar/structure shape
и integer lexical/range. Decimal/hex integer сравниваются через BigInt;
JSON ID всегда canonical positive decimal string. DTD, entity definitions,
произвольные PI и атрибуты данных запрещены; допустим совпадающий root
`SPXML-FORM`, declaration, CDATA и стандартные/numeric entities.

Ошибка содержит фазу, известный ID и `writeStatus`: `not_attempted`, `unknown`
либо `saved`. Первый статус означает, что Save не вызывался; form/load/init
уже могли выполнить код. После Save не обещаются rollback или отмена.
Автоматического retry нет. [Примеры и полный контракт](../../../../packages/mcp-server/README.md#xml-объектов-форма-чтение-сохранение).

## Что проверено локально

`pnpm --filter @boristype/mcp-server build` и `test`: **218/218**, без skips.
Это общий MCP suite, включая прежние файловые/XQuery tests; начальный baseline
был 151/151. Новые проверки покрывают:

- malformed XML, XML declaration/comments, trailing text, top-level CDATA,
  unknown entities, invalid Unicode/XML characters и limits;
- точные ID выше 2^53, hex XML identity, int64/uint64 boundaries, XML whitespace,
  неизвестные поля, дубликаты singleton и mixed content;
- tokens: чужой instance, TTL/eviction, замена предыдущего token, расходование
  при ошибках, очередь и stale object/form/schema;
- отсутствие Save на validation errors, ошибки Save/readback/transport без
  retry, сохранение ID/status при длинной диагностике и oversized readback;
- schema/inventory, stdio и escaping XML через существующий BS carrier.

JS doubles проверяют протокол и ветвления, не доказывают поведение C-runtime.
Pack/import/CLI smoke, ESLint изменённых TS sources, syncpack и format проходят
отдельно. `saxes` 6.0.0 использует declaration-only pnpm patch для пяти generic
bounds под TS 6; runtime не меняется, `skipLibCheck` не включён.
[Решение и альтернативы](../../../decisions/2026-11-10-native-xml-object-tools.md).

## Native acceptance

Linux HCM **2025.2.1333**, assembly **2.25.12.4 [202512041524]**, .NET **9.0.11**,
PostgreSQL 16, legacy model. Image ID, исходники, hashes, лог и cleanup receipt
закреплены в [evidence manifest](first-implementation-evidence.json).

Команда на уже запущенном эксклюзивном локальном стенде:

```bash
NODE_USE_ENV_PROXY=0 \
WSHCM_E2E_CONTAINER=boristype-c-runtime-net9-wt-1 \
WSHCM_E2E_USERNAME='<local-user>' WSHCM_E2E_PASSWORD='<local-password>' \
pnpm --filter @boristype/mcp-server test:e2e:objects
```

**8/8 Node tests**: семь сценариев и parent, без skips. Это CLI → stdio → SOAP
→ native XML API, без BorisType DLL в object path. Проверены раскрытый
`cost_center` с унаследованным `doc_info/creation`, create/read/whole replace,
Unicode/quotes/entities, точный большой parent ID, очистка пропущенного comment,
повторная запись прочитанного XML, consumed token, stale external writer и
missing object. Один сценарий содержит 11 плохих XML: root/field/integer/
singleton/identity, malformed/unknown entity, trailing text, top-level CDATA,
NBSP delimiter и uint64 overflow. После каждого отказа XML объекта неизменен.
[Полный лог](observed/first-object-tools-e2e.log).

Дополнительные bounded memory-only probes подтвердили:

- `OpenNewDoc + LoadData` сохраняет собственный OnCreate trace и заполняет
  переданный integer; `ArrayCount(FormElem)` различает scalar/structure,
  `OptChild` отсутствующего поля возвращает undefined;
- native ID `7349585223810462098` экспортируется как `0x65FEF8D23FAEB192`;
  сравнение фиксированного строкового форматирования hex неверно;
- длинная native diagnostic корректно сокращается `StrLeftCharRange` до
  2000 Unicode characters.

Исходники и sanitized transcripts находятся в `probes/first-*.bs` и
`observed/first-*.result.jsonl`. Код не адаптировался при выполнении; в
транскриптах нормализован только путь и убран elapsedMs. Прежние исследования
проверяются отдельно: **59/59** и **53/53** recorded observations/evidence checks;
они не добавляются к числу product tests.

## Исправления по отрицательным сценариям

`fast-xml-parser` validator принимал ряд невалидных XML, поэтому новый tool
использует строгий `saxes`. Guard BigInt не должен бросать исключение на входе,
уже отклонённом regex. Длинный native error и большой readback после Save
должны сохранять известный ID и факт сохранения. Teardown регистрируется до
инициализации независимого evaluator и фиксирует точный принадлежащий запуску
URL до upload, чтобы убрать его даже при потере ответа.

Эти случаи закреплены regression tests. Независимое code review завершено
без оставшихся Critical/Important замечаний.

## Очистка и оставшиеся границы

Тест удаляет только собственные выделенные ID через отдельный evaluator и
проверяет catalog/trash/OpenDoc. Отдельный read-only postcheck подтвердил
отсутствие шести известных ID и строк с собственным префиксом `bt-xml-e2e-`.
Физических fixtures/evaluators не осталось. WT затем PostgreSQL остановлены:
exit 143/0, OOMKilled=false; исходное stopped состояние восстановлено.
Конфигурация, vendor artifacts и установленная DLL не менялись.

Не аттестованы другие типы и их lifecycle, scalar conversions кроме integer,
business/UI authorization, foreign/uniqueness, atomic CAS/transactions,
Windows/MSSQL, новая объектная модель и cluster cache. Полный `TopElem.Xml`
не является binary/external-data backup. XML раскрытой формы может сохранять
ссылки `USE`; standalone re-registration не обещается. Delete/trash/restore,
typed JSON и patch DSL остаются следующими отдельными задачами.

Документация `XmlForm.Xml`: <https://wshcm-docs.boristype.dev/datex/common/5791375928854454848.html>.
Types reference: revision `a3b1e43d0b2add53bbc1f2acc2c5128360e8c97b`,
[xmlform:51](https://github.com/wshcmx/types/blob/a3b1e43d0b2add53bbc1f2acc2c5128360e8c97b/lib/xmlform/index.d.ts#L51),
[xmlformelem:179](https://github.com/wshcmx/types/blob/a3b1e43d0b2add53bbc1f2acc2c5128360e8c97b/lib/xmlformelem/index.d.ts#L179).
Документация/declarations сами по себе не являются native evidence.
