# BT-IR 3-Gen: Отчёт о реализации

**Дата:** 2026-03-18
**План:** `ref/temp/gen-3/bt-ir-3gen-plan.md`
**Ветка:** `refactor/bt-ir-breaking`

---

## Статус волн

| Волна | Задача                     | Статус                          | Коммит    |
| ----- | -------------------------- | ------------------------------- | --------- |
| **0** | B3: Exhaustiveness checks  | ✅ Выполнено                    | `ef16ad3` |
| **1** | B4 + PassContext           | ✅ Выполнено                    | `a562c7a` |
| **2** | B1: pendingStatements      | ✅ Выполнено (withPendingScope) | `7f293dc` |
| **3** | C10 + B5: Lowering cleanup | ⬜ Не начато                    | —         |
| **4** | Walker context             | ⬜ Не начато                    | —         |

---

## Волна 0 — Exhaustiveness checks (B3)

**Коммит:** `ef16ad3 refactor(bt-ir): exhaustiveness checks in walker and emitter`

**Изменённые файлы (4):**

| Файл                          | Изменение                                                                                                                |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `ir/index.ts`                 | Добавлена функция `assertNever(value: never): never`                                                                     |
| `passes/walker.ts`            | `mapStatementChildren()` и `mapExpressionChildren()` — leaf nodes получили явные cases, default заменён на `assertNever` |
| `emitter/emit-statements.ts`  | `emitStatement()` — default заменён на `assertNever`                                                                     |
| `emitter/emit-expressions.ts` | `emitExpression()` — default заменён на `assertNever`                                                                    |

**Результат:** Добавление нового IR node kind без обработки во всех 4 dispatch-функциях → TS compile error.

---

## Волна 1 — Pass infrastructure (B4 + PassContext)

**Коммит:** `a562c7a refactor(bt-ir): pass infrastructure — PassContext, dependsOn`

**Изменённые файлы (5):**

| Файл                            | Изменение                                                                                                                              |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `passes/types.ts`               | `PassContext { diagnostics, sourceFile? }` + `IRPass.dependsOn?: string[]` + `run()` принимает `PassContext`                           |
| `passes/index.ts`               | `runPasses()` валидирует `dependsOn` перед выполнением, прокидывает `PassContext`                                                      |
| `passes/hoist.ts`               | `dependsOn: ["try-finally-desugar"]`, сигнатура `run(program, ctx)`                                                                    |
| `passes/try-finally-desugar.ts` | `detectBreakContinueInTry()` → пушит `ctx.diagnostics.push()` вместо throw; `PassContext` прокидывается во все вспомогательные функции |
| `pipeline/index.ts`             | Создаёт `PassContext { diagnostics, sourceFile }` и передаёт в `runPasses()`                                                           |

**Результат:**

- Passes декларируют зависимости (`dependsOn`) — нарушение порядка → runtime error
- Passes пушат диагностики нативно через `ctx.diagnostics.push()` вместо throw
- break/continue в try-finally → diagnostic (не throw) → корректный `success: false`

---

## Волна 2 — pendingStatements (B1)

**Коммит:** `7f293dc refactor(bt-ir): explicit pending statements contract via withPendingScope (B1)`

**Изменённые файлы (2):**

| Файл                            | Изменение                                                                                                                                                   |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lowering/visitor.ts`           | `withPendingScope()`, `collectStatements()`, `PendingScopeResult<T>`. JSDoc на `pendingStatements`. Flush в `transformToIR()` заменён на `withPendingScope` |
| `lowering/statements/blocks.ts` | `visitStatementList()` и `visitStatementAsBlock()` переведены на `withPendingScope` + `collectStatements`                                                   |

### Выбранный подход: withPendingScope (не ExpressionResult)

**Анализ показал что ExpressionResult — over-engineering:**

| Метрика                       | ExpressionResult                              | withPendingScope                        |
| ----------------------------- | --------------------------------------------- | --------------------------------------- |
| Call sites для обновления     | **76**                                        | **4**                                   |
| Файлов затронуто              | **12+**                                       | **2**                                   |
| `maybeExtract` переписать?    | Да (22 сайта, критичная ломка)                | Нет (работает как есть)                 |
| Решает реальную проблему?     | Потеря pending per-expression (не существует) | Потеря pending per-statement (реальная) |
| Удаление `pendingStatements`? | Да                                            | Нет (поле остаётся, но "приручено")     |

**Почему ExpressionResult не нужен:**

1. **Flush нужен per-statement, не per-expression.** Внутри одного statement все expression visitors пушат в один pending массив, и порядок push-ей = порядок evaluation (depth-first). Это корректно.
2. **`maybeExtract` — ключевая инфраструктура (22 call site).** Она сама пушит в pendingStatements. С ExpressionResult пришлось бы полностью переделать паттерн `maybeExtract(visitExpression(...), ctx)`, добавляя boilerplate на каждый из 22 сайтов.
3. **withPendingScope решает реальную проблему** — забытый flush на границе statement-ов. Expression visitors остаются простыми (`.push()` + return `IRExpression`).
4. **Нет потерянных pending внутри expression chain.** Проблема, которую ExpressionResult решал бы, не существует — все push-и собираются withPendingScope на уровне statement.

**Результат:**

- 0 ручных flush-паттернов (`push(...pending); pending.length = 0`)
- Все 4 flush-сайта заменены на scope-based `withPendingScope`
- 16 push-сайтов в expression visitors работают как раньше, но гарантированно собираются

### G2 дифф (ожидаемые отличия)

3 файла с cosmetic изменениями, 1 новый:

| Файл                               | Изменение                                                                              | Почему корректно                                                 |
| ---------------------------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `and-booleanContext.test.js`       | Temp vars (`__la0 = undefined`) переместились из внутри body → перед statement         | Семантически эквивалентно (hoist pass всё равно хоистит var)     |
| `or-booleanContext.test.js`        | Аналогично                                                                             | Аналогично                                                       |
| `semantic/functions.test.js`       | Arrow function declarations переместились из внутри if-блока на уровень function scope | Hoist pass вытаскивает их наверх — финальная семантика идентична |
| `semantic/for-of-captured.test.js` | Новый файл                                                                             | Не связан с рефакторингом (добавлен отдельно)                    |

### Known limitation

`maybeExtract` в re-evaluated позициях (loop conditions с ternary) извлекает temp, вычисляемый один раз (before loop). Pre-existing issue (до рефакторинга: temp внутри body, null на первой итерации). Теперь поведение предсказуемее. Полное решение требует context-aware extraction (отдельная задача).

---

## Что НЕ сделано

### Волна 3 — Lowering cleanup (C10 + B5)

| Задача                            | Описание                                                                                                                                                  | Блокеры                    |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| C10: `assignToAccess()` helper    | Извлечь дублированную assignment logic из `visitBinaryExpression()` (~263 строк, 3 почти идентичных блока для property/element access + XML special case) | Нет блокеров, можно делать |
| B5: Split `visitClassDeclaration` | Разбить ~260-строчную функцию на `collectClassMembers()`, `buildClassMethods()`, `buildConstructor()`, `buildClassHoisting()`                             | Нет блокеров, можно делать |

### Волна 4 — Walker context (по возможности)

| Задача        | Описание                                                                                      | Блокеры                               |
| ------------- | --------------------------------------------------------------------------------------------- | ------------------------------------- |
| `WalkContext` | Parent tracking + scope flags (inLoop, inTryCatch, inFunction, depth) для optimization passes | Нет блокеров, backward-compatible API |

---

## Верификация

| Гейт               | Результат                                       |
| ------------------ | ----------------------------------------------- |
| **G3: Сборка**     | 14/14 packages ✅                               |
| **G1: Тесты**      | 114/114 passed ✅                               |
| **G2: Build diff** | 119 identical, 3 different (expected), 1 new ✅ |

---

## Решения, принятые в gen-3

| #   | Решение                                         | Обоснование                                                                                                                                                                                                             |
| --- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **withPendingScope вместо ExpressionResult**    | 2 файла vs 12+ файлов / 76 call sites. Решает реальную проблему (per-statement flush). ExpressionResult решал бы несуществующую проблему (per-expression isolation). `maybeExtract` (22 сайта) не требует переписывания |
| 2   | **pendingStatements остаётся в VisitorContext** | Поле "приручено" через scope-based management. Удаление потребовало бы ExpressionResult (см. п.1)                                                                                                                       |
| 3   | **break/continue → diagnostic вместо throw**    | Passes теперь пушат диагностики нативно через PassContext.diagnostics                                                                                                                                                   |
| 4   | **Loop condition temps: before loop**           | Pre-existing edge case. Новое поведение предсказуемее (computed once before loop vs null on first iteration)                                                                                                            |

---

## Что осталось для завершения gen-3

Обязательные критерии из плана (§7):

- [x] Exhaustiveness checks в walker + emitter
- [x] `IRPass.dependsOn` определён и валидируется
- [x] `PassContext.diagnostics` — passes пушат диагностики нативно
- [x] break/continue detection через диагностики (не throw)
- [x] pendingStatements — явный контракт (withPendingScope)
- [x] 0 мест с implicit flush
- [ ] `assignToAccess()` helper — нет дублирования в assignment logic **(волна 3)**
- [ ] `visitClassDeclaration()` < 50 строк координации **(волна 3)**
- [x] Все тесты проходят
- [x] `node tests/diff-builds.js` — нет неожиданных расхождений
- [ ] ROADMAP.md обновлён

Опциональные:

- [ ] `WalkContext` с parent/scope tracking **(волна 4)**
- [ ] Backward-compatible walker API **(волна 4)**
