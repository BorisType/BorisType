# Phase 2: Multi-Pass IR Architecture — Результаты

**Date:** 2026-03-13
**Status:** Completed

---

## Цель Phase 2

Перенести пост-IR трансформации (hoisting, try-finally desugaring) из emitter'а и lowering'а в отдельные IR-проходы (passes), создав инфраструктуру для nanopass-архитектуры.

---

## План vs Реальность

### Step 2.1: Pass Infrastructure

**План:** Создать `IRPass` интерфейс, `PassContext`, walker-утилиты (`walkStatements`, `walkExpressions`).

**Реальность:** Создано 3 файла:

| Файл               | Строки | Содержание                                                                    |
| ------------------ | ------ | ----------------------------------------------------------------------------- |
| `passes/types.ts`  | 26     | `IRPass` интерфейс: `{ name: string; run(program: IRProgram): IRProgram }`    |
| `passes/walker.ts` | 532    | `mapStatements`, `mapExpression`, `forEachStatement` — generic IR tree walker |
| `passes/index.ts`  | 36     | Exports + `runPasses()` функция                                               |

**Отклонения:**

- `PassContext` **не создан** — для текущих двух passes не нужен контекст. Интерфейс `IRPass.run` принимает `IRProgram` напрямую, без дополнительных объектов.
- `walkStatements` → `mapStatements` — переименован, т.к. walker не просто обходит дерево, а **заменяет** узлы. `StatementMapper` возвращает `IRStatement | IRStatement[] | null | undefined`, поддерживая 1→N замену нативно.
- `forEachStatement` — добавлен для read-only обхода (сбор var-имён в hoist pass).
- Walker оказался значительно крупнее плана (532 строк vs ~200 ожидание) — покрывает все 20 типов statements и 25+ типов expressions. Обработка каждого типа IR-узла требует explicit pattern matching.

**Баги исправлены при разработке walker:**

- `IR.prop(key, value, computed?)` — не `IR.property()` (несуществующий API)
- `IRBTIsFunction` / `IRBTIsTrue` имеют `.value`, не `.argument`
- `IR.functionDecl(name, params, body, loc?, plainSignature?)` — порядок аргументов: `loc` 4-й, `plainSignature` 5-й

### Step 2.2: Try-Finally Desugar Pass

**План:** Вынести `desugarTryFinally` + `transformReturns*` из `control-flow.ts` в отдельный IR pass.

**Реальность:** Создан `passes/try-finally-desugar.ts` (231 строка):

- `tryFinallyDesugarPass` — находит try-finally, десахаризует в state machine pattern
- `NameGen` — простой счётчик для уникальных имён (`__fType0`, `__fVal0`, ...), заменяет зависимость от `BindingManager`
- `transformReturnsInList` — 7 строк с `mapStatements`, заменяет ~100 строк ручной рекурсии (4 функции `transformReturns*`)

**Упрощение в `control-flow.ts`:**

- `visitTryStatement` теперь **всегда** возвращает единственный `IRTryStatement` — no desugaring inline
- Удалено ~250 строк (desugarTryFinally + transformReturns\* + вспомогательные функции)
- Файл сократился с 382 → 65 строк

**Критический баг (найден и исправлен):**
Порядок обработки: первоначальная реализация сначала трансформировала returns, потом десахаризовала внутренние try-finally. Но при вложенных try-finally **внутренний** desugar создаёт `return __fVal`, который должен быть видим трансформации returns **внешнего**. Правильный порядок: desugaring снизу вверх (bottom-up), потом transformReturns сверху вниз. Пойман 1 diff в `nested.test.js`.

### Step 2.3: Hoist Pass

**План:** Вынести hoisting логику (var/function hoisting) из emitter в IR pass.

**Реальность:** Создан `passes/hoist.ts` (317 строк):

- `hoistPass` — обрабатывает все scope-aware уровни (модуль, функции, try-catch)
- `hoistScope` — полный hoist: собирает function declarations и var names, перемещает function decl на верх, заменяет `VarDecl` → assignment expressions
- `hoistScopeVarsOnly` — для bare/plain функций: только var-имена, без function hoisting
- Captured vars → `IREnvAssign` (а не обычный assignment)
- for-init `VarDecl` → `AssignmentExpression`
- for-in left `VarDecl` → `Identifier`
- `hoistOnly` VarDecl → убираются (они существовали только для hoisting и не нужны после прохода)

**Упрощения в emitter:**

- `bt-emitter.ts`: `emitProgram` — просто итерирует `program.body`, убрана вся hoisting-логика (~40 строк)
- `emit-statements.ts`: `emitFunction` — прямой emit body без collectVariableNames / emitStatementHoisted
- `emit-hoisting.ts` (236 строк) — **удалён полностью** (dead code после hoist pass)
- `emit-helpers.ts`: `collectVariableNames` (68 строк) — **удалена** (заменена `collectVarNames` в hoist pass)
- `emit-helpers.ts`: неиспользуемый `import { IRStatement }` — **удалён**, module description обновлён

**Важное решение:** Hoist pass и упрощение emitter **невозможно разделить** — они must be done atomically. Emitter `emitStatementHoisted` возвращал `""` для `hoistOnly` VarDecls, создавая пустые строки. Без одновременного упрощения emitter тесты ломаются.

### Step 2.4: Env Setup Pass — Пропущен

**План:** "Defer if helper from Phase 1 is clean enough."

**Решение:** Пропущен по рекомендации плана + подтверждению пользователя. `createPerCallEnv` из Phase 1 достаточно чистый, выделение в отдельный pass добавило бы complexity без выигрыша, и отрыв env setup от captured variables обработки был бы неестественным.

### Step 2.5: Pipeline Integration

**Реальность:** В `pipeline/index.ts` добавлен вызов:

```typescript
runPasses(ir, [tryFinallyDesugarPass, hoistPass]);
```

В обеих функциях (`compile()` и `compileSourceFile()`) между `debugIR` логированием и emit.

Порядок passes важен: try-finally desugar создаёт переменные (`__fType`, `__fVal`), которые должны быть hoisted следующим проходом.

### Step 2.6: Verification

**Результаты:**

- `npm run build` в bt-ir — **чистая сборка**, 0 ошибок
- `npx tsc --noEmit` — 0 ошибок
- `npx turbo run build` — **14/14 пакетов** собраны
- botest — **113/113 тестов** пройдено
- SHA256 сравнение `tests/build_old` vs `tests/build` — **138/138 файлов byte-identical**

---

## Итоговые метрики

### Файлы Phase 2 — создано

| Файл                            | Строки   | Назначение               |
| ------------------------------- | -------- | ------------------------ |
| `passes/types.ts`               | 26       | IRPass интерфейс         |
| `passes/walker.ts`              | 532      | Generic IR tree walker   |
| `passes/index.ts`               | 36       | Pass manager + exports   |
| `passes/hoist.ts`               | 317      | Hoist pass               |
| `passes/try-finally-desugar.ts` | 231      | Try-finally desugar pass |
| **Итого создано**               | **1142** |                          |

### Файлы Phase 2 — удалено

| Файл                                           | Строки   | Причина                                 |
| ---------------------------------------------- | -------- | --------------------------------------- |
| `emitter/emit-hoisting.ts`                     | 236      | Полностью dead после hoist pass         |
| `emit-helpers.ts` → `collectVariableNames`     | 68       | Заменена `collectVarNames` в hoist pass |
| `control-flow.ts` → desugar + transformReturns | ~250     | Перенесено в try-finally-desugar pass   |
| `bt-emitter.ts` → hoisting в emitProgram       | ~40      | Вынесено в hoist pass                   |
| `emit-statements.ts` → hoisting в emitFunction | ~110     | Вынесено в hoist pass                   |
| **Итого удалено**                              | **~704** |                                         |

### Изменения в существующих файлах

| Файл                                  | До (строки) | После (строки) | Δ        |
| ------------------------------------- | ----------- | -------------- | -------- |
| `emitter/bt-emitter.ts`               | 87          | 43             | −44      |
| `emitter/emit-helpers.ts`             | 137         | 56             | −81      |
| `emitter/emit-statements.ts`          | 403         | 293            | −110     |
| `emitter/emit-hoisting.ts`            | 236         | _(удалён)_     | −236     |
| `lowering/statements/control-flow.ts` | 382         | 65             | −317     |
| `pipeline/index.ts`                   | ~270        | 277            | +7       |
| **Δ итого в существующих**            |             |                | **−781** |

### Нетто

- Создано: **+1142 строки** (passes/ — чистый новый код)
- Удалено из существующих: **~781 строка**
- Нетто: **+361 строка**

Увеличение размера объясняется:

1. Walker (532 строки) — универсальная инфраструктура, покрывающая все типы IR-узлов
2. Hoist + try-finally passes содержат собственную логику обхода, тогда как старый код переиспользовал emitter'ные структуры

Однако **emitter значительно упростился** (−471 строка, circular dependency emit-hoisting ↔ emit-statements устранена), а passes — изолированные, тестируемые единицы.

---

## Проблемы и выводы

### 1. Walker крупнее ожидаемого (532 строк)

**Причина:** Каждый тип IR-узла (20 statements, 25+ expressions) требует explicit pattern matching для корректной рекурсии. Нет возможности сократить без потери покрытия.

**Вывод:** Это одноразовая инвестиция — walker переиспользуется всеми будущими passes. Его размер пропорционален сложности IR-модели.

### 2. Try-finally ordering bug (bottom-up vs top-down)

**Проблема:** Вложенные try-finally требуют desugaring снизу вверх: внутренний try-finally создаёт `return __fVal`, который должен быть видим трансформации returns внешнего try-finally.

**Обнаружение:** 1 diff в `nested.test.js` — тест для вложенных try-catch-finally конструкций.

**Вывод:** Порядок операций внутри одного pass критичен. В nanopass-архитектуре это менее рискованно, т.к. каждый pass делает одну вещь и его легче отлаживать.

### 3. Atomic pass + emitter changes

**Проблема:** Hoist pass нельзя интегрировать без одновременного упрощения emitter. `emitStatementHoisted` возвращает `""` для `hoistOnly` VarDecl, приводя к пустым строкам в output.

**Вывод:** При миграции логики из «потребителя IR» в «проход IR» изменения часто должны быть атомарными. Это усложняет инкрементальную разработку, но альтернативы нет.

### 4. PassContext не понадобился

**Причина:** Оба pass (`hoistPass`, `tryFinallyDesugarPass`) работают isomorphically — преобразуют `IRProgram → IRProgram` без внешнего контекста. `NameGen` в try-finally desugar — internal state, не передаваемый между passes.

**Вывод для будущего:** Если появятся passes, которым нужен shared contex (например, optimization passes с global information), `PassContext` можно добавить без ломающих изменений — достаточно расширить сигнатуру `IRPass.run`.

---

## Circular dependency устранена

**До Phase 2:**

```
emit-statements.ts ←→ emit-hoisting.ts  (двусторонняя)
```

`emitFunction` вызывал `emitStatementHoisted`, а `emitStatementHoisted` вызывал обычные statement-эмиттеры как fallback.

**После Phase 2:**

```
pipeline/index.ts → passes/index.ts → [hoist, try-finally-desugar]
                  → emitter/bt-emitter.ts → emit-statements.ts (однонаправленная)
```

`emit-hoisting.ts` удалён. Emitter работает с уже pre-processed IR, без собственной трансформации.

---

## Pipeline после Phase 2

```
TS Source
  → Scope Analyzer (scope-analyzer.ts)
  → IR Lowering (lowering/)
  → Pass 1: Try-Finally Desugar (passes/try-finally-desugar.ts)
  → Pass 2: Hoist (passes/hoist.ts)
  → BT Emitter (emitter/)
  → BS Output
```

---

## Корректировки для Phase 3

### Emitter дополнительно упрощён

С удалением `emit-hoisting.ts` и simplification всех emitter-файлов, emitter теперь:

- `bt-emitter.ts`: 43 строки (entry point)
- `emit-helpers.ts`: 56 строк (context + indent)
- `emit-statements.ts`: 293 строки (15 statement emitters)
- `emit-expressions.ts`: 243 строки (18 expression emitters)
- `emit-polyfills.ts`: 91 строка (polyfill spec)

Суммарно emitter: **726 строк** (было ~1257 после Phase 1, ~1214 до Phase 1).

### `declarations.ts` по-прежнему крупный

Phase 2 не затронул `declarations.ts` напрямую (hoisting из emitter, не из lowering). `visitFunctionDeclaration` по-прежнему содержит inline hoisting-подобную логику для `ctx.hoistedFunctions`. Это может быть адресовано в Phase 3.

### Walker готов к переиспользованию

`mapStatements` / `mapExpression` / `forEachStatement` — generic инфраструктура. Любой будущий pass (optimization, dead code elimination, constant folding) может использовать walker без дублирования кода обхода.
