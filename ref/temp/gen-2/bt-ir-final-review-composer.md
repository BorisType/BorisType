# BT-IR: Окончательное ревью (финальная версия)

**Дата:** 2026-03-14  
**Источники:** Два независимых code review + верификация по исходному коду  
**Scope:** Весь пакет bt-ir (~8000 LOC)

---

## 1. Методология приоритизации

Используется формула:

> **Приоритет = Критичность × Вероятность проявления × (1 / Трудозатраты)**

Где:

- **Критичность** (1–5): 1 = косметика, 3 = архитектурная слабость, 5 = поломка корректности
- **Вероятность** (0.2–1.0): насколько скоро проявится при обычной поддержке
- **Трудозатраты** (1–5): 1 = часы, 3 = 1–2 дня, 5 = неделя+

Чем выше приоритет, тем раньше стоит исправлять.

---

## 2. Верификация утверждений второго мнения

| #                        | Утверждение                                                                             | Статус                | Детали                                                                                                                                                                       |
| ------------------------ | --------------------------------------------------------------------------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1.1**                  | Try-finally closure capture bug — return в функции внутри finally захватывает \_\_fType | **❌ ЛОЖНОЕ**         | `transformReturnsInList` использует `enterFunctions: false` (L233). Return внутри вложенной функции не трансформируется — и это верно, т.к. он принадлежит вложенной функции |
| **1.2**                  | Silent failures: `__unknown__`/`__invalid__` + console.warn                             | **✅ ПОДТВЕРЖДЕНО**   | ~10 мест: dispatch.ts (473-474), statements/dispatch.ts (135,174,180), declarations.ts (360), operators.ts (145-146,223-224,249-250,332-333), calls.ts (126,205)             |
| **1.3**                  | Деструктуризация параметров — TODO, молча ломает                                        | **✅ ПОДТВЕРЖДЕНО**   | scope-analyzer.ts L284, function-helpers.ts L137, declarations.ts L360 (console.warn для var decl)                                                                           |
| **1.4**                  | Walker: catch parameter не посещается                                                   | **⚠️ НЕЗНАЧИТЕЛЬНО**  | Catch param — строка, не statement. `visitStatementChildren` обходит handler.body.body. Для hoist catch param не является VariableDeclaration — отдельная обработка не нужна |
| **2.1**                  | Нет валидации порядка passes                                                            | **✅ ПОДТВЕРЖДЕНО**   | `runPasses(ir, [tryFinallyDesugarPass, hoistPass])` — порядок только в коде, не enforced                                                                                     |
| **2.2**                  | Глобальный BindingManager singleton                                                     | **✅ ПОДТВЕРЖДЕНО**   | binding.ts L177: `let globalBindings: BindingManager \| null = null`, getBindings(), initBindings()                                                                          |
| **2.3**                  | Нет error boundary в passes/emitter                                                     | **✅ ПОДТВЕРЖДЕНО**   | transformToIR обёрнут в try-catch (L139-151), но runPasses и emit — нет                                                                                                      |
| **2.4**                  | Expression dispatch — 343-строчная if-chain                                             | **✅ ПОДТВЕРЖДЕНО**   | dispatch.ts L302-475 — линейная цепочка if (ts.isXxx)                                                                                                                        |
| **2.5**                  | visitClassDeclaration — 429 строк                                                       | **⚠️ ПРИБЛИЗИТЕЛЬНО** | Фактически ~232 строки (L433-664). Всё ещё крупная функция                                                                                                                   |
| **3.1**                  | precedence.ts — dead code                                                               | **❌ ЛОЖНОЕ**         | precedence.ts импортируется: operators.ts (needsParentheses, getPrecedence), dispatch.ts (getPrecedence). Используется при lowering                                          |
| **3.4**                  | Dead code: повторный NonNullExpression check                                            | **✅ ПОДТВЕРЖДЕНО**   | dispatch.ts L430-432 и L467-469 — дубликат, второй недостижим                                                                                                                |
| **3.5**                  | emit-hoisting.ts dead code                                                              | **❌ НЕАКТУАЛЬНО**    | Файл не существует (удалён ранее)                                                                                                                                            |
| **3.8**                  | \_allVariables unused param                                                             | **✅ ПОДТВЕРЖДЕНО**   | scope-analyzer.ts L167: `resolveVarLetConflicts(moduleScope, _allVariables)` — param не используется                                                                         |
| **Computed keys**        | `{ [key]: value }` молча отбрасывается                                                  | **✅ ПОДТВЕРЖДЕНО**   | literals.ts L218-230: для PropertyAssignment без Identifier/StringLiteral/NumericLiteral — `continue` (пропуск)                                                              |
| **collectVariableNames** | Дублирование с emit-helpers                                                             | **❌ ЛОЖНОЕ**         | В emit-helpers.ts функции collectVariableNames нет. Устаревший комментарий в hoist.ts и walker.ts                                                                            |

---

## 3. Окончательный ранжированный список

### Tier S — Критично (приоритет > 2.0)

#### S1. Silent failures (`__unknown__` / `__invalid__`)

- **Критичность:** 5 — broken output без ошибки
- **Вероятность:** 0.8 — при каждой неподдерживаемой конструкции
- **Трудозатраты:** 2 (2–4 часа)
- **Приоритет:** 5 × 0.8 × 0.5 = **2.0**
- **Файлы:** lowering/expressions/dispatch.ts, operators.ts, calls.ts, statements/dispatch.ts, declarations.ts
- **Рекомендация:** `ctx.diagnostics: Diagnostic[]`, пушить вместо console.warn. В CompileResult — `warnings[]`. Для `__unknown__` — `success: false`.

#### S2. break/continue в try-finally — отсутствие диагностики

- **Критичность:** 5 — некорректный runtime (finally пропускается)
- **Вероятность:** 0.3 — паттерн не частый
- **Трудозатраты:** 2 (2–3 часа для диагностики)
- **Приоритет:** 5 × 0.3 × 0.5 = **0.75** → Tier A
- **Рекомендация:** Минимум — diagnostic error при обнаружении break/continue внутри try с finally.

---

### Tier A — Высокий приоритет (1.0–2.0)

#### A1. Computed object property keys — полностью сломаны

- **Критичность:** 4 — `{ [key]: value }` молча отбрасывается
- **Вероятность:** 0.4 — enum-like, dictionary паттерны
- **Трудозатраты:** 3 (4–8 часов)
- **Приоритет:** 4 × 0.4 × 0.33 = **0.53**
- **Рекомендация:** Минимум — diagnostic error вместо silent `continue`. Полная реализация — key: string | IRExpression.

#### A2. Деструктуризация параметров — TODO без диагностики

- **Критичность:** 4 — `function f({a,b}) {}` молча ломается
- **Вероятность:** 0.5 — частый паттерн в TS
- **Трудозатраты:** 1 (1 час для диагностики)
- **Приоритет:** 4 × 0.5 × 1 = **2.0**
- **Рекомендация:** Diagnostic error "destructured parameters not supported".

#### A3. Error boundary для passes/emitter

- **Критичность:** 3 — при ошибке в pass нет контекста
- **Вероятность:** 0.6 — при разработке новых passes
- **Трудозатраты:** 1 (1–2 часа)
- **Приоритет:** 3 × 0.6 × 1 = **1.8**
- **Рекомендация:** try-catch в runPasses с `throw new Error(\`Pass "${pass.name}" failed: ${e.message}\`)`.

#### A4. break/continue в try-finally — диагностика

- См. S2, пересчитано в Tier A.

---

### Tier B — Средний приоритет (0.5–1.0)

#### B1. pendingStatements — мутабельный side-channel

- **Критичность:** 3 — хрупкий контракт, 21 push vs 3 flush
- **Вероятность:** 0.4 — при добавлении expression lowering
- **Трудозатраты:** 4 (2–3 дня)
- **Приоритет:** 3 × 0.4 × 0.25 = **0.3**
- **Рекомендация:** При первой серьёзной модификации lowering — `{ expr, pending }` или callback.

#### B2. Walker: expressions внутри statements не обходятся

- **Критичность:** 3 — блокирует DCE, constant folding
- **Вероятность:** 0.3 — при добавлении optimization passes
- **Трудозатраты:** 3 (4–8 часов)
- **Приоритет:** 3 × 0.3 × 0.33 = **0.3**
- **Рекомендация:** `mapIR(program, { stmt?, expr? })` или опция `expressionMapper` в mapStatements.

#### B3. Exhaustiveness checks в walker/emitter

- **Критичность:** 2 — пропущенный case = silent bug
- **Вероятность:** 0.5 — при каждом новом IR node
- **Трудозатраты:** 1 (2–3 часа)
- **Приоритет:** 2 × 0.5 × 1 = **1.0**
- **Рекомендация:** `const _: never = node` в default ветках.

#### B4. Pass ordering validation

- **Критичность:** 2 — при 3+ passes легко нарушить
- **Вероятность:** 0.4 — при добавлении passes
- **Трудозатраты:** 2 (2–4 часа)
- **Приоритет:** 2 × 0.4 × 0.5 = **0.4**
- **Рекомендация:** `dependsOn?: string[]` в IRPass + assertion в runPasses.

#### B5. Dead code: дубликат NonNullExpression

- **Критичность:** 1 — косметика
- **Вероятность:** 1.0 — уже есть
- **Трудозатраты:** 1 (5 минут)
- **Приоритет:** 1 × 1 × 1 = **1.0**
- **Рекомендация:** Удалить L467-469 в dispatch.ts.

#### B6. \_allVariables unused param

- **Критичность:** 1 — косметика
- **Вероятность:** 1.0
- **Трудозатраты:** 1 (15 минут)
- **Приоритет:** 1 × 1 × 1 = **1.0**
- **Рекомендация:** Удалить param из resolveVarLetConflicts или использовать.

#### B7. visitClassDeclaration — 232 строки

- **Критичность:** 2 — риск регрессии при модификации
- **Вероятность:** 0.3 — при баг-фиксах в классах
- **Трудозатраты:** 3 (4–6 часов)
- **Приоритет:** 2 × 0.3 × 0.33 = **0.2**
- **Рекомендация:** Разбить перед private class fields (roadmap).

---

### Tier C — Низкий приоритет / Backlog

#### C1. Глобальный BindingManager singleton

- **Критичность:** 2 — блокирует параллельную компиляцию
- **Вероятность:** 0.2 — только при worker threads
- **Трудозатраты:** 3 (4–6 часов)
- **Приоритет:** 2 × 0.2 × 0.33 = **0.13**
- **Рекомендация:** Решить с incremental compilation.

#### C2. NameGen/BindingManager в try-finally

- **Критичность:** 1 — теоретическая коллизия
- **Вероятность:** 0.1 — крайне редко
- **Трудозатраты:** 1 (1 час)
- **Приоритет:** 1 × 0.1 × 1 = **0.1**
- **Рекомендация:** Prefix `__tfd_` или документировать reserved names.

#### C3. Precedence в emitter

- **Критичность:** 2 — latent bug при optimization passes
- **Вероятность:** 0.2 — при первом pass с вложенными binary
- **Трудозатраты:** 3 (4–8 часов)
- **Приоритет:** 2 × 0.2 × 0.33 = **0.13**
- **Рекомендация:** Документировать: passes должны использовать IR.grouping() для сложных выражений. precedence.ts используется в lowering — НЕ dead code.

#### C4. Expression dispatch refactor (if-chain → Map)

- **Критичность:** 1 — maintainability
- **Вероятность:** 0.2 — при >25 expression types
- **Трудозатраты:** 2 (4–6 часов)
- **Приоритет:** 1 × 0.2 × 0.5 = **0.1**
- **Рекомендация:** Отложить.

#### C5. Устаревшие комментарии (collectVariableNames)

- **Критичность:** 1 — путаница при чтении
- **Вероятность:** 1.0
- **Трудозатраты:** 1 (30 мин)
- **Приоритет:** 1 × 1 × 1 = **1.0**
- **Рекомендация:** Удалить ссылки на несуществующий collectVariableNames в hoist.ts, walker.ts.

#### C6. Source maps

- **Критичность:** 3 — DX
- **Вероятность:** 0.8 — каждый debug
- **Трудозатраты:** 5 (3–5 дней)
- **Приоритет:** 3 × 0.8 × 0.2 = **0.48**
- **Рекомендация:** Отдельный проект.

---

## 4. Сводная таблица приоритетов

| ID | Проблема | C | P | E | Приоритет | Tier |
|----|----------|---|---|---|-----------+------|
| S1 | Silent failures | 5 | 0.8 | 2 | 2.0 | S |
| A2 | Деструктуризация params — диагностика | 4 | 0.5 | 1 | 2.0 | A |
| A3 | Error boundary passes | 3 | 0.6 | 1 | 1.8 | A |
| B3 | Exhaustiveness checks | 2 | 0.5 | 1 | 1.0 | B |
| B5 | Dead code NonNullExpression | 1 | 1.0 | 1 | 1.0 | B |
| B6 | \_allVariables unused | 1 | 1.0 | 1 | 1.0 | B |
| C5 | Устаревшие комментарии | 1 | 1.0 | 1 | 1.0 | B |
| S2/A4 | break/continue try-finally | 5 | 0.3 | 2 | 0.75 | A |
| A1 | Computed keys | 4 | 0.4 | 3 | 0.53 | A |
| B4 | Pass ordering | 2 | 0.4 | 2 | 0.4 | B |
| C6 | Source maps | 3 | 0.8 | 5 | 0.48 | C |
| B1 | pendingStatements | 3 | 0.4 | 4 | 0.3 | B |
| B2 | Walker expressions | 3 | 0.3 | 3 | 0.3 | B |
| C3 | Precedence emitter | 2 | 0.2 | 3 | 0.13 | C |
| C1 | BindingManager singleton | 2 | 0.2 | 3 | 0.13 | C |
| B7 | visitClassDeclaration split | 2 | 0.3 | 3 | 0.2 | B |
| C2 | NameGen collision | 1 | 0.1 | 1 | 0.1 | C |
| C4 | Expression dispatch Map | 1 | 0.2 | 2 | 0.1 | C |

---

## 5. План действий

```
СЕЙЧАС (quick wins, < 2 часов):
├── S1: diagnostic система вместо console.warn     [2–4 часа]
├── A2: диагностика destructured params           [1 час]
├── A3: error boundary в runPasses                [1–2 часа]
├── B5: удалить дубликат NonNullExpression         [5 мин]
├── B6: убрать _allVariables или использовать      [15 мин]
└── C5: удалить устаревшие комментарии             [30 мин]

СКОРО (текущий спринт):
├── S2/A4: диагностика break/continue try-finally  [2–3 часа]
├── A1: computed keys (минимум диагностика)       [1–8 часов]
├── B3: exhaustiveness checks (never)              [2–3 часа]
└── B4: pass ordering validation                  [2–4 часа]

ПРИ РЕФАКТОРИНГЕ:
├── B1: pendingStatements refactor                 [2–3 дня]
├── B2: unified walker (mapIR)                     [4–8 часов]
└── B7: split visitClassDeclaration                [4–6 часов]

BACKLOG:
├── C1: BindingManager без singleton               [4–6 часов]
├── C6: source maps                               [3–5 дней]
└── C2–C4: остальные                              [варируется]
```

---

## 6. Исправления к предыдущему консолидированному ревью

1. **precedence.ts** — НЕ dead code. Импортируется в operators.ts и dispatch.ts. Используется при lowering для IR.grouping().
2. **emit-hoisting.ts** — файл не существует, пункт неактуален.
3. **collectVariableNames** — функции нет в emit-helpers. Комментарии в hoist.ts и walker.ts устарели.
4. **Try-finally closure** — баг не подтверждён, `enterFunctions: false` корректен.
5. **Catch parameter** — не посещается, но это не баг: param не statement, для hoist не требуется отдельная обработка.

---

## 7. Информация о типах в IR Passes

**Рекомендация:** Не внедрять сейчас. При появлении use case (например, boolean optimization P004):

- **Быстро:** PassContext с опциональным TypeChecker (1–2 дня)
- **Масштабируемо:** typeHint на IRExpression + TypeAnnotator pass (3–5 дней)
