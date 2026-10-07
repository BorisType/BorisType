# E-01. Expression evaluation: начальный brief

Статус: research brief, не accepted spec/ADR. Findings: R01–R03; downstream —
R05/R07/R12 и все consumers pending-statements. Основной пакет: bt-ir.

## Что уже известно

`maybeExtract` переносит execution assignment в общий `ctx.pendingStatements`.
`visitStatementList` вставляет эти statements перед whole source statement.
Это допустимо для части eager contexts, но не является общей semantics-preserving
linearization: effects теряют branch/loop evaluation point и относительный порядок.

- Logical/conditional visitors посещают branches и могут вынести их execution
  до проверки условия.
- Call visitor сначала lowering-ит args; поздний extracted arg может выполниться
  раньше раннего inline arg и callee.
- Loop visitors создают test/update expressions, но их pending effects могут
  оказаться до loop, хотя нужны повторные execution points.

Эти наблюдения объясняют конкретные failures, но не доказывают, что все остальные
forms теряют semantics. Нужен полный eager/lazy/frequency context audit.

## Инварианты для будущего spec

- Source effects выполняются ровно в исходном порядке и количестве.
- Невыбранные `&&`/`||`/`??`/`?:`/optional-chain части не выполняются.
- Callee/receiver/key, затем args — в требуемом source порядке; ранний operand
  value должен быть зафиксирован до поздней mutation, а не просто read позднее.
- Exception останавливает оставшиеся effects/args; catch/finally видят тот же
  момент completion, без исключений-носителей для обычного flow.
- While/do/for имеют отдельные entry/test/body/update points, включая continue
  и crossed finalizers. Перенос condition внутрь body не должен менять targets.
- Pure declarations можно hoist-ить; effectful initialization — нельзя выносить
  из execution point. Parameter initialization может происходить до function body.
- Простой code сохраняет fast path; no automatic IIFE, env/descriptor/args array
  на каждый extracted expression.
- Representation обязана сохранять value и Reference там, где они различны.
- Bare runtime bootstrap не начинает зависеть от helper, требующего script lowering.

## Варианты для сравнения

| Вариант                                                                         | Плюсы                                                                      | Риски/минусы                                                                                                                | Что проверить                                                                             |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| A. Scoped pending-effects с локальными rewrite consumers                        | Меньшая миграция, быстро закрывает отдельные branch bugs                   | Легко пропустить contexts; порядок ранних inline operands и loop points всё равно требует общего решения                    | One slice + args order + for/do/finally, не только RHS guard                              |
| B. Lowered expression result: value/reference + execution prelude/plan          | Явная композиция order/branch/frequency, общий механизм для bindings/calls | Меняет visitor API, нужно разделять declarations и effects, корректно материализовать ранние values                         | Prototype на binary/logical/call/loop; migration одного consumer, no extra pure-path cost |
| C. Rich semantic IR nodes для lazy effects/references, затем normalization pass | Изолированные IR/unit tests, semantics остаётся до выбора target shape     | Все walkers/passes должны понимать новые nodes; pass order/source targets; больше промежуточного IR                         | Устранение nodes до emitter, bootstrap/metadata и compatibility существующих passes       |
| D. Late IR→IR linearization существующего output IR                             | Можно централизовать backend/parser normalization                          | Не восстановит уже потерянные branch placement, repeated references и assignment values без сохранённой semantic информации | Что реально можно перенести в pass, а что исправлять в frontend lowering                  |
| E. Thunks/IIFE/CPS как общий механизм                                           | Проще отложить evaluation в некоторых контекстах                           | Новые scopes/this/arguments/closures, function/env allocations и дорогие calls; широкая перестройка control flow            | Только как альтернативный cost/control prototype, не presumed production strategy         |

Начальная рекомендация для исследования: **сравнить B и C** с минимальным A slice
как control. Возможен hybrid: явная effect/reference representation в lowering,
а parser-specific normalization — отдельный IR pass. Это пока гипотеза, не решение.
Нельзя решить задачу общим late pass, если frontend уже потерял информацию.

## Последовательность исследования

1. Перенести R01–R03 + positive controls в runner; добавить ранний read перед
   поздней mutation и exception в skipped/evaluated branch.
2. Составить таблицу всех `pendingStatements` producers/flush points и
   `maybeExtract` calls: eager / lazy / repeated / initialization-before-body.
3. Проверить raw parser shapes на supplied JS: inline conditional в каждом
   контексте, scoped if+scalar patterns, receivers/grouping/arguments.
4. Подготовить небольшой bounded C capability pack только для неопределённых
   target forms. Не просить полный C source, если нескольких результатов достаточно.
5. Для B/C/A сравнить generated forms и structural counts на 4–6 минимальных
   cases, описать migration boundaries. Не переписывать весь visitor ради прототипа.
6. Определить порядок normalization относительно update/completion/parser/hoist
   passes по создаваемым/потребляемым nodes, а не вставить pass наугад.
7. Представить recommendation + trade-offs + remaining C uncertainty; затем E-02.

## Что отдельно не смешивать с первым fix

- R04 setter return и R05 duplicated references — отдельные REF slices;
  expression representation должна их учитывать, но не требует полного fix в E-03.
- Numeric precision, full ToPrimitive, function reflection, enum/namespace и
  standard iterator runtime имеют отдельные contracts.
- Control-flow completion machinery уже существует; новый expression pass не
  должен вводить конкурирующую модель abrupt completion.

## Выход E-01

Отчёт с replayable evidence, recommended option и rejected alternatives;
draft E-02 spec, acceptance matrix, output/cost budget и конкретный первый slice.
Не считать E-01 завершённым одним успешным short-circuit case.
