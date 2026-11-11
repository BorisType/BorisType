# Object model: sources, native observations и воспроизведение

Текущий контракт трёх tools — [XML objects](../../../mcp/xml-objects.md),
различия XMD/catalog/XMS/UI — [platform object model](../../../platform/object-model.md).
Эта директория хранит техническое evidence 2026-11-08/10: его исходники,
manifests, sanitized transcripts, verifiers и cleanup receipts сохранены
в одном комплекте. Это не текущий implementation plan и не новая acceptance.

## Как найти основание

| Нужный вывод                                                                      | Источник и степень подтверждения                                                                                                                |
| --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Полный XML, каталог-связка, SAMPLE/INHERIT/TYPE/custom fields                     | [XMD/catalog](xmd-and-catalogs.md): vendor/static + явно выделенные native observations                                                         |
| Точные declarations/пропущенные arguments/contradictions                          | [Types audit](declarations.md): wshcmx/types a3b1e43d0b2add53bbc1f2acc2c5128360e8c97b, не runtime proof                                         |
| SaveEvent(false), UI actions, права, notifications/related docs                   | [XMS audit](xms-and-business-logic.md): 18 vendor hashes/locators, business operations не запускались                                           |
| Browser client hooks/options/cache                                                | [JS reference](js-reference.md): pinned artifact hash и source locators, не C semantics                                                         |
| Defaults/hooks/post-write error, reduced-form loss, lost update, owned CRUD/trash | [Native 2026-11-08](native-evidence.md), [manifest](evidence-manifest.json)                                                                     |
| Expanded root XML, permissive import/wrong-root data loss, create/replace         | [Native XML 2026-11-10](xml-mvp.md), [manifest](xml-evidence-manifest.json)                                                                     |
| Product form/read/save tools и исправления negative paths                         | [First implementation](first-implementation.md), [manifest](first-implementation-evidence.json), [e2e log](observed/first-object-tools-e2e.log) |

## Что доступно без HCM

Из корня checkout:

```sh
node refs/research/mcp/10-object-model/probes/verify-results.mjs refs/research/mcp/10-object-model/observed
node refs/research/mcp/10-object-model/probes/verify-xml-results.mjs
```

Первые 59/59 и отдельные 53/53 — assertions над **записанными** native
observations/evidence hashes/cleanup, не число независимых production tests.
Product checkpoint отдельно содержит 218 local tests и 8 native Node tests.
Переносимые transcripts исключают vendor schema XML, сокращают stack до первой
строки, нормализуют путь probe и опускают elapsed time; manifests сохраняют
hash исходного и производного transcripts и source/evaluated hashes.

`observed/postcheck.bs`, `xml-postcheck.bs`, `first-postcheck.bs` — receipts
для **конкретных исторических ID**, не cleanup scripts нового запуска. Их
повторный запуск не удаляет/не проверяет автоматически новые выделенные ID.
Не изменять source/manifests/transcripts/verifiers попутно с форматированием
Markdown: hashes относятся к точным bytes.

## Prerequisites native-воспроизведения

Нужен отдельно предоставленный HCM runtime/config: Linux x64 HCM 2025.2.1333,
assembly 2.25.12.4 [202512041524], CLR 9.0.11, PostgreSQL 16, legacy model.
Точный image ID и carrier указаны в manifests. Полный vendor source и raw logs
не распространяются в git; hash без этих prerequisites не делает native серию
самодостаточной. Нужны authenticated ws-client evaluator, собранный ws-client,
HTTP/auth/arithmetic smoke и эксклюзивный fixture scope на локальном тестовом
стенде. BorisType DLL для object path не требуется.

Ручные `01-reflection.bs`, `02-values-and-hooks.bs`, `03-owned-crud.bs` и
`xml-core.bs`/`xml-crud.bs` запускаются по одному через carrier исследованной
установки без source transformation. Исторический внешний runner `wshcm-probes`
не входит в production package; универсальный repo CLI для этих raw sources
этот комплект не обещает. Первые/reflection — read/memory; values/hooks пишет
свой temporary XML, owned-crud/xml-crud создают и удаляют **только выделенный
ими ID**. Wrong-root negative намеренно разрушает свой объект. Не подавать
существующий чужой ID и не повторять их на production.

Для product acceptance есть отдельный `test:e2e:objects`; точный env, build и
команда — в [first implementation](first-implementation.md#native-acceptance)
и [package README](../../../../packages/mcp-server/README.md).
Runner не разворачивает стенд; native серия должна прекращаться после первой
ошибки. Timeout не отменяет серверный код и не разрешает blind retry. Сначала
проверить runtime state, известные ID и evaluator. После серии независимо
проверить catalog/trash/OpenDoc и physical fixture/evaluator debris; memory
form eviction исторически не доказан, cache освобождён остановкой процесса.

Linux evidence не аттестует Windows/MSSQL/new model/cluster/low-privilege claims,
все business lifecycles или binary cleanup. Неуспех API на legacy стенде не
доказывает его отсутствия универсально. Datex docs и types дают кандидаты и
сигнатуры; native statements относятся только к выполненным пробам.
