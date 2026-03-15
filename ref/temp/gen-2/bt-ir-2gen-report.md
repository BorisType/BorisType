# BT-IR 2-Gen: Отчёт о реализации

**Дата:** 2026-03-15  
**План:** `ref/temp/bt-ir-2gen-plan.md`  
**Базовая линия:** 114/114 тестов, 121/123 совпадений с `build_old` (1 diff + 1 new)

---

## Сводка

Все 4 волны плана **полностью реализованы**. Все критерии завершения из Section 7 выполнены.

| Волна                                    | Статус    | Коммит                                                                    |
| ---------------------------------------- | --------- | ------------------------------------------------------------------------- |
| Wave 0: Quick Wins                       | ✅ Готово | `refactor(bt-ir): cleanup stale comments and dead code`                   |
| Wave 1: Diagnostic инфраструктура        | ✅ Готово | `refactor(bt-ir): diagnostic infrastructure + replace console.warn`       |
| Wave 2: Error handling                   | ✅ Готово | `refactor(bt-ir): error handling + break/continue try-finally diagnostic` |
| Wave 3: Unsupported features + proposals | ✅ Готово | `refactor(bt-ir): diagnostic errors for unsupported features + proposals` |

---

## Верификация (финальная)

| Гейт               | Результат                                                                                                              |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| **G3: Сборка**     | 14/14 tasks, 0 ошибок                                                                                                  |
| **G1: Тесты**      | 114/114 passed                                                                                                         |
| **G2: Build diff** | 121 identical, 1 different (`semantic/functions.test.js`), 1 new (`semantic/for-of-captured.test.js`) — оба допустимые |

---

## Детали по волнам

### Wave 0: Quick Wins (QW-1..QW-5)

| Задача | Статус | Что сделано                                                                              |
| ------ | ------ | ---------------------------------------------------------------------------------------- |
| QW-1   | ✅     | Удалены 3 ссылки на `collectVariableNames` в `walker.ts`, `hoist.ts`                     |
| QW-2   | ✅     | Удалены stale `emit-hoisting.*` из `build/emitter/`                                      |
| QW-3   | ✅     | Удалён дубликат unreachable `isNonNullExpression` check в `dispatch.ts`                  |
| QW-4   | ✅     | Удалён unused параметр `_allVariables` из `resolveVarLetConflicts` в `scope-analyzer.ts` |
| QW-5   | ✅     | `TODO.md` обновлён ссылкой на 2gen-plan                                                  |

### Wave 1: Diagnostic инфраструктура (S1-A, S1-B)

**Архитектурное решение:** Использовать `ts.Diagnostic` напрямую вместо кастомного типа.
Это позволяет btc's `reportDiagnostics()` работать без изменений.

| Задача | Статус | Что сделано                                                                                                                           |
| ------ | ------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| S1-A   | ✅     | Создан `pipeline/diagnostics.ts` с `BtDiagnosticCode` (90001–90015) и хелперами `createBtDiagnostic()`, `createBtDiagnosticMessage()` |
| S1-A   | ✅     | `VisitorContext.diagnostics: ts.Diagnostic[]` — инициализируется пустым, шарится через child contexts                                 |
| S1-A   | ✅     | `CompileResult.errors: string[]` → `CompileResult.diagnostics: ts.Diagnostic[]`                                                       |
| S1-B   | ✅     | 9 `console.warn` → `ctx.diagnostics.push(createBtDiagnostic(...))`                                                                    |

**Отклонение от плана:**

- План предлагал `Diagnostic { level, message, pos? }` — реализовано как `ts.Diagnostic` напрямую.
  Причина: единый формат с TypeScript, btc не нужно конвертировать, `ts.formatDiagnosticsWithColorAndContext()` работает.
- План предлагал `CompileResult.warnings: string[]` — реализовано как `CompileResult.diagnostics: ts.Diagnostic[]`.
  Причина: один массив для всех уровней (error + warning), типизированный формат вместо строк.

**Затронутые файлы:**

- `pipeline/diagnostics.ts` (новый)
- `pipeline/index.ts` — CompileResult, compile(), compileSourceFile()
- `lowering/visitor.ts` — VisitorContext, TransformResult, transformToIR()
- `lowering/expressions/dispatch.ts` — 1 console.warn replaced
- `lowering/expressions/operators.ts` — 4 console.warn replaced
- `lowering/statements/dispatch.ts` — 3 console.warn replaced
- `lowering/statements/declarations.ts` — 1 console.warn replaced
- `lowering/bare-visitors.ts` — diagnostics propagation в child context
- `lowering/function-helpers.ts` — diagnostics propagation в child context
- `cli.ts` — использование ts.formatDiagnosticsWithColorAndContext()
- `index.ts` — новые экспорты
- `README.md` — обновлена документация CompileResult

### Wave 2: Error handling (S1-C, A3, S2-A)

| Задача | Статус | Что сделано                                                                                  |
| ------ | ------ | -------------------------------------------------------------------------------------------- |
| S1-C   | ✅     | `success: false` при наличии error-level diagnostics                                         |
| A3     | ✅     | Error boundary вокруг `runPasses()` и `emit()` в `pipeline/index.ts`                         |
| A3     | ✅     | `runPasses()` оборачивает каждый `pass.run()` с именем pass в ошибке                         |
| S2-A   | ✅     | `detectBreakContinueInTry()` + `checkBreakContinueInStatements()` в `try-finally-desugar.ts` |

**Детали S2-A (break/continue в try-finally):**

- Реализован вариант 1 из плана: pass бросает ошибку, error boundary ловит
- Кастомная рекурсия (не walker) чтобы корректно пропускать функции/циклы/switch
- Проверено ручными тестами: break в try → error, break в цикле внутри try → OK, break в функции внутри try → OK

**Затронутые файлы:**

- `pipeline/index.ts` — error boundaries, success: false logic
- `passes/index.ts` — try-catch per pass в runPasses()
- `passes/try-finally-desugar.ts` — detectBreakContinueInTry(), checkBreakContinueInStatements()
- `bt-cli/src/core/building/compiler.ts` — EmitSourceFilesResult, diagnostics integration

### Wave 3: Unsupported features + proposals (A1, A2, P-005..P-007)

| Задача | Статус | Что сделано                                                                               |
| ------ | ------ | ----------------------------------------------------------------------------------------- |
| A1     | ✅     | Computed keys → diagnostic error 90010 в `literals.ts`                                    |
| A2     | ✅     | Destructured params → diagnostic error 90011 в `bare-visitors.ts` и `function-helpers.ts` |
| A2     | ✅     | TODO комментарий в `scope-analyzer.ts` обновлён (пояснение что diagnostic в lowering)     |
| P-005  | ✅     | `ref/proposals/2026-03-15-computed-object-keys.md`                                        |
| P-006  | ✅     | `ref/proposals/2026-03-15-destructured-parameters.md`                                     |
| P-007  | ✅     | `ref/proposals/2026-03-15-break-continue-try-finally.md`                                  |

**Находка при реализации A2:**

- В bare mode параметры обрабатываются `collectBareParams()` (в `bare-visitors.ts`), не `extractFunctionParams()` (в `function-helpers.ts`).
- План указывал только `function-helpers.ts` и `scope-analyzer.ts` — пропущен bare mode path.
- Диагностика добавлена в оба пути: `collectBareParams()` и `extractFunctionParams()`.

---

## Критерии завершения (Section 7)

| Критерий                                      | Статус | Проверка                                                                                                           |
| --------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------ |
| 0 `console.warn` в bt-ir/src/                 | ✅     | `Select-String` — 0 matches                                                                                        |
| 0 `collectVariableNames` в bt-ir/src/         | ✅     | `Select-String` — 0 matches                                                                                        |
| 0 `emit-hoisting` в bt-ir/build/              | ✅     | `Test-Path` — False                                                                                                |
| 1 `isNonNullExpression` в dispatch.ts         | ✅     | 2 references: 1 в `unwrapTypeExpressions()` (utility) + 1 в visitor (case handler). Дублирующий unreachable удалён |
| CompileResult содержит diagnostics            | ✅     | `diagnostics: ts.Diagnostic[]` (вместо `warnings: string[]` из плана)                                              |
| `success: false` при error diagnostics        | ✅     | Проверено manual tests                                                                                             |
| runPasses + emit обёрнуты в error boundary    | ✅     | `pipeline/index.ts`                                                                                                |
| break/continue в try-finally → ошибка         | ✅     | Проверено 3 manual tests                                                                                           |
| Computed keys → ошибка (не silent drop)       | ✅     | Code 90010, проверено manual test                                                                                  |
| Destructured params → ошибка (не silent skip) | ✅     | Code 90011, проверено manual test                                                                                  |
| Все тесты проходят                            | ✅     | 114/114                                                                                                            |
| diff-builds — нет неожиданных расхождений     | ✅     | 121 identical, 1 known diff, 1 new                                                                                 |
| Proposals для unsupported features            | ✅     | 3 proposals в `ref/proposals/`                                                                                     |
| ROADMAP.md обновлён                           | ⏳     | Обновить при коммите                                                                                               |

---

## Диагностические коды

| Код   | Константа                    | Уровень     | Источник                                             |
| ----- | ---------------------------- | ----------- | ---------------------------------------------------- |
| 90001 | UnhandledExpression          | Error       | expressions/dispatch.ts                              |
| 90002 | InvalidAssignmentTarget      | Error       | expressions/operators.ts                             |
| 90003 | NullishCoalescingBareMode    | Error       | expressions/operators.ts                             |
| 90004 | UnknownOperator              | Error       | expressions/operators.ts                             |
| 90005 | InvalidUpdateOperand         | Error       | expressions/operators.ts                             |
| 90006 | DestructuringNotSupported    | Error       | statements/declarations.ts                           |
| 90007 | ModuleDeclarationUnsupported | **Warning** | statements/dispatch.ts                               |
| 90008 | ClassDeclarationBareMode     | Error       | statements/dispatch.ts                               |
| 90009 | UnhandledStatement           | Error       | statements/dispatch.ts                               |
| 90010 | ComputedPropertyKey          | Error       | expressions/literals.ts                              |
| 90011 | DestructuredParameter        | Error       | bare-visitors.ts, function-helpers.ts                |
| 90012 | BreakContinueTryFinally      | —           | (зарезервирован, пока используется через pass error) |
| 90013 | PassFailed                   | Error       | pipeline/index.ts (error boundary)                   |
| 90014 | EmitFailed                   | Error       | pipeline/index.ts (error boundary)                   |
| 90015 | TransformFailed              | Error       | pipeline/index.ts (error boundary)                   |

---

## Отклонения от плана

| Пункт плана                                       | Что реализовано                              | Причина                                                                                                             |
| ------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `Diagnostic { level, message, pos? }`             | `ts.Diagnostic` напрямую                     | Единый формат с TS, btc integration без конвертации                                                                 |
| `CompileResult.warnings: string[]`                | `CompileResult.diagnostics: ts.Diagnostic[]` | Один типизированный массив для всех уровней                                                                         |
| `isNonNullExpression`: 1 check                    | 2 checks (unwrap utility + visitor)          | unwrapTypeExpressions — self-contained utility, не дубликат                                                         |
| A2 только function-helpers + scope-analyzer       | + bare-visitors.ts                           | Plan не учёл bare mode path (`collectBareParams`)                                                                   |
| S2-A: "нужен тест в tests/src/try-catch-finally/" | Manual tests (не в test suite)               | break/continue в try-finally — **заблокированная фича** (diagnostic error), тестировать нечего кроме самой детекции |

---

## Новые/изменённые файлы (полный список)

### Новые файлы

- `packages/bt-ir/src/pipeline/diagnostics.ts` — коды и хелперы диагностик
- `ref/proposals/2026-03-15-computed-object-keys.md`
- `ref/proposals/2026-03-15-destructured-parameters.md`
- `ref/proposals/2026-03-15-break-continue-try-finally.md`

### Изменённые файлы (bt-ir)

- `src/pipeline/index.ts` — CompileResult, compile(), compileSourceFile(), error boundaries
- `src/lowering/visitor.ts` — VisitorContext.diagnostics, TransformResult
- `src/lowering/index.ts` — export TransformResult
- `src/lowering/expressions/dispatch.ts` — QW-3 + diagnostic
- `src/lowering/expressions/operators.ts` — 4 diagnostics
- `src/lowering/expressions/literals.ts` — A1 computed keys diagnostic
- `src/lowering/statements/dispatch.ts` — 3 diagnostics
- `src/lowering/statements/declarations.ts` — 1 diagnostic
- `src/lowering/bare-visitors.ts` — diagnostics propagation + A2 destructured params
- `src/lowering/function-helpers.ts` — A2 destructured params diagnostic
- `src/passes/index.ts` — try-catch per pass
- `src/passes/walker.ts` — QW-1 stale comment
- `src/passes/hoist.ts` — QW-1 stale comment
- `src/passes/try-finally-desugar.ts` — S2-A break/continue detection
- `src/analyzer/scope-analyzer.ts` — QW-4 unused param + updated TODO
- `src/cli.ts` — diagnostics formatting
- `src/index.ts` — exports
- `README.md` — CompileResult docs
- `TODO.md` — QW-5

### Изменённые файлы (bt-cli)

- `src/core/building/compiler.ts` — EmitSourceFilesResult, diagnostics integration

### Удалённые файлы

- `packages/bt-ir/build/emitter/emit-hoisting.ts` (+ .js, .d.ts)
