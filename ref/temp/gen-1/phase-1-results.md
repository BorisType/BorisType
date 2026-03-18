# Phase 1: Maintainability (Extract & Split) — Результаты

**Date:** 2026-03-12
**Status:** Completed

---

## Цель Phase 1

Снизить размер раздутых файлов, устранить дублирование кода, сохранить выход компилятора идентичным.

---

## План vs Реальность

### Step 1.1: Extract shared helpers from lowering

**План:** Создать `function-helpers.ts` с `createPerCallEnv`, `extractFunctionParams`, `resolveHoistingTarget`.

**Реальность:** Создан `function-helpers.ts` (252 строки) с:

- `createPerCallEnv` — консолидировал 5 дублированных блоков setup env
- `extractFunctionParams` — консолидировал 4 дублированных блока извлечения параметров
- `resolveHoistingTarget` — **не реализован** отдельно, оказался слишком контекстно-зависимым (3 строки кода, привязанные к `ctx.hoistedFunctions` vs `ctx.pendingStatements`). Инлайн-вызовы оставлены по месту.

**Изменённые файлы:** `statements/declarations.ts`, `expressions/calls.ts`, `expressions/functions.ts`, `expressions/literals.ts` (заменены inline-блоки на вызовы хелперов).

**Отклонения:** `resolveHoistingTarget` не выделен — минимальный impact, не оправдывает отдельную абстракцию.

### Step 1.2: Extract method call handler

**План:** Создать `call-helpers.ts` с `createMethodCall` (6 вариантов) + `createSuperCall` / `createSuperMethodCall`.

**Реальность:** Создан `call-helpers.ts` (95 строк) с:

- `createMethodCall` — унифицировал 6 вариантов property-based вызовов через объект конфигурации `{ object, property, args, objectOptional, callOptional, computed, ctx }`
- `createSuperCall` / `createSuperMethodCall` — **не выделены** в отдельные функции. super-логика в expressions/calls.ts оказалась компактной (~20 строк) и тесно связанной с контекстом visitor, выделение не давало выигрыша.

**Отклонения:** Super-хелперы не созданы. Незначительное отклонение — код и так чистый после вынесения createMethodCall.

### Step 1.3: Split expressions.ts

**План:** Разбить на `expressions/` с файлами: `index.ts`, `operators.ts`, `calls.ts`, `literals.ts`, `functions.ts`.

**Реальность:** Создана структура `expressions/` с **6 файлами** (на 1 больше плана):

| Файл               | Строки | Содержание                                                   |
| ------------------ | ------ | ------------------------------------------------------------ |
| `index.ts`         | 37     | Re-exports + visitExpression dispatcher                      |
| `operators.ts`     | 334    | Binary, prefix/postfix unary, logical operators              |
| `calls.ts`         | 290    | Call expressions, new expressions                            |
| `literals.ts`      | 395    | Object/array literals, identifier, template literals, typeof |
| `functions.ts`     | 135    | Arrow functions, function expressions                        |
| `module-access.ts` | 50     | Property access, element access (optional chaining)          |

`expressions.ts` оставлен как barrel re-export (34 строки) для обратной совместимости импортов.

**Отклонение:** Добавлен `module-access.ts`, которого не было в плане — property access / element access логика не вписывалась ни в один из запланированных файлов. Логичное решение.

**Проблема:** `literals.ts` (395 строк) — крупнее целевого диапазона 200-400, на верхней границе. Основной вклад: `visitObjectLiteralExpression` (~120 строк) с множеством edge cases.

### Step 1.4: Split statements.ts

**План:** Разбить на `statements/` с файлами: `index.ts`, `declarations.ts`, `control-flow.ts`, `loops.ts`, `blocks.ts`.

**Реальность:** Создана структура `statements/` с **6 файлами** (на 1 больше плана):

| Файл              | Строки | Содержание                             |
| ----------------- | ------ | -------------------------------------- |
| `index.ts`        | 31     | Re-exports                             |
| `dispatch.ts`     | 182    | visitStatement dispatcher              |
| `declarations.ts` | 665    | Functions, variables, imports, classes |
| `control-flow.ts` | 382    | if, switch, try-catch-finally          |
| `loops.ts`        | 189    | for, for-in, for-of, while, do-while   |
| `blocks.ts`       | 128    | Block, statement-as-block, return      |

`statements.ts` оставлен как barrel re-export (30 строк).

**Отклонение:** Добавлен `dispatch.ts` — dispatcher был достаточно большим (182 строки) для отдельного файла вместо размещения в `index.ts`.

**Проблема:** `declarations.ts` (665 строк) — **значительно выше** целевого диапазона 200-400. Причина — `visitFunctionDeclaration` (~200 строк), `visitVariableStatement` (~130 строк), `visitClassDeclaration` (~140 строк, **не упомянут в плане**). Class declarations не были учтены при планировании.

### Step 1.5: Split bt-emitter.ts

**План:** Разбить на `bt-emitter.ts` (slim), `emit-statements.ts`, `emit-expressions.ts`, `emit-polyfills.ts`.

**Реальность:** Создано **5 новых файлов** (на 2 больше плана):

| Файл                  | Строки | Содержание                                                               |
| --------------------- | ------ | ------------------------------------------------------------------------ |
| `bt-emitter.ts`       | 87     | Slim entry: emit() + emitProgram()                                       |
| `emit-helpers.ts`     | 137    | EmitContext, EmitOptions, EmitResult, indent utils, collectVariableNames |
| `emit-polyfills.ts`   | 101    | POLYFILL_SPEC constant, emitPolyfillCall                                 |
| `emit-expressions.ts` | 293    | emitExpression dispatcher + 18 expression emitters                       |
| `emit-statements.ts`  | 403    | emitStatement dispatcher + 15 statement emitters                         |
| `emit-hoisting.ts`    | 236    | emitStatementHoisted + 9 hoisted variants                                |

**Отклонения:**

- `emit-helpers.ts` — не запланирован, но необходим для разрыва circular dependencies (EmitContext нужен всем файлам).
- `emit-hoisting.ts` — в плане hoisting был внутри `emit-statements.ts`. Выделен отдельно из-за circular dependency: statements→hoisting→statements. Разделение на два файла с двусторонними импортами — стандартный паттерн для ESM.
- `bt-emitter.ts` (87 строк) — значительно меньше планировавшихся ~200 строк, т.к. больше логики вынесено.

### Step 1.6: Verify

**Результаты:**

- `npm run build` в bt-ir — **чистая сборка**, 0 ошибок
- `npx turbo run build` — **14/14 пакетов** собраны успешно
- botest — **113/113 тестов** пройдено
- **SHA256 сравнение** `tests/build_old` vs `tests/build` — **122/122 .js файла идентичны**, нулевая разница в выходе

---

## Итоговые метрики

### До рефакторинга

| Файл             | Строки    |
| ---------------- | --------- |
| `expressions.ts` | ~1950     |
| `statements.ts`  | ~1750     |
| `bt-emitter.ts`  | ~1214     |
| **Итого**        | **~4914** |

### После рефакторинга

| Файл/Директория                       | Строки    |
| ------------------------------------- | --------- |
| **lowering/function-helpers.ts**      | 252       |
| **lowering/call-helpers.ts**          | 95        |
| lowering/expressions.ts (barrel)      | 34        |
| lowering/expressions/index.ts         | 37        |
| lowering/expressions/operators.ts     | 334       |
| lowering/expressions/calls.ts         | 290       |
| lowering/expressions/literals.ts      | 395       |
| lowering/expressions/functions.ts     | 135       |
| lowering/expressions/module-access.ts | 50        |
| lowering/statements.ts (barrel)       | 30        |
| lowering/statements/index.ts          | 31        |
| lowering/statements/dispatch.ts       | 182       |
| lowering/statements/declarations.ts   | 665       |
| lowering/statements/control-flow.ts   | 382       |
| lowering/statements/loops.ts          | 189       |
| lowering/statements/blocks.ts         | 128       |
| emitter/bt-emitter.ts (slim)          | 87        |
| emitter/emit-helpers.ts               | 137       |
| emitter/emit-polyfills.ts             | 101       |
| emitter/emit-expressions.ts           | 293       |
| emitter/emit-statements.ts            | 403       |
| emitter/emit-hoisting.ts              | 236       |
| **Итого**                             | **~4506** |

Сокращение ~408 строк за счёт устранения дублирования (createPerCallEnv, createMethodCall).

Максимальный файл: `declarations.ts` (665 строк) — **по-прежнему крупный**, но содержит 4 логически сильно связанных visitor-а (функции, переменные, импорты, классы).

---

## Проблемы и выводы

### 1. `declarations.ts` остался крупным (665 строк)

**Причина:** Class declarations (~140 строк) не были учтены в плане. В сочетании с крупными `visitFunctionDeclaration` (~200) и `visitVariableStatement` (~130) файл получился довольно большим.

**Вывод для Phase 2:** Если в Phase 2 hoisting будет вынесен в отдельный pass, `visitFunctionDeclaration` существенно упростится (hoisting логика ~30-40 строк уйдёт), что уменьшит declarations.ts до ~620 строк. Возможно дополнительное разделение на `declarations.ts` (variables + imports) и `functions.ts` (function + class declarations), но это **не критично** для Phase 2.

### 2. Circular dependencies в emitter

**Проблема:** `emit-statements.ts` ↔ `emit-hoisting.ts` — двусторонняя зависимость (statements вызывают hoisted-варианты через `emitFunction`, hoisted-варианты вызывают обычные statements как fallback).

**Решение:** Разрыв на два файла работает в ESM благодаря lazy resolution.

**Вывод для Phase 2:** Когда hoisting будет вынесен в IR pass (Step 2.3), `emit-hoisting.ts` **исчезнет полностью** — emitter будет работать только с уже hoisted IR. Circular dependency решится сама собой.

### 3. `resolveHoistingTarget` и `createSuperCall` не выделены

**Причина:** Слишком мелкие абстракции, не оправдывающие complexity overhead.

**Вывод:** План переоценил потенциал абстрагирования в этих точках. Не влияет на Phase 2-3.

### 4. Barrel re-exports

**Решение:** `expressions.ts` и `statements.ts` оставлены как barrel re-exports, чтобы внешние потребители (bare-visitors.ts, visitor.ts) не меняли свои import paths.

**Вывод для Phase 3:** Если bare-visitors.ts будет объединён с main visitors (Step 3.3), barrel-файлы можно будет убрать / упростить.

---

## Корректировки для Phase 2

### Step 2.3 (Hoist pass) — подтверждён как ценный

Emitter сейчас содержит **emit-hoisting.ts (236 строк)** + **collectVariableNames (60 строк в emit-helpers.ts)** + hoisting-логику в `emitFunction` и `emitProgram`. Вынос hoisting в IR pass:

- Удалит `emit-hoisting.ts` полностью
- Упростит `emitFunction` в `emit-statements.ts` (~50 строк уйдёт)
- Упростит `emitProgram` в `bt-emitter.ts` (~15 строк)
- **Оценка:** ~300 строк удалённого кода из emitter

### Step 2.1 (Pass infrastructure) — без изменений

Walker utilities (`walkStatements`, `walkExpressions`) будут нужны как для try-finally desugaring, так и для hoist pass. План актуален.

### Step 2.2 (Try-finally desugaring) — без изменений

`control-flow.ts` содержит `visitTryStatement` (382 строки в файле, try ~150). transformReturns логика по-прежнему является inline IR→IR мини-pass. Вынос в отдельный pass оправдан.

### Step 2.4 (Env setup pass) — рекомендация: отложить

`createPerCallEnv` из Phase 1 уже достаточно чист. Дополнительный IR pass для env setup добавит complexity без значительного выигрыша. Рекомендация — пропустить, пересмотреть после Phase 3.

### Новая рекомендация: Split `declarations.ts` в Phase 2

После выноса hoisting из `visitFunctionDeclaration`, рассмотреть разделение:

- `declarations.ts` → переменные + импорты (~300 строк)
- `function-declarations.ts` → функции + классы (~300 строк)

Это **опционально** и зависит от того, насколько hoisting pass упростит код.

---

## Файлы не затронутые Phase 1 (unchanged)

| Файл                        | Строки | Комментарий                                          |
| --------------------------- | ------ | ---------------------------------------------------- |
| `lowering/bare-visitors.ts` | 343    | Будет адресован в Phase 3 (merge with main visitors) |
| `lowering/visitor.ts`       | 351    | Только обновлены импорты                             |
| `lowering/index.ts`         | 97     | Только обновлены экспорты                            |
| `ir/nodes.ts`               | ~890   | Acceptable, не в скоупе Phase 1                      |
| `ir/builders.ts`            | ~600   | Acceptable, не в скоупе Phase 1                      |
| `emitter/index.ts`          | 7      | Barrel, без изменений                                |
