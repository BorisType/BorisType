# BT-IR 3-Gen: Архитектурный рефакторинг

**Дата:** 2026-03-15
**Цель:** Подготовить архитектуру bt-ir к безболезненному расширению — новые конструкции, новые passes,
баг-фиксы должны добавляться _не задумываясь_ о скрытых контрактах и забытых dispatch-ах.

**Источники:**

- `ref/temp/gen-2/bt-ir-final-review-claude.md` — консолидированное ревью
- `ref/temp/gen-2/bt-ir-final-review-composer.md` — финальное ревью с верификацией
- `ref/temp/gen-2/bt-ir-final-review-merged.md` — аудит обоих ревью
- `ref/temp/gen-2/bt-ir-2gen-plan.md` — план gen-2
- `ref/temp/gen-2/bt-ir-2gen-report.md` — отчёт gen-2

**Базовая линия:** 114/114 тестов, 121/123 совпадений с `build_old`

---

## 0. Что было сделано в gen-2

Gen-2 закрыл **все задачи Tier S и Tier A** из ревью:

| ID      | Задача                                   | Статус в gen-2      |
| ------- | ---------------------------------------- | ------------------- |
| S1      | Diagnostic система (console.warn → ctx)  | ✅ Реализовано      |
| S2/A4   | break/continue в try-finally             | ✅ Diagnostic error |
| A1      | Computed object keys                     | ✅ Diagnostic error |
| A2      | Деструктуризация параметров              | ✅ Diagnostic error |
| A3      | Error boundary для passes/emitter        | ✅ Реализовано      |
| QW-1..5 | Очистка (stale comments, dead code, etc) | ✅ Реализовано      |

Также создано 3 proposal-а для заблокированных фич (P-005, P-006, P-007).

---

## 1. Философия gen-3

**Gen-2** закрыл _диагностический_ gap — unsupported конструкции больше не ломают output молча.
**Gen-3** закрывает _архитектурный_ gap — убирает скрытые контракты, которые делают расширение хрупким.

Реализация конкретных фич (computed keys, деструктуризация, break/continue try-finally) **не входит** в gen-3.
Эти фичи станут _простыми_ после того, как архитектура будет готова.

### Что значит "готовая архитектура"

| Сценарий                       | Сейчас                                                                          | После gen-3                                                        |
| ------------------------------ | ------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Добавить новый IR node type    | Тронуть 6–8 файлов; забыть один → silent bug в output                           | TS compile error если забыл case (exhaustiveness)                  |
| Добавить новый pass            | Только `{ name, run() }`; pass не умеет пушить диагностики; порядок implicit    | `dependsOn` + `PassContext` с diagnostics                          |
| Добавить expression lowering   | Пушить в `ctx.pendingStatements`, надеяться что statement visitor сделает flush | Явный контракт: `visitExpression()` возвращает `{ expr, hoisted }` |
| Баг-фикс в assignment lowering | Повторить одинаковый фикс в 3 дублированных блоках                              | Один `assignToAccess()` helper                                     |
| Баг-фикс в class lowering      | Разобраться в 260-строчном монолите                                             | Отдельный `buildConstructor()`, `processMethods()`, etc.           |
| Добавить optimization pass     | Passes не видят parent/scope; walker без контекста                              | walker с `WalkContext` (parent, scope info)                        |

---

## 2. Ревизия отложенных задач

### 2.1. Задачи, которые ЗАКРЫЛИСЬ сами после gen-2

| ID  | Задача                              | Почему закрыта                                                                         |
| --- | ----------------------------------- | -------------------------------------------------------------------------------------- |
| B2  | Walker не обходит expressions       | **Реализовано.** `walker.ts` содержит `mapExpression()`, `mapExpressionChildren()`     |
| C1  | Глобальный BindingManager singleton | **Не подтверждено.** Инстанс per file через `new BindingManager()` в `visitor.ts`      |
| C3  | precedence.ts dead code             | **Не подтверждено.** Активно используется в lowering (11 вызовов `needsParentheses()`) |
| C5  | Устаревшие комментарии              | **Реализовано** в gen-2 (QW-1)                                                         |
| C9  | usePolyfills flag                   | **Не подтверждено.** Корректно используется в `mode-config.ts`                         |

### 2.2. Архитектурные проблемы (полная карта)

Ниже — все архитектурные проблемы, которые делают расширение bt-ir хрупким. Ранжированы по **влиянию на расширяемость**, а не по вероятности проявления бага.

| ID  | Проблема                           | Что блокирует                                                                | Трудозатраты |
| --- | ---------------------------------- | ---------------------------------------------------------------------------- | ------------ |
| B3  | Нет exhaustiveness checks          | Новые IR nodes → silent bugs в walker/emitter                                | 2–3 часа     |
| B1  | pendingStatements side-channel     | Любой новый expression lowering (computed keys, destructuring, spread, etc.) | 2–3 дня      |
| B4  | Нет pass ordering validation       | Добавление 3+ passes                                                         | 2–4 часа     |
| NEW | Passes не умеют пушить диагностики | Passes ограничены throw, не warning                                          | 3–4 часа     |
| C10 | Дублирование assignment logic      | Баг-фиксы нужны в 3 местах                                                   | 2–3 часа     |
| B5  | visitClassDeclaration — 260 стр.   | private fields, decorators (v0.4.0)                                          | 4–6 часов    |
| NEW | Walker без parent/scope context    | Optimization passes (DCE, const folding)                                     | 4–8 часов    |
| C2  | NameGen/BindingManager collision   | Теоретическая; при расширении try-finally                                    | 1 час        |
| B6  | isXmlRelatedType нет кэша          | Большие файлы → замедление                                                   | 1–2 часа     |
| C7  | Hardcoded GlobalCache dispatch     | Новые platform types                                                         | 2–3 дня      |

### 2.3. Фичи (proposals) — НЕ входят в gen-3

Реализация фич отложена. Gen-3 **готовит архитектуру**, чтобы эти фичи потом стали простыми:

| Proposal | Фича                         | Что нужно от архитектуры                                |
| -------- | ---------------------------- | ------------------------------------------------------- |
| P-005    | Computed object keys         | Чистый pendingStatements контракт (B1)                  |
| P-006    | Destructured parameters      | Чистый pendingStatements + scope analyzer extensibility |
| P-007    | break/continue в try-finally | PassContext с диагностиками (NEW) + pass ordering (B4)  |
| P-004    | Boolean optimization         | Walker с type context (NEW)                             |

---

## 3. Scope gen-3

### 3.1. Что входит

```
Обязательные (архитектурный фундамент):
├── B3:  Exhaustiveness checks                                [2–3 часа]
├── B1:  pendingStatements → явный контракт                   [2–3 дня]
├── B4:  Pass ordering validation (dependsOn)                 [2–4 часа]
├── NEW: PassContext с диагностиками для passes                [3–4 часа]
├── C10: Извлечение assignment helper (deduplicate)           [2–3 часа]
└── B5:  Разбить visitClassDeclaration                        [4–6 часов]

По возможности (advanced walker):
└── NEW: Walker с parent/scope context (WalkContext)          [4–8 часов]
```

### 3.2. Что НЕ входит

| ID    | Задача                         | Причина                                                |
| ----- | ------------------------------ | ------------------------------------------------------ |
| P-005 | Computed object keys           | Фича. Станет простой после B1                          |
| P-006 | Destructured parameters        | Фича. Станет простой после B1                          |
| P-007 | break/continue try-finally     | Фича. Станет простой после PassContext + B4            |
| P-004 | Boolean optimization           | Требует type info в passes, отложено                   |
| C6    | Source maps                    | Отдельный проект, high effort                          |
| C7    | Generic platform type dispatch | Hardcoded GlobalCache работает; расширить при use case |
| B6    | isXmlRelatedType caching       | Оптимизация, не архитектура                            |
| C2    | NameGen collision              | Крайне маловероятно                                    |
| C4    | Expression dispatch → Map      | Текущий стиль приемлем                                 |

---

## 4. Детальный план задач

### 4.0. Методология верификации

Та же что в gen-2:

| Гейт               | Команда                                        | Проход                    |
| ------------------ | ---------------------------------------------- | ------------------------- |
| **G1: Тесты**      | `pnpm run test` (from root)                    | Все тесты pass            |
| **G2: Build diff** | `node tests/diff-builds.js --diff` (from root) | Нет неожиданных изменений |
| **G3: Сборка**     | `npx turbo run build --force` (from root)      | 0 ошибок                  |

**Именование коммитов:** Conventional Commits

---

### 4.1. ВОЛНА 0 — Exhaustiveness checks (B3)

**Цель:** Добавить новый IR node type → забыть обработку где-то → **TS compile error** вместо silent bug.

Сейчас все dispatch-функции (walker, emitter) имеют `default` ветку, которая молча возвращает
нод без обработки (walker) или генерирует `/* unknown */` комментарий в output (emitter).
Это означает: добавить новый `IRStatement` или `IRExpression` в union → 6–8 файлов тронуть →
забыть один = silent bug, который обнаружится только через тесты или ручную проверку output.

#### B3: Exhaustiveness checks в switch-dispatch

**Суть:** Заменить `default: return unchanged` на `default: assertNever(node.kind)` в:

**Файлы:**

| Файл                          | Функция                   | Текущий default                     |
| ----------------------------- | ------------------------- | ----------------------------------- |
| `passes/walker.ts`            | `mapStatementChildren()`  | `return stmt` (silent no-traverse)  |
| `passes/walker.ts`            | `mapExpressionChildren()` | `return expr` (silent no-traverse)  |
| `emitter/emit-statements.ts`  | `emitStatement()`         | `/* Unknown statement: ${kind} */`  |
| `emitter/emit-expressions.ts` | `emitExpression()`        | `/* unknown expression: ${kind} */` |

**Вспомогательная функция:**

```typescript
// ir/index.ts (или utils.ts)
export function assertNever(value: never, message?: string): never {
  throw new Error(message ?? `Unhandled IR node kind: ${value}`);
}
```

**Нюанс:** walker `mapStatementChildren` не обрабатывает некоторые statement types
(VariableDeclaration, ReturnStatement, ExpressionStatement, ThrowStatement, BreakStatement,
ContinueStatement, EmptyStatement, EnvDeclaration, EnvAssign) т.к. они — leaf nodes без
вложенных statements. Нужно добавить для них явные `case X: return stmt;` перед `default: assertNever(...)`.

**DoD:**

- [ ] Все 4 dispatch-функции имеют exhaustiveness check
- [ ] Leaf nodes явно перечислены (не падают в default)
- [ ] Добавление нового IR node type → TS compile error
- [ ] G1 + G2 + G3

```
→ Коммит: refactor(bt-ir): exhaustiveness checks in walker and emitter (B3)
```

---

### 4.2. ВОЛНА 1 — Pass infrastructure (B4 + PassContext)

**Цель:** Passes становятся first-class citizens: декларируют зависимости, пушат диагностики.

Сейчас:

- `IRPass` = `{ name, run() }` — минимальный интерфейс
- Passes бросают ошибки через `throw`, error boundary ловит и превращает в diagnostic
- Порядок passes зашит в коде `runPasses(ir, [tryFinallyDesugarPass, hoistPass])`

#### B4 + NEW: PassContext и ordering validation

##### 4.2.1. Расширить `IRPass` interface

```typescript
// passes/types.ts
export interface PassContext {
  diagnostics: ts.Diagnostic[];
  sourceFile?: ts.SourceFile;
}

export interface IRPass {
  name: string;
  /** Passes, которые ДОЛЖНЫ выполниться до этого */
  dependsOn?: string[];
  run(program: IRProgram, ctx: PassContext): IRProgram;
}
```

##### 4.2.2. Обновить `runPasses()`

```typescript
// passes/index.ts
export function runPasses(program: IRProgram, passes: IRPass[], ctx: PassContext): IRProgram {
  const executed = new Set<string>();
  let result = program;

  for (const pass of passes) {
    // Validate ordering
    if (pass.dependsOn) {
      for (const dep of pass.dependsOn) {
        if (!executed.has(dep)) {
          throw new Error(`Pass "${pass.name}" depends on "${dep}" which hasn't been executed yet`);
        }
      }
    }

    try {
      result = pass.run(result, ctx);
    } catch (e) {
      throw new Error(`Pass "${pass.name}" failed: ${e instanceof Error ? e.message : e}`, {
        cause: e,
      });
    }

    executed.add(pass.name);
  }

  return result;
}
```

##### 4.2.3. Обновить passes

```typescript
// try-finally-desugar.ts
export const tryFinallyDesugarPass: IRPass = {
  name: "try-finally-desugar",
  run(program, ctx) {
    // Теперь можно: ctx.diagnostics.push(...) вместо throw
    // ... existing logic ...
  }
};

// hoist.ts
export const hoistPass: IRPass = {
  name: "hoist",
  dependsOn: ["try-finally-desugar"],
  run(program, ctx) { ... }
};
```

##### 4.2.4. Обновить pipeline

**Файл:** `pipeline/index.ts`

`runPasses()` теперь принимает `PassContext`. В `compile()` / `compileSourceFile()`:

```typescript
const passCtx: PassContext = {
  diagnostics: allDiagnostics, // тот же массив, что и lowering diagnostics
  sourceFile,
};
ir = runPasses(ir, [tryFinallyDesugarPass, hoistPass], passCtx);
```

##### 4.2.5. Перевести break/continue detection на диагностики

Сейчас `detectBreakContinueInTry()` бросает `throw` → error boundary ловит.
После этого рефакторинга: push diagnostic + return unchanged program.

**DoD:**

- [ ] `IRPass` имеет `dependsOn` и принимает `PassContext`
- [ ] `PassContext` содержит `diagnostics: ts.Diagnostic[]`
- [ ] `runPasses()` валидирует порядок
- [ ] break/continue detection пушит diagnostic вместо throw
- [ ] Неправильный порядок passes → throw
- [ ] G1 + G2 + G3

```
→ Коммит: refactor(bt-ir): pass infrastructure — PassContext, dependsOn, diagnostics (B4)
```

---

### 4.3. ВОЛНА 2 — pendingStatements refactor (B1)

**Цель:** Устранить самый хрупкий implicit контракт в lowering.

#### Проблема

`ctx.pendingStatements: IRStatement[]` — мутабельный массив, разделяемый между всеми visitors.
Любой expression visitor может push-ить statements, а statement visitor должен flush ПЕРЕД
своим statement. Контракт нигде не описан, не проверяется, не тестируется.

**Текущий паттерн (implicit):**

```
visitStatement():
  1. stmts = visitExpression(expr)  // может push в ctx.pendingStatements
  2. result = [...ctx.pendingStatements, myStatement]
  3. ctx.pendingStatements = []     // flush (иногда через splice, иногда через spread)
```

**Проблемы:**

- 20+ push-ей в 8+ файлах vs 3 flush-а — легко забыть flush
- Flush через spread (`[...pending, stmt]`) в разных местах — нет единого места
- При вложенных вызовах (expression → sub-expression → push) порядок зависит от call stack
- Нет способа визуально увидеть границу "этот expression может генерировать pending"

#### Стратегия рефакторинга

**Вариант: Expression result с hoisted statements**

Изменить возвращаемый тип expression visitors:

```typescript
/** Результат посещения выражения */
interface ExpressionResult {
  /** Итоговое IR-выражение */
  expr: IRExpression;
  /** Statements, которые нужно вставить ДО текущего statement */
  hoisted: IRStatement[];
}
```

Тогда:

- `visitExpression()` возвращает `ExpressionResult` (а не просто `IRExpression`)
- Statement visitors собирают `hoisted` от всех sub-expressions явно
- `pendingStatements` из `VisitorContext` удаляется
- Контракт становится явным через типы

**Сложность этого рефакторинга:**

Затрагиваются ВСЕ expression visitors (dispatch, operators, literals, calls, functions, module-access)
и ВСЕ statement visitors (dispatch, declarations, control-flow, loops, blocks).

**Декомпозиция на подзадачи:**

##### B1-A: Определить `ExpressionResult` тип

**Файл:** `lowering/visitor.ts`

```typescript
export interface ExpressionResult {
  expr: IRExpression;
  hoisted: IRStatement[];
}

/** Хелпер для "простого" выражения без hoisted */
export function pureExpr(expr: IRExpression): ExpressionResult {
  return { expr, hoisted: [] };
}

/** Хелпер: объединить hoisted от нескольких sub-expressions */
export function mergeHoisted(results: ExpressionResult[]): IRStatement[] {
  const stmts: IRStatement[] = [];
  for (const r of results) {
    stmts.push(...r.hoisted);
  }
  return stmts;
}
```

##### B1-B: Изменить `visitExpression()` сигнатуру

**Файл:** `lowering/expressions/dispatch.ts`

`visitExpression()` → возвращает `ExpressionResult` вместо `IRExpression`.
Все вызовы `ctx.pendingStatements.push(...)` внутри expression visitors → добавлять в `hoisted`.

Это самая объёмная часть. Каждый файл в `lowering/expressions/` нужно обновить:

| Файл               | push-ей сейчас | Что делать                                         |
| ------------------ | -------------- | -------------------------------------------------- |
| `dispatch.ts`      | 3              | Возвращать `ExpressionResult` + merge от sub-exprs |
| `operators.ts`     | 3              | compound assignment temp vars → hoisted            |
| `literals.ts`      | 3              | object method temp, spread temp → hoisted          |
| `calls.ts`         | 0              | Только прокидывает results от sub-expressions      |
| `functions.ts`     | 0              | Только прокидывает                                 |
| `module-access.ts` | 0              | Только прокидывает                                 |

##### B1-C: Обновить statement visitors

**Файлы:** `lowering/statements/dispatch.ts`, `declarations.ts`, `control-flow.ts`, `loops.ts`, `blocks.ts`

Каждый statement visitor, который вызывает `visitExpression()`, теперь получает
`ExpressionResult` и должен prefix-нуть `hoisted` перед своим statement:

```typescript
// Было:
const value = visitExpression(ctx, node.expression);
return [IR.exprStmt(value)];

// Стало:
const result = visitExpression(ctx, node.expression);
return [...result.hoisted, IR.exprStmt(result.expr)];
```

##### B1-D: Обновить bare-visitors.ts и function-helpers.ts

Bare mode (`collectBareParams`, `visitBareStatement`) тоже использует pendingStatements.
Аналогичные изменения.

##### B1-E: Удалить `pendingStatements` из `VisitorContext`

Финальный шаг: убрать поле, убедиться что 0 references.

**Альтернативный подход (менее инвазивный):**

Если полная замена `ExpressionResult` слишком объёмна, можно сделать промежуточный шаг:

```typescript
/** Scope для pendingStatements — гарантирует flush */
function withPendingScope<T>(
  ctx: VisitorContext,
  fn: () => T,
): { result: T; hoisted: IRStatement[] } {
  const saved = ctx.pendingStatements;
  ctx.pendingStatements = [];
  const result = fn();
  const hoisted = ctx.pendingStatements;
  ctx.pendingStatements = saved;
  return { result, hoisted };
}
```

Это менее чистое решение, но:

- Не ломает существующие сигнатуры
- Обеспечивает что flush не забыт (scope-based)
- Переход к `ExpressionResult` можно сделать позже

**Рекомендация:** Выбрать подход при реализации, после оценки объёма затрагиваемого кода.
`withPendingScope` допустим как промежуточный шаг, если `ExpressionResult` оказывается слишком
объёмным за одну волну.

**DoD:**

- [ ] pendingStatements либо удалён, либо обёрнут в scope-safe API
- [ ] Контракт flush → явный (через типы или через scope API)
- [ ] 0 мест с implicit flush (ручной spread + reset)
- [ ] G1 + G2 + G3

```
→ Коммит: refactor(bt-ir): pendingStatements — explicit contract (B1)
```

---

### 4.4. ВОЛНА 3 — Lowering cleanup (C10 + B5)

**Цель:** Устранить дублирование и разбить монолитные функции.

#### C10: Извлечение assignment helper

**Суть:** `visitBinaryExpression()` (263 строки) содержит 3 почти идентичных блока:

1. Property access assignment (`obj.prop = value`), ~43 строки
2. Element access assignment (`obj[key] = value`), ~48 строк
3. Каждый с XML-type special case — дублирует проверку isInternalAccess + isXmlRelatedType

**Изменение:** Извлечь `assignToAccess()`:

```typescript
function assignToAccess(
  ctx: VisitorContext,
  object: IRExpression,
  key: IRExpression | string,
  value: IRExpression,
  isElementAccess: boolean,
  node: ts.Node,
): IRExpression { ... }
```

**DoD:**

- [ ] Один assignment helper
- [ ] `visitBinaryExpression()` уменьшен на ~50 строк
- [ ] G1 + G2

#### B5: Разбить visitClassDeclaration

**Суть:** ~260 строк, 11 mixed concerns. Roadmap v0.4.0 требует private fields и decorators —
модифицировать это в таком виде рискованно.

**Предлагаемое разбиение:**

| Извлечённая функция     | Строки | Что делает                                   |
| ----------------------- | ------ | -------------------------------------------- |
| `collectClassMembers()` | ~30    | Собрать методы, свойства, static members     |
| `buildClassMethods()`   | ~70    | Обойти методы → buildFunction для каждого    |
| `buildConstructor()`    | ~120   | Constructor body, property initializers, env |
| `buildClassHoisting()`  | ~20    | Module vs script branching                   |

Итоговая `visitClassDeclaration()` → ~30 строк координации.

**DoD:**

- [ ] visitClassDeclaration < 50 строк
- [ ] Извлечённые функции описаны JSDoc
- [ ] G1 + G2

```
→ Коммит: refactor(bt-ir): extract assignment helper + split visitClassDeclaration (C10, B5)
```

---

### 4.5. ВОЛНА 4 (по возможности) — Walker context

**Цель:** Подготовить walker к optimization passes.

#### NEW: WalkContext — parent tracking и scope information

Сейчас `mapStatements(stmts, mapper)` вызывает mapper без какого-либо контекста.
Mapper не знает:

- Кто parent (statement? function? program?)
- В каком scope находится (loop? try-catch? function?)
- Какие siblings есть

Это блокирует:

- DCE (dead code elimination) — нужно знать reachability
- Constant folding — нужно знать scope переменных
- Scope-aware optimizations — нужно знать вложенность

**Предлагаемый API:**

```typescript
interface WalkContext {
  /** Родительский statement (null для top-level) */
  parent: IRStatement | null;
  /** Находимся внутри цикла */
  inLoop: boolean;
  /** Находимся внутри try-catch */
  inTryCatch: boolean;
  /** Находимся внутри функции */
  inFunction: boolean;
  /** Глубина вложенности */
  depth: number;
}

type StatementMapper = (stmt: IRStatement, ctx: WalkContext) => IRStatement[] | null;
type ExpressionMapper = (expr: IRExpression, ctx: WalkContext) => IRExpression | null;
```

**Backwards compatibility:** Добавить новые перегрузки `mapStatements()`
или новую функцию `walkStatements()`, не ломая существующие passes.

**DoD:**

- [ ] `WalkContext` определён
- [ ] Mapper functions принимают context
- [ ] Существующие passes работают без изменений (backwards compatible)
- [ ] G1 + G2 + G3

```
→ Коммит: refactor(bt-ir): walker context for parent/scope tracking
```

---

## 5. Порядок выполнения

```
═══════════════════════════════════════════════════════
  ВОЛНА 0 — Exhaustiveness checks (B3)
  Цель: компилятор ловит забытые IR node cases
═══════════════════════════════════════════════════════
  B3: assertNever в 4 dispatch-функциях (walker + emitter)
  Leaf nodes → явные cases
  ──────────────────────────────────────────────
  → Verify: G1 + G2 + G3
  → Коммит: refactor(bt-ir): exhaustiveness checks in walker and emitter

═══════════════════════════════════════════════════════
  ВОЛНА 1 — Pass infrastructure (B4 + PassContext)
  Цель: passes — first-class citizens
═══════════════════════════════════════════════════════
  B4: dependsOn в IRPass + validation в runPasses()
  NEW: PassContext { diagnostics } → passes могут пушить warnings
  S2-A update: break/continue detection → диагностика вместо throw
  ──────────────────────────────────────────────
  → Verify: G1 + G2 + G3
  → Коммит: refactor(bt-ir): pass infrastructure — PassContext, dependsOn

═══════════════════════════════════════════════════════
  ВОЛНА 2 — pendingStatements (B1)
  Цель: убрать самый хрупкий implicit контракт
═══════════════════════════════════════════════════════
  B1-A: ExpressionResult тип (или withPendingScope)
  B1-B: Обновить expression visitors
  B1-C: Обновить statement visitors
  B1-D: Обновить bare-visitors, function-helpers
  B1-E: Удалить pendingStatements из VisitorContext
  ──────────────────────────────────────────────
  → Verify: G1 + G2 + G3
  → Коммит: refactor(bt-ir): explicit pending statements contract

═══════════════════════════════════════════════════════
  ВОЛНА 3 — Lowering cleanup (C10 + B5)
  Цель: устранить дублирование, разбить монолиты
═══════════════════════════════════════════════════════
  C10: Extract assignToAccess() helper
  B5: Split visitClassDeclaration → 4 sub-functions
  ──────────────────────────────────────────────
  → Verify: G1 + G2 + G3
  → Коммит: refactor(bt-ir): extract helpers, split class declaration

═══════════════════════════════════════════════════════
  ВОЛНА 4 (по возможности) — Walker context
  Цель: подготовка к optimization passes
═══════════════════════════════════════════════════════
  NEW: WalkContext (parent, scope flags)
  Backward-compatible API
  ──────────────────────────────────────────────
  → Verify: G1 + G2 + G3
  → Коммит: refactor(bt-ir): walker context for parent/scope tracking
```

---

## 6. Карта зависимостей

```
B3 (exhaustiveness) ─── независимая, НО нужна ПЕРВОЙ
│                       (последующие волны могут менять switch-и)
│
B4 + PassContext ─── зависит от B3? Нет. Независимая.
│                    Но если PassContext добавит новый IR — B3 поймает.
│
B1 (pendingStatements) ─── самая тяжёлая волна
│                          Независима от B4, но проще делать ПОСЛЕ B3
│                          (exhaustiveness ловит пропущенные cases)
│
C10 + B5 (cleanup) ─── независимы от B1
│                       Но B5 может конфликтовать если делать параллельно с B1
│                       (visitClassDeclaration использует pendingStatements)
│                       → Делать ПОСЛЕ B1 если B1 полный, или ДО если B1 = withPendingScope
│
Walker context ─── полностью независимая от остальных
                   Но полезнее ПОСЛЕ B3 (exhaustiveness в walker)
```

**Оптимальный порядок:** B3 → B4+PassContext → B1 → C10+B5 → WalkContext

Если B1 оказывается слишком объёмной (ExpressionResult вариант), допустим порядок:
B3 → B4+PassContext → C10+B5 → B1 (withPendingScope) → WalkContext

---

## 7. Критерии завершения gen-3

**Обязательные (волны 0–3):**

- [ ] Exhaustiveness checks в walker + emitter (новый IR node = compile error)
- [ ] `IRPass.dependsOn` определён и валидируется
- [ ] `PassContext.diagnostics` — passes пушат диагностики нативно
- [ ] break/continue detection через диагностики (не throw)
- [ ] pendingStatements — явный контракт (ExpressionResult или withPendingScope)
- [ ] 0 мест с implicit flush
- [ ] `assignToAccess()` helper — нет дублирования в assignment logic
- [ ] `visitClassDeclaration()` < 50 строк координации
- [ ] Все тесты проходят (`pnpm run test`)
- [ ] `node tests/diff-builds.js` — нет неожиданных расхождений
- [ ] ROADMAP.md обновлён

**Опциональные (волна 4):**

- [ ] `WalkContext` с parent/scope tracking
- [ ] Backward-compatible walker API

---

## 8. Риски

| Риск                                                | Вероятность | Mitigation                                                   |
| --------------------------------------------------- | ----------- | ------------------------------------------------------------ |
| B1 (pendingStatements) слишком объёмный             | Средняя     | Fallback на `withPendingScope` — менее чистый, но safe       |
| B5 конфликтует с B1 (оба меняют declarations.ts)    | Средняя     | Делать B5 ПОСЛЕ B1; или B5 первой если B1 = withPendingScope |
| Exhaustiveness ломает компиляцию (новые leaf cases) | Ожидаемо    | Нужно добавить все leaf cases перед default → assertNever    |
| PassContext breaking change для pass API            | Низкая      | Только 2 pass-а, оба внутренние, не public API               |

---

## 9. Что это даёт для будущих gen

After gen-3, реализация фич становится **изолированной и безопасной**:

| Фича (gen-4+)              | Что было бы нужно                                               |
| -------------------------- | --------------------------------------------------------------- |
| Computed object keys       | Только `literals.ts`: new lowering + `ExpressionResult.hoisted` |
| Destructured parameters    | Только `function-helpers.ts` + `scope-analyzer.ts`              |
| break/continue try-finally | Только `try-finally-desugar.ts` + push diagnostic               |
| Private class fields       | Только `buildConstructor()` + exhaustiveness подскажет          |
| Boolean optimization pass  | Использовать `WalkContext` для scope-aware transforms           |
| Новый IR node type         | TS compile error в 4 местах → нельзя забыть                     |

---

## 10. Что остаётся для gen-4+

| ID    | Задача                         | Триггер / когда делать                                 |
| ----- | ------------------------------ | ------------------------------------------------------ |
| P-005 | Computed object keys           | Первый после gen-3 (простая фича на новой архитектуре) |
| P-006 | Destructured parameters        | После P-005 (более сложная)                            |
| P-007 | break/continue try-finally     | После PassContext ready                                |
| P-004 | Boolean optimization           | После WalkContext (type-aware pass)                    |
| C6    | Source maps                    | Отдельный проект                                       |
| C7    | Generic platform type dispatch | При добавлении новых platform types                    |
| B6    | isXmlRelatedType caching       | Если bottleneck на больших файлах                      |
