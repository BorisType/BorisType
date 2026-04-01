# 011. BT-IR Multi-Pass Refactoring

**Date:** 2026-03-14  
**Status:** Accepted

## Context

BT-IR до рефакторинга имел проблемы:

1. **File bloat** — expressions.ts ~1950 строк, statements.ts ~1750, bt-emitter ~1100
2. **Code duplication** — 5 паттернов дублировались в 3–6 местах (per-call env, method calls, hoisting)
3. **Architectural limitations** — single lowering pass смешивал concerns; try-finally desugaring и hoisting были встроены в lowering/emitter; 200+ проверок `ctx.mode`

Требовался итеративный рефакторинг для maintainability и расширяемости без изменения выходного кода.

## Decision

### Phase 1: Extract & Split

1. **Shared helpers** — `function-helpers.ts` (createPerCallEnv, extractFunctionParams), `call-helpers.ts` (createMethodCall)
2. **Split expressions.ts** → `expressions/` (index, operators, calls, literals, functions, module-access)
3. **Split statements.ts** → `statements/` (index, dispatch, declarations, control-flow, loops, blocks)
4. **Split bt-emitter** → `emitter/` (bt-emitter, emit-helpers, emit-statements, emit-expressions, emit-polyfills, emit-hoisting)

**Отклонения от плана:**

- `resolveHoistingTarget` не выделен — слишком мелкая абстракция
- `createSuperCall` не выделен — super-логика компактна и контекстно-зависима
- Добавлены module-access.ts, dispatch.ts, emit-helpers.ts, emit-hoisting.ts — по необходимости

### Phase 2: Multi-Pass IR Architecture

1. **Pass infrastructure** — `passes/types.ts` (IRPass), `passes/walker.ts` (mapStatements, mapExpression, forEachStatement), `passes/index.ts` (runPasses)
2. **Try-finally desugar pass** — вынесен из control-flow.ts, работает на IR
3. **Hoist pass** — вынесен из emitter, трансформирует IR (VarDecl → assignments, function hoisting)
4. **Pipeline** — `runPasses(ir, [tryFinallyDesugarPass, hoistPass])` между lowering и emit

**Отклонения:**

- PassContext не создан — оба pass работают без shared context
- Env setup pass пропущен — createPerCallEnv достаточно чист

### Phase 3: Mode System

1. **ModeConfig** — типизированный объект с boolean флагами вместо `ctx.mode === "bare"`
2. **Замена проверок** — все 58 проверок `ctx.mode` → `ctx.config.wrapPropertyAccess` и т.д.
3. **Bare-visitors** — оставлены как fast-path, dispatch через `!ctx.config.useEnvDescPattern`

**Отклонения:**

- `hoistFunctions` флаг не создан — управляется через IRProgram.noHoist
- `moduleWrapper` → `moduleExports` — точнее описывает семантику
- Bare-visitors не merged — увеличило бы complexity без выигрыша

## Consequences

### Плюсы

- Файлы управляемого размера (макс 665 строк)
- Устранено дублирование (createPerCallEnv, createMethodCall)
- IR passes — расширяемая инфраструктура для будущих трансформаций
- Emitter упрощён (−488 строк), circular dependency устранена
- ModeConfig — самодокументирующиеся флаги, типизация
- Output byte-identical (138/138 файлов SHA256)

### Минусы

- declarations.ts остаётся крупным (665 строк)
- Walker 532 строки — пропорционален IR, но больше ожидаемого
- mode field в VisitorContext остаётся (обратная совместимость)

### Правила для разработчиков

- **Lowering** — для TS AST → IR (новые языковые конструкции)
- **Pass** — для IR → IR (трансформации существующих узлов)
- **ModeConfig** — для режим-зависимого поведения, не ctx.mode

## Alternatives Considered

### Merge bare-visitors в main visitors

Отвергнуто: bare mode — принципиально другая трансляция (plain params vs env/desc). Merge удвоил бы cyclomatic complexity.

### PassContext с первого дня

Отвергнуто: YAGNI. Текущие passes не требуют shared state. Добавить при появлении use case.

### Env setup как pass

Отложено: createPerCallEnv из Phase 1 достаточно чист. Pass добавил бы complexity без пропорционального выигрыша.

## References

- [Plan](ref/temp/plan.md)
- [Phase 1 Results](ref/temp/phase-1-results.md)
- [Phase 2 Results](ref/temp/phase-2-results.md)
- [Phase 3 Results](ref/temp/phase-3-results.md)
- [Plan vs Implementation Review](ref/temp/plan-vs-implementation-review.md)
- [Lowering vs Pass Guide](ref/algorithms/bt-ir-lowering-vs-pass.md)
