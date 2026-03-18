# Plan: Полное ревью BT-IR — проблемы, pain points, улучшения

Проведено глубокое исследование всех модулей bt-ir (~8000 LOC), документации в ref/, ADR, proposals, phase results и known issues. Архитектура после Phase 1-3 рефакторинга в хорошем состоянии, но найдено ~30 проблем.

---

### 1. КРИТИЧЕСКИЕ (P0) — Корректность

**1.1 Try-finally: closure capture bug**
В `packages/bt-ir/src/passes/try-finally-desugar.ts` — если finally-блок содержит функцию с `return`, то return захватывает `__fType` из внешнего scope. `transformReturnsInList()` должен не входить в тела функций.

**1.2 Silent failures: `__unknown__` / `__invalid__` в IR**
В `packages/bt-ir/src/lowering/expressions/dispatch.ts`, `operators.ts`, `calls.ts`, `packages/bt-ir/src/lowering/statements/dispatch.ts` — нераспознанные TS-конструкции превращаются в `IR.id("__unknown__")` с `console.warn`. Пользователь получает broken output без ошибки. Нужна система diagnostics → `CompileResult.warnings[]`.

**1.3 Деструктуризация параметров — не реализована**
В `packages/bt-ir/src/lowering/statements/declarations.ts` (~L348) и `packages/bt-ir/src/analyzer/scope-analyzer.ts` (~L349) — помечено TODO, молча ломает код с destructured parameters.

**1.4 Walker: catch parameter не посещается**
В `packages/bt-ir/src/passes/walker.ts` — `forEachStatement()` не обходит catch parameter, что может привести к некорректному hoist.

---

### 2. ВЫСОКИЕ (P1) — Архитектурные слабости

**2.1 Нет валидации порядка passes**
`packages/bt-ir/src/passes/types.ts` — `IRPass` = `name + run()`, без `dependsOn`. Try-finally ДОЛЖЕН бежать до hoist — нигде не enforced. При добавлении новых passes легко нарушить → тихие баги. Рекомендация: `dependsOn?: string[]` + топологическая валидация.

**2.2 Глобальный BindingManager singleton**
`packages/bt-ir/src/lowering/binding.ts` — `globalBindings: BindingManager | null` предполагает однопоточность. Блокирует параллельную компиляцию (roadmap: incremental). Рекомендация: убрать global, использовать только через `ctx.bindings`.

**2.3 Нет error boundary в passes/emitter**
`packages/bt-ir/src/pipeline/index.ts` — если pass бросает исключение, нет контекста (какой pass, какая IR нода). Рекомендация: try-catch + имя pass + IR context.

**2.4 Expression dispatch — 343-строчная if-chain**
`packages/bt-ir/src/lowering/expressions/dispatch.ts` (L302-645) — линейная цепочка `if (ts.isXxx(node))`. Рекомендация: `Map<SyntaxKind, Handler>` или switch для exhaustive matching.

**2.5 `visitClassDeclaration` — 429 строк**
`packages/bt-ir/src/lowering/statements/declarations.ts` (L352-781) — самая большая функция. Constructor + methods + properties + prototype + super — всё inline. Рекомендация: разбить на `buildClassConstructor()`, `buildClassMethods()`, etc.

---

### 3. СРЕДНИЕ (P2) — Технический долг

| #   | Проблема                                     | Файл                                                           | Рекомендация                        |
| --- | -------------------------------------------- | -------------------------------------------------------------- | ----------------------------------- |
| 3.1 | Source maps не реализованы                   | `packages/bt-ir/src/emitter/emit-helpers.ts`                   | High-value DX, отдельный проект     |
| 3.2 | Дублирование assignment-логики 3x            | `packages/bt-ir/src/lowering/expressions/operators.ts`         | Выделить `assignmentHelper()`       |
| 3.3 | Дублирование optional chaining access        | `packages/bt-ir/src/lowering/expressions/dispatch.ts`          | Выделить `accessExpressionHelper()` |
| 3.4 | Dead code: повторный NonNullExpression check | `packages/bt-ir/src/lowering/expressions/dispatch.ts` L388-391 | Удалить                             |
| 3.5 | Dead code: emit-hoisting.ts                  | `packages/bt-ir/src/emitter/emit-hoisting.ts`                  | Удалить файл                        |
| 3.6 | GlobalCache → bt.cache hardcoded             | `packages/bt-ir/src/lowering/expressions/calls.ts` L173-181    | Generic platform type dispatch      |
| 3.7 | `isXmlRelatedType` без кэширования           | `packages/bt-ir/src/lowering/helpers.ts`                       | Мемоизация по Symbol                |
| 3.8 | `_allVariables` unused param                 | `packages/bt-ir/src/analyzer/scope-analyzer.ts`                | Удалить                             |
| 3.9 | Try-finally name collision risk              | `packages/bt-ir/src/passes/try-finally-desugar.ts`             | Использовать BindingManager         |

---

### 4. НИЗКИЕ (P3) — Future work

- **Labeled statements** — break/continue labels работают, но `label: stmt` не обрабатывается
- **Comma expression** — IR.sequence() builder есть, lowering не генерирует
- **Walker: нет parent tracking** — невозможны context-aware passes
- **Walker: нет context accumulation** — mapper = pure function без scope state
- **`usePolyfills` flag неиспользуем** — задокументировать как "reserved"
- **Нет `IR.undefined()` builder** — не критично, используется `IR.id("undefined")`
- **Нет runtime validation в builders** — `IR.binary("invalid_op")` компилируется

---

### 5. Типовая информация в IR Passes

Сейчас TypeChecker используется только в lowering (polyfills, XML). IR осознанно type-free — это даёт простоту и расширяемость. Если Boolean optimization (P004) станет приоритетом → добавить optional `typeHint?: TypeHint` к `IRExpression`. Это расширение, не breaking change. **Рекомендация: не внедрять сейчас.**

---

### 6. Проблемы стека BorisScript

| Проблема                              | Причина                    | Влияние                    | Митигация               |
| ------------------------------------- | -------------------------- | -------------------------- | ----------------------- |
| Verbose output (env/desc boilerplate) | BS нет closures            | Каждая функция +10 строк   | Output size не критичен |
| `bt.isTrue()` overhead                | BS `\|\|`/`&&` ≠ JS truthy | Каждый `&&` = 3 строки     | Accepted (ADR-009)      |
| Try-finally state machine ~200 LOC    | BS finally broken          | Verbose, hard to debug     | Source maps покроют     |
| All let/const → var                   | BS нет block scope         | Shadowing → переименование | Scope analyzer 3.5-pass |

---

### Приоритизированный план действий

**Tier 1 — Ближайший спринт:**

1. Fix try-finally closure capture (1.1)
2. Diagnostic warnings вместо console.warn (1.2)
3. Error boundary для passes/emitter (2.3)
4. Удалить dead code (3.4, 3.5, 3.8)

**Tier 2 — Следующий спринт:** 5. Pass ordering validation (2.1) 6. Разбить visitClassDeclaration (2.5) 7. Assignment/optional chaining дедупликация (3.2, 3.3) 8. isXmlRelatedType мемоизация (3.7)

**Tier 3 — Backlog:** 9. Убрать глобальный BindingManager (2.2) 10. Source maps (3.1) 11. Generic platform type dispatch (3.6) 12. Map-based expression dispatch (2.4)

---

### Verification

1. **1.1:** Тест с функцией внутри finally, содержащей return
2. **1.2:** Grep `console.warn` + `__unknown__` + `__invalid__` → заменить на diagnostics
3. **Dead code:** `grep -r "emit-hoisting" packages/bt-ir/` → 0 импортов
4. **Все изменения:** `npx turbo run build && pnpm run test` → 113+ тестов

### Decisions

- Type info в IR — отложить, IR осознанно type-free
- Source maps — high value, отдельный проект
- Boolean optimization (P004) — остаётся rejected

### Further Considerations

1. **Diagnostic system:** Использовать существующий `CompileResult.errors[]`? Или отдельный `warnings[]`? Рекомендация: `warnings[] + failOnUnknown: boolean` в options.
2. **Walker расширение:** Добавлять parent tracking сейчас или когда понадобится? Рекомендация: отложить до первого pass, который потребует.
3. **Expression dispatch refactor:** Map<SyntaxKind, Handler> ломает текущий стиль кода. Рекомендация: если будет >25 expression types — переходить на Map.
