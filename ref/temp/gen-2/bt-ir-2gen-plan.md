# BT-IR 2-Gen: План итеративного рефакторинга

**Дата:** 2026-03-15  
**Источники:** `bt-ir-final-review-claude.md`, `bt-ir-final-review-composer.md`, `bt-ir-final-review-merged.md`  
**Базовая линия:** Phase 1–3 завершены (ADR-011), 113/113 тестов, ~121/122 совпадений с `build_old`
(1 файл `semantic/functions.test.js` отличается — hoist pass перенёс function declarations наверх; 1 new файл `semantic/for-of-captured.test.js`)

---

## 0. Методология верификации

Каждая задача проверяется **тремя гейтами**:

| Гейт               | Команда                                        | Проход                     |
| ------------------ | ---------------------------------------------- | -------------------------- |
| **G1: Тесты**      | `pnpm run test` (from root)                    | Все тесты pass             |
| **G2: Build diff** | `node tests/diff-builds.js --diff` (from root) | Нет неожиданных изменений¹ |
| **G3: Сборка**     | `npx turbo run build --force` (from root)      | 0 ошибок                   |

¹ **G2 — не побайтовое совпадение.** Скрипт `tests/diff-builds.js` сравнивает SHA-256 хеши `.js` файлов между `tests/build/` и `tests/build_old/`. Отличающиеся файлы — не обязательно проблема. `--diff` флаг показывает построчные расхождения для ручной проверки. Допустимые отличия: изменение порядка hoisted функций, новые тесты.

**Clean build:** `npx turbo run build --force` — игнорирует кеш turbo, пересобирает всё.

**Workflow:**

1. Последовательная реализация задач в текущей ветке
2. После каждого логического блока: G3 → G1 → G2
3. Коммит (управление git — вручную)

**Формат коммитов:** Conventional Commits — `refactor(bt-ir): <краткое описание>`

Примеры:

```
refactor(bt-ir): cleanup stale comments and dead code
refactor(bt-ir): diagnostic infrastructure (Diagnostic type, ctx.diagnostics)
refactor(bt-ir): replace console.warn with ctx.diagnostics
refactor(bt-ir): success:false on errors + error boundary for passes/emitter
refactor(bt-ir): break/continue in try-finally detection
refactor(bt-ir): diagnostic errors for computed keys and destructured params
```

**Именование decisions/proposals:** Префикс даты `YYYY-MM-DD-<slug>.md` вместо инкрементного индекса,
чтобы избежать конфликтов при введении из разных веток. Пример: `2026-03-15-computed-object-keys.md`.

---

## 1. Анализ ложных утверждений ревью

Оба ревью содержали фактические ошибки. Ниже — классификация **корневых причин**.

### 1.1. Устаревшие комментарии → ложные выводы

| Ложное утверждение                                           | Источник                                           | Комментарий-виновник                               | Корневая причина                                           |
| ------------------------------------------------------------ | -------------------------------------------------- | -------------------------------------------------- | ---------------------------------------------------------- |
| "`collectVariableNames` дублируется в emit-helpers" (claude) | `passes/hoist.ts:L231`, `passes/walker.ts:L6,L474` | `"Аналог collectVariableNames из emit-helpers.ts"` | Функция удалена при Phase 2, комментарии не обновлены      |
| "`emit-hoisting.ts` — dead code" (claude)                    | `build/emitter/emit-hoisting.ts`                   | Файл в build/ но не в src/                         | Файл удалён из src/ при Phase 2, стейлый артефакт в build/ |

**Вывод:** 2 из 2 ложных утверждений группы "dead code / дублирование" вызваны **устаревшими комментариями**, ссылающимися на удалённый код. Ревью корректно читало комментарий, но не верифицировало существование функции.

### 1.2. Неполный статический анализ → ложные выводы

| Ложное утверждение                                 | Источник         | Реальность                                             | Корневая причина                                              |
| -------------------------------------------------- | ---------------- | ------------------------------------------------------ | ------------------------------------------------------------- |
| "`precedence.ts` — dead code, 0 импортов" (claude) | Grep по импортам | Импортируется в `operators.ts:L23` и `dispatch.ts:L18` | Поиск не учёл все файлы или использовал неверный паттерн      |
| "`visitClassDeclaration` — 429 строк" (claude)     | Подсчёт строк    | Реально ~232 строки (L433-664)                         | Ошибка при подсчёте (начало/конец функции определены неверно) |

**Вывод:** 2 ложных утверждения из-за **неаккуратного статического анализа**. Не hallucination, а ошибки в tooling / ручном подсчёте.

### 1.3. Context collapse (потеря контекста)

| Ложное утверждение                                                                                                | Источник                      | Реальность                                                                     | Корневая причина                                                                     |
| ----------------------------------------------------------------------------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| "Try-finally closure capture bug — return внутри nested function захватывает \_\_fType" (composer, первое мнение) | Анализ try-finally-desugar.ts | `transformReturnsInList` использует `enterFunctions: false` (L233) — корректно | Не проверена логика walker при вложенных функциях. Поверхностный анализ control flow |

**Вывод:** 1 ложное утверждение из-за **недостаточной глубины анализа вложенности**. Потенциально усугублено большим объёмом кода (~8000 LOC) при ограниченном контексте.

### 1.4. Итог по ложным утверждениям

```
Устаревшие комментарии:     2 ложных (collectVariableNames, emit-hoisting)
Неполный анализ:            2 ложных (precedence.ts, visitClassDeclaration size)
Context collapse:           1 ложный (try-finally closure)
Всего:                      5 ложных утверждений из ~25 проверенных = 20% false rate
```

**Quick wins для предотвращения:** см. Section 3.1 (задачи QW-1..QW-3).

---

## 2. Критические задачи (S/A tier)

### Принципы декомпозиции:

- Задачи реализуются **последовательно** в текущей ветке
- Каждая задача — **измеримая единица** (можно верифицировать G1/G2/G3)
- Задачи внутри tier **независимы** друг от друга (можно делать в любом порядке)
- Каждая задача содержит **Definition of Done** с конкретными проверками
- Для unsupported features, которые блокируются diagnostic error → создать proposal в `ref/proposals/`

---

### 2.1. TIER S: Диагностики вместо silent failures

#### S1: Система диагностик — инфраструктура

**Проблема:** `console.warn` + возврат `IR.id("__unknown__")` / `IR.id("__invalid__")` вместо ошибки компиляции. Пользователь получает broken output без единого предупреждения.

**Масштаб:** 9 мест с `console.warn`, 2 с `__unknown__`, 9 с `__invalid__` (перечислены ниже).

**Декомпозиция на подзадачи:**

##### S1-A: Определить тип Diagnostic и добавить `warnings[]` в VisitorContext

**Файлы:**

- `lowering/visitor.ts` — добавить `diagnostics: Diagnostic[]` в `VisitorContext`
- `pipeline/index.ts` — прокинуть `warnings` в `CompileResult`
- Новый файл или в `pipeline/index.ts` — тип `Diagnostic`

**Тип:**

```typescript
interface Diagnostic {
  level: "error" | "warning";
  message: string;
  /** Позиция в исходнике (если доступна) */
  pos?: { line: number; character: number };
}
```

**DoD:**

- [ ] `VisitorContext.diagnostics` существует и инициализируется пустым массивом
- [ ] `CompileResult` содержит `warnings: string[]`
- [ ] Существующие тесты проходят (G1)
- [ ] Output не изменился (G2)

##### S1-B: Заменить `console.warn` на `ctx.diagnostics.push()`

**Файлы и позиции (`console.warn` → diagnostic):**

| #   | Файл                         | Строка | Сообщение                                | Действие                                        |
| --- | ---------------------------- | ------ | ---------------------------------------- | ----------------------------------------------- |
| 1   | `expressions/dispatch.ts`    | 473    | `Unhandled expression: ${kind}`          | → `diagnostic("error")` + вернуть `__unknown__` |
| 2   | `expressions/operators.ts`   | 145    | `Invalid assignment target`              | → `diagnostic("error")`                         |
| 3   | `expressions/operators.ts`   | 223    | `?? not supported in bare mode`          | → `diagnostic("error")`                         |
| 4   | `expressions/operators.ts`   | 249    | `Unknown operator: ${kind}`              | → `diagnostic("error")`                         |
| 5   | `expressions/operators.ts`   | 332    | `Invalid update expression operand`      | → `diagnostic("error")`                         |
| 6   | `statements/declarations.ts` | 360    | `Destructuring not yet supported`        | → `diagnostic("error")`                         |
| 7   | `statements/dispatch.ts`     | 135    | `Unhandled: ModuleDeclaration`           | → `diagnostic("warning")`                       |
| 8   | `statements/dispatch.ts`     | 174    | `ClassDeclaration not supported in bare` | → `diagnostic("error")`                         |
| 9   | `statements/dispatch.ts`     | 180    | `Unhandled statement: ${kind}`           | → `diagnostic("error")`                         |

**DoD:**

- [ ] 0 `console.warn` в `packages/bt-ir/src/`
- [ ] Все бывшие warn → diagnostic с корректным level
- [ ] G1 + G2

##### S1-C: `success: false` при наличии error-level diagnostics

**Файл:** `pipeline/index.ts`

**Изменение:** После `compile()`, если `diagnostics.some(d => d.level === "error")` → `success: false`.

**Важно:** Это **может сломать** пользователей, которые компилируют код с `__unknown__` и не проверяют `success`. Нужен changelog entry.

**DoD:**

- [ ] `compile()` возвращает `success: false` при error diagnostics
- [ ] G1 — тесты не содержат unsupported конструкций (должны пройти)
- [ ] G3 — сборка проходит

---

#### S2: Диагностика break/continue в try-finally

**Проблема:** `break`/`continue` внутри `try` блока с `finally` не обрабатываются pass'ом `try-finally-desugar`. Результат — finally dispatch не перехватывает их, потенциально некорректный runtime.

**ADR-010:** типы 3/4 зарезервированы для будущей реализации.

**Декомпозиция:**

##### S2-A: Детектировать break/continue в try-finally и выдать ошибку

**Файл:** `passes/try-finally-desugar.ts`

**Логика:** При обходе `IRTryStatement` с `finalizer`, рекурсивно проверить `body` на наличие `IRBreakStatement` / `IRContinueStatement` (с учётом `enterFunctions: false` — вложенные функции пропускаем). При обнаружении — пушить diagnostic (нужен доступ к diagnostics через PassContext или возвращать список ошибок).

**Проблема с архитектурой:** Сейчас passes не имеют доступа к diagnostics. Варианты:

1. **Минимальный:** Pass бросает ошибку (`throw new Error("break inside try-finally not supported")`) — грубо, но эффективно с error boundary (A3)
2. **Правильный:** Добавить `PassContext` с `diagnostics[]` — требует изменения `IRPass` interface

**Рекомендация:** Вариант 1 сейчас + вариант 2 при B4 (pass ordering). Error boundary (A3) обеспечит человеко-читаемое сообщение.

**DoD:**

- [ ] `break`/`continue` внутри try-finally генерирует ошибку компиляции
- [ ] Вложенные функции внутри try не вызывают false positive
- [ ] Тест на этот case (новый .test.ts в `tests/src/try-catch-finally/`)
- [ ] G1 + G3

---

### 2.2. TIER A: Высокий приоритет

#### A1: Computed object keys — минимум диагностика

**Проблема:** `{ [key]: value }` — property молча отбрасывается (`continue` в `literals.ts:L230`).

**Файл:** `lowering/expressions/literals.ts` ~L218-230

**Изменение:** Вместо `continue` → `ctx.diagnostics.push({ level: "error", message: "Computed property keys are not supported" })` + `continue`.

**Зависимость:** S1-A (инфраструктура diagnostics)

**DoD:**

- [ ] Computed key → error diagnostic (не silent skip)
- [ ] Простые ключи работают как раньше
- [ ] G1 + G2 (computed keys в тестах нет)

---

#### A2: Деструктуризация параметров — диагностика

**Проблема:** `function f({a, b}) {}` — параметр молча пропускается, 3 места с TODO.

**Файлы:**

- `analyzer/scope-analyzer.ts:L284` — TODO в scope analysis
- `lowering/function-helpers.ts:L137` — TODO в buildFunctionParams
- `lowering/statements/declarations.ts:L360` — console.warn (покрывается S1-B)

**Изменение:** В `function-helpers.ts:L137` и `scope-analyzer.ts:L284` — вместо silent skip → diagnostic error "Destructured parameters are not supported".

**Зависимость:** S1-A (инфраструктура diagnostics) для function-helpers. Для scope-analyzer — нужен доступ к diagnostics (или throw).

**DoD:**

- [ ] Деструктуризация параметров → error (не silent skip)
- [ ] Обычные параметры не затронуты
- [ ] G1 + G2

---

#### A3: Error boundary для passes и emitter

**Проблема:** `runPasses()` и `emit()` не обёрнуты в try-catch. При ошибке в pass — стек без контекста.

**Файл:** `pipeline/index.ts` ~L159, L161

**Изменение:**

```typescript
try {
  ir = runPasses(ir, [tryFinallyDesugarPass, hoistPass]);
} catch (e) {
  return { success: false, outputs: [], errors: [`Pass failed: ${e}`] };
}

try {
  const result = emit(ir, options.emitOptions);
} catch (e) {
  return { success: false, outputs: [], errors: [`Emit failed: ${e}`] };
}
```

**Дополнительно:** В `runPasses()` (`passes/index.ts`) — обернуть каждый `pass.run()`:

```typescript
try {
  result = pass.run(result);
} catch (e) {
  throw new Error(`Pass "${pass.name}" failed: ${e instanceof Error ? e.message : e}`);
}
```

**Зависимость:** Нет

**DoD:**

- [ ] Ошибка в pass → `CompileResult.success: false` + человеко-читаемое сообщение
- [ ] Ошибка в emit → аналогично
- [ ] G1 + G2 + G3

---

#### A4: break/continue try-finally (= S2-A)

Объединена с S2. См. S2-A выше.

---

## 3. Quick Wins: Очистка репозитория

Задачи, которые **устраняют источники ложных утверждений** в будущих ревью и предотвращают путаницу.

### 3.1. Устаревшие комментарии

#### QW-1: Удалить ссылки на `collectVariableNames`

**Файлы и строки:**

| Файл               | Строка | Текущий текст                                     | Действие                                      |
| ------------------ | ------ | ------------------------------------------------- | --------------------------------------------- |
| `passes/hoist.ts`  | L231   | `Аналог collectVariableNames из emit-helpers.ts.` | Удалить или заменить на актуальное описание   |
| `passes/walker.ts` | L6     | `и collectVariableNames (emit-helpers.ts).`       | Удалить упоминание                            |
| `passes/walker.ts` | L474   | `Обобщение паттерна collectVariableNames`         | Заменить на `Рекурсивный обход IR statements` |

**DoD:**

- [ ] 0 результатов grep `collectVariableNames` в `packages/bt-ir/src/`
- [ ] G1 + G2

---

#### QW-2: Удалить стейлый `emit-hoisting.ts` из `build/`

**Файл:** `packages/bt-ir/build/emitter/emit-hoisting.ts` (и `.js`, `.d.ts` если есть)

**Действие:** Пересборка `npx turbo run build` должна не включать этот файл. Если включает — стейлый артефакт, нужно `rm` перед билдом или добавить clean step.

**DoD:**

- [ ] `emit-hoisting` не существует в `packages/bt-ir/build/`
- [ ] G3

---

#### QW-3: Удалить дубликат NonNullExpression check

**Файл:** `lowering/expressions/dispatch.ts`

**Изменение:** Удалить L467-469 (второй, недостижимый `if (ts.isNonNullExpression(node))`).

**DoD:**

- [ ] Один `isNonNullExpression` check в dispatch.ts
- [ ] G1 + G2

---

#### QW-4: Разобраться с `_allVariables` в scope-analyzer

**Файл:** `analyzer/scope-analyzer.ts:L155-169`

**Текущее:** `resolveVarLetConflicts(moduleScope, _allVariables)` — параметр передаётся но не используется внутри функции. Есть TODO комментарий.

**Варианты:**

1. Удалить параметр и TODO
2. Использовать параметр если нужен

**Рекомендация:** Проверить `resolveVarLetConflicts` — если `_allVariables` действительно не используется, удалить параметр.

**DoD:**

- [ ] Нет unused параметра в `resolveVarLetConflicts`
- [ ] G1 + G2

---

#### QW-5: Обновить `packages/bt-ir/TODO.md`

**Текущее:** Пустой файл.

**Действие:** Либо удалить (трекинг в ref/temp), либо заполнить ссылкой на 2gen-plan.

---

## 4. Порядок выполнения

Работа ведётся последовательно в текущей ветке. После каждой волны — verify + коммит.

```
═══════════════════════════════════════════════════════
  ВОЛНА 0 — Quick Wins (очистка)
  Цель: убрать мусор, предотвратить будущие ложные выводы
═══════════════════════════════════════════════════════
  QW-1: Удалить ссылки на collectVariableNames
  QW-2: Очистить build/ от emit-hoisting
  QW-3: Удалить дубликат NonNullExpression
  QW-4: _allVariables unused param
  QW-5: Обновить bt-ir/TODO.md
  ──────────────────────────────────────────────
  → Verify: G1 + G2 + G3
  → Коммит: refactor(bt-ir): cleanup stale comments and dead code (QW-1..QW-5)

═══════════════════════════════════════════════════════
  ВОЛНА 1 — Diagnostic инфраструктура
  Цель: заложить фундамент для всех S/A задач
═══════════════════════════════════════════════════════
  S1-A: Diagnostic тип + ctx.diagnostics
  S1-B: console.warn → ctx.diagnostics (9 мест)
  ──────────────────────────────────────────────
  → Verify: G1 + G2 + G3
  → Коммит: refactor(bt-ir): diagnostic infrastructure + replace console.warn (S1-A, S1-B)

═══════════════════════════════════════════════════════
  ВОЛНА 2 — Error handling + диагностики ошибок
  Цель: unsupported код больше не генерирует broken output
═══════════════════════════════════════════════════════
  S1-C: success: false при error diagnostics
  A3: Error boundary для passes/emitter
  S2-A: break/continue в try-finally → error
  ──────────────────────────────────────────────
  → Verify: G1 + G2 (diff-builds) + G3
  → Коммит: refactor(bt-ir): error handling + break/continue try-finally diagnostic (S1-C, A3, S2-A)

═══════════════════════════════════════════════════════
  ВОЛНА 3 — Диагностики unsupported features + proposals
  Цель: all known unsupported features сообщают ошибку
  + описать в proposals что нужно реализовать
═══════════════════════════════════════════════════════
  A1: Computed keys → diagnostic error
  A2: Деструктуризация параметров → diagnostic error
  P-005: Proposal для computed keys (`2026-03-15-computed-object-keys.md`)
  P-006: Proposal для destructured params (`2026-03-15-destructured-parameters.md`)
  P-007: Proposal для break/continue в try-finally (`2026-03-15-break-continue-try-finally.md`)
  ──────────────────────────────────────────────
  → Verify: G1 + G2 + G3
  → Коммит: refactor(bt-ir): diagnostic errors for unsupported features + proposals (A1, A2)
```

---

## 5. Карта зависимостей

```
QW-1..QW-5 ─── независимы ─── можно параллельно

S1-A ──────┬── S1-B ──── S1-C
           ├── A1 (computed keys)
           └── A2 (destructured params)

A3 ──────── независима (можно параллельно с S1)

S2-A ──────── зависит от A3 (error boundary ловит throw из pass)
              ИЛИ независима (если pass бросает Exception напрямую)
```

---

## 6. Что НЕ входит в 2-Gen

Следующие задачи из ревью **осознанно отложены** и не включены в план:

| ID  | Задача                       | Причина откладывания                                                      |
| --- | ---------------------------- | ------------------------------------------------------------------------- |
| B1  | pendingStatements refactor   | Работает корректно сейчас, рефакторинг при добавлении expression lowering |
| B2  | Walker expressions traversal | Нужен только для optimization passes (Phase 4)                            |
| B3  | Exhaustiveness checks        | Полезно, но не блокирует; можно добавить как lint rule                    |
| B4  | Pass ordering validation     | 2 прохода — порядок очевиден; актуально при 3+                            |
| B7  | Split visitClassDeclaration  | Актуально при реализации private class fields                             |
| C1  | BindingManager singleton     | Только при worker threads / parallel compilation                          |
| C6  | Source maps                  | Отдельный проект, high effort                                             |

---

## 7. Критерии завершения 2-Gen

2-Gen считается завершённым когда:

- [ ] **0** `console.warn` в `packages/bt-ir/src/`
- [ ] **0** результатов grep `collectVariableNames` в `packages/bt-ir/src/`
- [ ] **0** `emit-hoisting` артефактов в `packages/bt-ir/build/`
- [ ] **1** (не 2) `isNonNullExpression` check в `dispatch.ts`
- [ ] `CompileResult` содержит `warnings: string[]`
- [ ] `success: false` при error-level diagnostics
- [ ] `runPasses` и `emit` обёрнуты в error boundary
- [ ] `break`/`continue` в try-finally → ошибка компиляции
- [ ] Computed object keys → ошибка компиляции (не silent drop)
- [ ] Destructured params → ошибка компиляции (не silent skip)
- [ ] Все тесты проходят (`pnpm run test`)
- [ ] `node tests/diff-builds.js` — нет неожиданных расхождений
- [ ] Proposals созданы для всех unsupported features с diagnostic error
- [ ] ROADMAP.md обновлён (2-Gen → Done)

---

## 8. Proposals для unsupported features

Для каждой фичи, которую мы блокируем diagnostic error (вместо silent failure), создаётся минимальный proposal в `ref/proposals/`.
Цель: зафиксировать что нереализовано и нужна оценка.

| Proposal                                   | Feature                          | Почему заблокировано                                      |
| ------------------------------------------ | -------------------------------- | --------------------------------------------------------- |
| `2026-03-15-computed-object-keys.md`       | `{ [expr]: value }`              | BS не поддерживает computed keys напрямую, нужна эмуляция |
| `2026-03-15-destructured-parameters.md`    | `function f({a, b})`             | Нужно lowering в явные var + property access              |
| `2026-03-15-break-continue-try-finally.md` | `break`/`continue` в try-finally | ADR-010 types 3/4, state machine extension                |

Формат proposal — минимальный:

```markdown
# Proposal NNN: <Title>

**Статус:** Не реализовано (diagnostic error)
**Блокируется задачей:** 2gen/<task-id>

## Проблема

<краткое описание>

## Текущее поведение

Diagnostic error: "..."

## Возможная реализация

<оценка подхода>
```

---

## 9. Инструменты

### Clean build

```powershell
Set-Location "c:\Users\vomoh\Desktop\projects\BorisType"
npx turbo run build --force
```

### Build diff

```powershell
Set-Location "c:\Users\vomoh\Desktop\projects\BorisType"
node tests/diff-builds.js          # summary
node tests/diff-builds.js --diff   # summary + построчный diff
node tests/diff-builds.js --quiet  # только summary
```

### Тесты

```powershell
Set-Location "c:\Users\vomoh\Desktop\projects\BorisType"
pnpm run test
```

### Полный verify (все 3 гейта)

```powershell
Set-Location "c:\Users\vomoh\Desktop\projects\BorisType"
npx turbo run build --force; pnpm run test; node tests/diff-builds.js --diff
```
