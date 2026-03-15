# BT-IR: Консолидированное ревью (окончательное мнение)

**Дата:** 2026-03-14
**Источники:** Два независимых code review + верификация по коду
**Scope:** Весь пакет bt-ir (~8000 LOC)

---

## Методология

Было проведено два независимых ревью. Каждый пункт верифицирован по исходному коду.
Ниже — объединённый список проблем, ранжированный по формуле:

> **Приоритет = Критичность × Вероятность проявления × (1 / Трудозатраты)**

Где:

- **Критичность** — насколько серьёзные последствия
- **Вероятность** — насколько скоро проявится при обычной поддержке
- **Трудозатраты** — сколько усилий потребует исправление

---

## Результаты верификации второго мнения

| Пункт                                   | Утверждение                                    | Статус              | Комментарий                                                           |
| --------------------------------------- | ---------------------------------------------- | ------------------- | --------------------------------------------------------------------- |
| 3.1 pendingStatements                   | Мутабельный side-channel, высокий риск         | **✅ ПОДТВЕРЖДЕНО** | 21 push vs 3 flush. Работает сейчас, но хрупко                        |
| 3.2 break/continue try-finally          | Не обрабатываются                              | **✅ ПОДТВЕРЖДЕНО** | ADR-010 явно перечисляет как ограничение. Типы 3/4 зарезервированы    |
| 2.1 Walker не обходит expressions       | mapStatements не заходит в expression children | **✅ ПОДТВЕРЖДЕНО** | ReturnStatement.argument, VarDecl.init etc. не посещаются             |
| 3.3 Precedence только в lowering        | Emitter не добавляет скобки                    | **✅ ПОДТВЕРЖДЕНО** | precedence.ts = dead code (0 импортов!). Emitter = raw concat         |
| 3.4 ObjectProperty computed keys        | key: string вместо IRExpression                | **✅ ПОДТВЕРЖДЕНО** | Lowering молча пропускает computed keys (continue). Полностью сломано |
| 3.5 NameGen отдельный от BindingManager | Потенциальная коллизия                         | **✅ ПОДТВЕРЖДЕНО** | Маловероятная, но реальная проблема                                   |
| 4.3 collectVarNames дублирование        | collectVariableNames в emit-helpers            | **❌ ЛОЖНОЕ**       | Функции нет. Устаревший комментарий в walker.ts                       |
| 4.4 Lazy/circular imports               | Реальные циклические зависимости               | **⚠️ НЕАКТУАЛЬНО**  | Циклы разорваны текущей структурой                                    |

| Пункт (первое мнение)            | Утверждение                                           | Статус              | Комментарий                                                        |
| -------------------------------- | ----------------------------------------------------- | ------------------- | ------------------------------------------------------------------ |
| 1.1 Try-finally closure capture  | return в функции внутри finally захватывает \_\_fType | **❌ ЛОЖНОЕ**       | `transformReturnsInList` имеет `enterFunctions: false` — корректно |
| 3.5 emit-hoisting.ts dead code   | Файл не импортируется                                 | **❌ ЛОЖНОЕ**       | Файл уже удалён, не существует                                     |
| 1.2 Silent failures **unknown**  | console.warn вместо диагностик                        | **✅ ПОДТВЕРЖДЕНО** | ~7 мест с console.warn + IR.id("**unknown**"/"**invalid**")        |
| 1.3 Деструктуризация параметров  | Не реализована                                        | **✅ ПОДТВЕРЖДЕНО** | TODO в scope-analyzer и declarations                               |
| 2.1 Нет валидации порядка passes | Ordering implicit                                     | **✅ ПОДТВЕРЖДЕНО** | Только 2 прохода, но зависимость try-finally→hoist не enforced     |

---

## Окончательный ранжированный список

### Tier S — Исправить при следующей работе с файлом

#### S1. Silent failures (`__unknown__` / `__invalid__`)

- **Критичность:** Высокая — пользователь получает broken output без ошибки
- **Вероятность:** Высокая — каждый раз когда пользователь использует неподдерживаемую конструкцию
- **Трудозатраты:** 2-4 часа — собирать warnings в массив, заменить console.warn
- **Проявится:** Уже проявляется. Каждый новый пользователь может столкнуться
- **Файлы:** `lowering/expressions/dispatch.ts`, `operators.ts`, `calls.ts`, `statements/dispatch.ts`
- **Рекомендация:** Добавить `ctx.diagnostics: Diagnostic[]`, пушить туда вместо console.warn. В CompileResult — `warnings[]`. Для `__unknown__` ставить `success: false`.

#### S2. break/continue в try-finally — отсутствие диагностики

- **Критичность:** Высокая — некорректный runtime (finally пропускается)
- **Вероятность:** Средняя — паттерн `break` внутри `try { for() { break } } finally {}` не частый, но реальный
- **Трудозатраты:** 2-3 часа (диагностика), 2-3 дня (полная реализация типов 3/4)
- **Проявится:** При первом реальном try-finally + break/continue; может не быть обнаружено (тихая ошибка)
- **Рекомендация:** Минимум — добавить diagnostic error при обнаружении break/continue внутри try с finally. ADR-010 уже зарезервировал типы 3/4 для реализации.

---

### Tier A — Сделать в рамках текущего или следующего спринта

#### A1. Computed object property keys — полностью сломаны

- **Критичность:** Средняя — `{ [key]: value }` молча отбрасывается
- **Вероятность:** Средняя — computed keys используются в enum-like паттернах, dictionary builders
- **Трудозатраты:** 4-8 часов — расширить IRObjectProperty.key до `string | IRExpression`, обновить lowering + emitter
- **Проявится:** При первом использовании computed property в пользовательском коде
- **Рекомендация:** Расширить тип или как минимум добавить diagnostic error в lowering вместо silent `continue`.

#### A2. precedence.ts — dead code, emitter без скобок

- **Критичность:** Средняя — пока passes генерируют только простые выражения, но latent bug
- **Вероятность:** Низкая сейчас, высокая при добавлении optimization passes
- **Трудозатраты:** 4-8 часов — либо удалить dead code + задокументировать ограничение, либо интегрировать precedence в emitter
- **Проявится:** При первом pass с вложенными binary expressions. Emitter выдаст `a === 1 !== 0` вместо `(a === 1) !== 0`
- **Рекомендация:** Два варианта:
  1. Quick: Удалить precedence.ts, задокументировать что passes должны использовать `IR.grouping()` для сложных выражений
  2. Proper: Интегрировать precedence в emitter (автоматические скобки). Приоритетнее если планируются optimization passes

#### A3. Деструктуризация параметров — TODO без диагностики

- **Критичность:** Средняя — код с `function f({a, b}) {}` молча ломается
- **Вероятность:** Средняя — destructured params частый паттерн в TS
- **Трудозатраты:** 1 час (диагностика) / 2-3 дня (реализация)
- **Проявится:** При первом использовании destructuring в параметрах
- **Рекомендация:** Минимум — diagnostic error "destructured parameters not supported". Реализация — отдельная issue.

#### A4. Error boundary для passes/emitter

- **Критичность:** Средняя — при ошибке в pass нет контекста для отладки
- **Вероятность:** Средне-высокая — при разработке новых passes ошибки неизбежны
- **Трудозатраты:** 1-2 часа — обернуть `pass.run()` в try-catch с именем pass
- **Проявится:** При следующем баге в pass или emitter — дебаг будет мучительным
- **Рекомендация:** В `runPasses()` обернуть каждый `pass.run()` в try-catch: `throw new Error(\`Pass "${pass.name}" failed: ${err.message}\`)`.

---

### Tier B — Следующий спринт / при рефакторинге

#### B1. pendingStatements — мутабельный side-channel

- **Критичность:** Средняя — 21 push vs 3 flush, хрупкий контракт
- **Вероятность:** Средняя — при добавлении новых expression lowering (новые операторы, паттерны)
- **Трудозатраты:** 2-3 дня — рефакторинг visitExpression → `{ expr, pending }` или callback-паттерн
- **Проявится:** При добавлении expression visitor который вызывается вне statement контекста
- **Рекомендация:** Второе мнение предлагает `{ expr, pending }` return или `withPendingStatements(cb)`. Оба хороши. Приоритет: при первой серьёзной модификации lowering.
- **Примечание:** Сейчас работает корректно. Баг будет, только если кто-то нарушит implicit контракт.

#### B2. Walker: expressions внутри statements не обходятся

- **Критичность:** Средняя — блокирует будущие passes (DCE, constant folding)
- **Вероятность:** Средняя — при добавлении optimization passes
- **Трудозатраты:** 4-8 часов — добавить `mapIR()` или `expressionMapper` callback в `mapStatements`
- **Проявится:** При первом pass который должен трансформировать expressions внутри statements
- **Рекомендация:** Добавить `mapIR(program, { stmt?, expr? })` — единый обход. Или `mapStatements` с `expressionMapper?: (expr) => expr` опцией.

#### B3. Exhaustiveness checks в walker/emitter

- **Критичность:** Низкая-средняя — пропущенный case для нового IR node = silent bug
- **Вероятность:** При каждом добавлении нового IR node type
- **Трудозатраты:** 2-3 часа — добавить `const _: never = node` в default ветки
- **Проявится:** При следующем новом IR node — TS выдаст compile error (хорошо!)
- **Рекомендация:** Quick win. Добавить в: walker.ts (mapStatementChildren, mapExpressionChildren), emit-statements.ts, emit-expressions.ts.

#### B4. Pass ordering validation

- **Критичность:** Низкая сейчас (2 прохода), растёт с каждым новым pass
- **Вероятность:** При добавлении 3+ passes (планируется в roadmap)
- **Трудозатраты:** 2-4 часа — `dependsOn` + топологическая сортировка
- **Проявится:** При реорганизации passes или добавлении нового
- **Рекомендация:** Добавить `dependsOn?: string[]` в `IRPass`. В `runPasses()` — assertion.

#### B5. visitClassDeclaration — 429 строк

- **Критичность:** Низкая — работает корректно
- **Вероятность:** При любом баг-фиксе в классах — высокий риск регрессии
- **Трудозатраты:** 4-6 часов
- **Проявится:** При следующей модификации class support (private fields, decorators из roadmap)
- **Рекомендация:** Разбить перед реализацией private class fields (v0.4.0).

#### B6. isXmlRelatedType — нет кэширования

- **Критичность:** Низкая — производительность, не корректность
- **Вероятность:** При компиляции файлов с большим количеством property access
- **Трудозатраты:** 1-2 часа — `WeakMap<ts.Symbol, boolean>`
- **Проявится:** При больших файлах (500+ property access) — заметное замедление

---

### Tier C — Backlog / при появлении конкретного use case

#### C1. Глобальный BindingManager singleton

- **Трудозатраты:** 4-6 часов
- **Проявится:** Только при параллельной компиляции (worker threads)
- **Рекомендация:** Решить вместе с реализацией incremental compilation

#### C2. NameGen/BindingManager namespace collision

- **Трудозатраты:** 1 час
- **Проявится:** Крайне маловероятно (пользователь пишет `var __fType0`)
- **Рекомендация:** Добавить уникальный prefix (`__tfd_`) или задокументировать reserved names

#### C3. Walker: нет parent tracking и context accumulation

- **Трудозатраты:** 1-2 дня
- **Проявится:** При сложных optimization passes (scope-aware transforms)
- **Рекомендация:** Отложить до конкретного use case

#### C4. IR validation pass (debug-only)

- **Трудозатраты:** 1-2 дня
- **Проявится:** Полезно при разработке новых passes/lowering features
- **Рекомендация:** Создать при следующем крупном рефакторинге lowering

#### C5. Устаревшие комментарии (walker.ts, hoist.ts)

- **Трудозатраты:** 30 мин
- **Проявится:** Путаница при чтении кода
- **Рекомендация:** Удалить ссылки на несуществующий `collectVariableNames` в emit-helpers.ts

#### C6. Source maps

- **Трудозатраты:** 3-5 дней для MVP
- **Проявится:** Постоянно — каждый debug session транспилированного кода
- **Рекомендация:** Отдельный проект, high-value DX

#### C7. Generic platform type dispatch (GlobalCache → bt.cache)

- **Трудозатраты:** 2-3 дня
- **Проявится:** При добавлении новых platform-specific типов

#### C8. Expression dispatch refactor (if-chain → Map)

- **Трудозатраты:** 4-6 часов
- **Проявится:** Maintainability concern при >25 expression types
- **Рекомендация:** Отложить. Текущий стиль работает для ~20 типов

#### C9. usePolyfills flag не используется

- **Трудозатраты:** 15 мин
- **Рекомендация:** Задокументировать как "reserved for future explicit polyfill control"

#### C10. Дублирование assignment-логики и optional chaining в lowering

- **Трудозатраты:** 2-3 часа каждый
- **Рекомендация:** При следующей работе с operators.ts / dispatch.ts

---

## Отличия между двумя мнениями

| Вопрос                     | Первое мнение           | Второе мнение                      | Окончательное                                                            |
| -------------------------- | ----------------------- | ---------------------------------- | ------------------------------------------------------------------------ |
| Try-finally closure bug    | P0 — критическая ошибка | Не упоминается                     | **❌ Ложное** — код корректен (`enterFunctions: false`)                  |
| pendingStatements          | Не упоминается          | P0 — критичный рефакторинг         | **B1** — хрупко, но работает. Не P0, т.к. баг потенциальный              |
| break/continue try-finally | Не упоминается          | P1 — высокий приоритет             | **S2** — согласен, нужна минимум диагностика                             |
| emit-hoisting.ts           | P2 — dead code          | Не упоминается                     | **❌ Ложное** — файл уже удалён                                          |
| Computed object keys       | Не упоминается          | P3 — низкий приоритет              | **A1** — повышаю, т.к. полностью сломано (silent drop)                   |
| Precedence                 | Не упоминается          | P2 — средняя критичность           | **A2** — dead code + latent bug, нужно решить                            |
| Walker expression gap      | Не упоминается          | P1 — высокий приоритет             | **B2** — реальная проблема, но проявится только при новых passes         |
| Exhaustiveness             | Не упоминается          | P3 — низкий приоритет              | **B3** — повышаю: quick win с высоким ROI                                |
| Silent failures            | P0 — критичный          | Не упоминается напрямую            | **S1** — согласен, проявляется уже сейчас                                |
| Source maps                | P2 — средний            | Не упоминается                     | **C6** — high value, но отдельный проект                                 |
| Type info в IR             | Не внедрять сейчас      | Варианты A/B/C/D с рекомендацией B | **Согласованное:** Отложить. При необходимости — Вариант B (PassContext) |

---

## Информация о типах в IR Passes

### Текущее состояние

- TypeChecker используется только в lowering
- IR осознанно type-free
- Passes работают чисто синтаксически

### Рекомендация

Не внедрять сейчас. При появлении конкретного use case (например, boolean optimization P004):

- **Быстрый путь:** PassContext с опциональным TypeChecker (Вариант B, 1-2 дня)
- **Масштабируемый путь:** `typeHint?: string` на IRExpression + TypeAnnotator pass (Вариант C, 3-5 дней)

---

## Проблемы стека BorisScript

| Проблема                      | Причина                          | Неизбежность       | Потенциал оптимизации                       |
| ----------------------------- | -------------------------------- | ------------------ | ------------------------------------------- |
| Verbose env/desc boilerplate  | BS нет closures нативно          | Да, фундаментально | Минимален — desc паттерн обязателен         |
| `bt.isTrue()` для `\|\|`/`&&` | BS truthiness ≠ JS truthiness    | Да, ADR-009        | Boolean type optimization (P004) — отложено |
| State machine для try-finally | BS finally некорректен в runtime | Да, ADR-010        | Нет — единственный работающий подход        |
| let/const → var + rename      | BS нет block scope               | Да                 | Scope analyzer 3.5-pass покрывает это       |

---

## Сводка: что делать и когда

```
NOW (при следующем коммите в bt-ir):
├── S1: diagnostic система вместо console.warn      [2-4 часа]
├── S2: ошибка при break/continue в try-finally     [2-3 часа]
└── C5: удалить устаревшие комментарии               [30 мин]

СКОРО (текущий/следующий спринт):
├── A1: computed object keys (хотя бы диагностика)  [1-8 часов]
├── A2: решить ситуацию с precedence                 [4-8 часов]
├── A3: диагностика для destructured params          [1 час]
├── A4: error boundary в passes                      [1-2 часа]
├── B3: exhaustiveness checks (never)                [2-3 часа]
└── B4: pass ordering validation                     [2-4 часа]

ПРИ РЕФАКТОРИНГЕ (следующая крупная фича):
├── B1: pendingStatements refactor                   [2-3 дня]
├── B2: unified walker (mapIR)                       [4-8 часов]
├── B5: split visitClassDeclaration                  [4-6 часов]
└── B6: isXmlRelatedType caching                     [1-2 часа]

BACKLOG (при конкретном use case):
├── C1: убрать BindingManager singleton              [4-6 часов]
├── C6: source maps                                  [3-5 дней]
├── C4: IR validation pass                           [1-2 дня]
└── C7-C10: остальные                                [варьируется]
```

**Общая оценка:** Кодовая база в хорошем состоянии после Phase 1-3. Критических runtime-багов не обнаружено (оба кандидата — try-finally closure и emit-hoisting — оказались ложными). Основные проблемы — отсутствие диагностик для unsupported features (silent failures) и архитектурные ограничения которые проявятся при расширении (walker, passes, precedence).
