# Рефакторинг BT-IR (Phase 1–3)

**Статус:** Завершён (2026-03)

---

## Текущее состояние (после рефакторинга)

### Lowering

```
lowering/
├── visitor.ts           # Entry point, VisitorContext, transformToIR
├── mode-config.ts       # ModeConfig (bare/script/module flags)
├── statements/
│   ├── index.ts         # Re-exports
│   ├── dispatch.ts      # visitStatement dispatcher
│   ├── declarations.ts  # Functions, variables, imports, classes
│   ├── control-flow.ts  # if, switch, try-catch (без finally desugar)
│   ├── loops.ts         # for, for-in, for-of, while, do-while
│   └── blocks.ts        # Block, statement-as-block, return
├── expressions/
│   ├── index.ts         # Re-exports
│   ├── dispatch.ts      # visitExpression dispatcher
│   ├── operators.ts     # Binary, unary, logical
│   ├── calls.ts         # Call, new (с call-helpers)
│   ├── literals.ts      # Object, array, identifier, template
│   ├── functions.ts     # Arrow, function expression
│   └── module-access.ts # Property/element access, optional chaining
├── function-helpers.ts  # createPerCallEnv, extractFunctionParams
├── call-helpers.ts     # createMethodCall (6 вариантов)
├── function-builder.ts
├── env-resolution.ts
├── bare-visitors.ts    # Fast-path для bare mode
└── binding.ts
```

### Passes (IR → IR)

```
passes/
├── index.ts              # runPasses()
├── types.ts              # IRPass interface
├── walker.ts             # mapStatements, mapExpression, forEachStatement
├── try-finally-desugar.ts # State machine desugaring
└── hoist.ts              # Var/function hoisting
```

### Emitter

```
emitter/
├── bt-emitter.ts       # Entry: emit(), emitProgram()
├── emit-statements.ts  # Statement emitters
├── emit-expressions.ts # Expression emitters
├── emit-polyfills.ts   # Polyfill emission
└── emit-helpers.ts     # Context, indent, utils
```

---

## Pipeline

```
TS Source → Scope Analyzer → IR Lowering → [Try-Finally Desugar] → [Hoist] → BT Emitter → BS Output
```

---

## Ключевые решения

- **ModeConfig** — `ctx.config.*` вместо `ctx.mode === "bare"` (58 проверок заменены)
- **Bare-visitors** — оставлены как fast-path, dispatch через `!ctx.config.useEnvDescPattern`
- **PassContext** — не создан (YAGNI), оба pass работают без shared context
- **Env setup pass** — пропущен, createPerCallEnv достаточно чист

---

## Правила для разработчиков

- **Lowering** — для TS AST → IR (новые языковые конструкции)
- **Pass** — для IR → IR (трансформации существующих узлов)
- **ModeConfig** — для режим-зависимого поведения

См. [ref/algorithms/bt-ir-lowering-vs-pass.md](../../../ref/algorithms/bt-ir-lowering-vs-pass.md).

---

## История

| Фаза    | Дата       | Результат                                             |
| ------- | ---------- | ----------------------------------------------------- |
| Phase 1 | 2026-03-12 | Extract helpers, split expressions/statements/emitter |
| Phase 2 | 2026-03-13 | Multi-pass: try-finally, hoist; walker infrastructure |
| Phase 3 | 2026-03-13 | ModeConfig, замена ctx.mode проверок                  |

См. ref/temp/phase-\*-results.md, ref/decisions/011-bt-ir-multi-pass-refactoring.md.
