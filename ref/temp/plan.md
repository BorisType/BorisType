# Plan: BT-IR Refactoring — Multi-pass Architecture

## TL;DR

Iterative refactoring of bt-ir from a monolithic single-pass lowering into a maintainable multi-pass pipeline. Phase 1 eliminates code duplication and splits bloated files. Phase 2 introduces IR→IR transformation passes. Phase 3 replaces scattered mode checks with a configuration object.

---

## Current State (Problems)

### File bloat

| File           | Lines | Status     |
| -------------- | ----- | ---------- |
| expressions.ts | ~1950 | Critical   |
| statements.ts  | ~1750 | Critical   |
| bt-emitter.ts  | ~1100 | High       |
| ir/nodes.ts    | ~890  | Acceptable |
| ir/builders.ts | ~600  | Acceptable |

### Code duplication (5 major patterns)

1. **Per-call env setup** — 5 locations, ~20 LOC each (statements.ts L342-382, L759-771; expressions.ts L1392-1433, L1711-1750, L1805-1840)
2. **Function parameter extraction** — 4 locations, ~12 LOC each
3. **Method call variants** — 6 combinations × 30+ LOC (obj.m(), obj?.m(), obj.m?.(), obj?.m?.(), + computed property variants)
4. **Hoisting decision logic** — 3 locations: module→hoistedFunctions, script-nested→pendingStatements.unshift, script-top→hoistedFunctions
5. **Helper descriptor setup** — visitor.ts L231-270 duplicates buildFunction pattern

### Architectural limitations

- Single lowering pass mixes concerns: hoisting + env setup + try-finally desugaring + mode branching
- transformReturns is a recursive IR→IR mini-pass already existing inside visitTryStatement
- No way to add IR-level transformations without touching lowering code
- 200+ scattered `ctx.mode === "bare"` checks

---

## Phase 1: Maintainability (Extract & Split)

**Goal:** Reduce file sizes, eliminate duplication, keep output identical.

### Step 1.1: Extract shared helpers from lowering

Create `packages/bt-ir/src/lowering/function-helpers.ts`:

- `createPerCallEnv(scope, params, bindings, ctx)` → returns `{ envName, setupStatements }` — consolidates 5 duplicated blocks
- `extractFunctionParams(tsParams, scope, ctx)` → returns `IRFunctionParam[]` — consolidates 4 duplicated blocks
- `resolveHoistingTarget(ctx)` → returns `"hoisted" | "pending"` with the correct array reference — consolidates 3 decision points

**Files modified:** `statements.ts`, `expressions.ts` (replace inline code with helper calls)
**Reference:** Current per-call env at statements.ts L342-382 as canonical implementation

### Step 1.2: Extract method call handler

Create `packages/bt-ir/src/lowering/call-helpers.ts`:

- `createMethodCall({ object, property, args, objectOptional, callOptional, ctx })` — unifies 6 variants of property-based call expressions
- `createSuperCall(args, superContext, ctx)` / `createSuperMethodCall(method, args, superContext, ctx)` — extracts super-specific logic

**Files modified:** `expressions.ts` visitCallExpression (reduces from ~340 to ~100 lines)

### Step 1.3: Split expressions.ts (Approach C from REFACTORING.md)

```
lowering/
├── expressions/
│   ├── index.ts        — re-exports + visitExpression dispatcher
│   ├── operators.ts    — visitBinaryExpression, visitPrefixUnary, visitPostfixUnary
│   ├── calls.ts        — visitCallExpression, visitNewExpression (uses call-helpers)
│   ├── literals.ts     — visitObjectLiteral, visitArrayLiteral, visitIdentifier
│   └── functions.ts    — visitArrowFunction, visitFunctionExpression
```

Target: each file 200-400 lines.

### Step 1.4: Split statements.ts

```
lowering/
├── statements/
│   ├── index.ts           — re-exports + visitStatement dispatcher
│   ├── declarations.ts    — visitFunctionDeclaration, visitVariableStatement, visitImportDeclaration
│   ├── control-flow.ts    — visitIfStatement, visitSwitchStatement, visitTryStatement
│   ├── loops.ts           — visitForStatement, visitForInStatement, visitForOfStatement, visitWhile, visitDoWhile
│   └── blocks.ts          — visitBlock, visitStatementList, visitStatementAsBlock, visitReturnStatement
```

### Step 1.5: Split bt-emitter.ts

```
emitter/
├── index.ts           — re-exports emit()
├── bt-emitter.ts      — main emit() + emitProgram dispatcher (~200 lines)
├── emit-statements.ts — emitStatement, emitStatementHoisted, hoisting logic
├── emit-expressions.ts — emitExpression and all expression emitters
├── emit-polyfills.ts  — polyfill emission logic (uses polyfill-spec)
```

### Step 1.6: Verify

- Run `npm run build` in bt-ir
- Run full test suite (`botest`)
- Compare output of a few sample files before/after to confirm byte-identical output

---

## Phase 2: Multi-pass IR Architecture

**Goal:** Introduce IR→IR transformation pipeline after initial lowering.

### Step 2.1: Define pass infrastructure

Create `packages/bt-ir/src/passes/`:

```
passes/
├── index.ts           — PassManager, runPasses()
├── types.ts           — IRPass interface, PassContext
└── walker.ts          — Generic IR tree walker/transformer utilities
```

**IRPass interface:**

```typescript
interface IRPass {
  name: string;
  run(program: IRProgram, context: PassContext): IRProgram;
}
```

**PassContext** holds shared state: bindings, scopeAnalysis, mode config, diagnostics.

**walker.ts** provides:

- `walkStatements(stmts, visitor)` — iterates statements, allows replace/insert/remove
- `walkExpressions(expr, visitor)` — iterates expressions recursively
- `transformStatements(stmts, fn)` — map-like transform with insert/delete support

This replaces ad-hoc recursive traversals like `transformReturns*`.

### Step 2.2: Extract try-finally desugaring into pass

Create `packages/bt-ir/src/passes/try-finally-desugar.ts`:

- Move `desugarTryFinally` + `transformReturns*` functions from statements.ts
- Works on IR level: finds `IRTryStatement` with finalizer → applies state machine desugaring
- Runs after initial lowering

**Benefit:** Removes ~200 lines from statements.ts, transformReturns\* becomes a proper IR walker instead of tangled recursion.

### Step 2.3: Extract hoisting into pass

Create `packages/bt-ir/src/passes/hoist.ts`:

- Move variable hoisting logic from emitter (collectVariableNames, emitStatementHoisted)
- Transforms `IRVariableDeclaration` → moves declarations to top, replaces with assignments
- Handles function hoisting (move IRFunctionDeclaration to top of scope)

**Benefit:** Emitter becomes a thin IR→text serializer. Hoisting is explicit in IR.

### Step 2.4: Extract env/desc setup into pass (optional, can defer)

Create `packages/bt-ir/src/passes/env-setup.ts`:

- Post-process: find functions lacking env setup → insert per-call env statements
- This is more complex and may not be worth extracting if the helper from Step 1.1 is clean enough

**Decision:** Evaluate after Step 2.3. If the per-call env helper from Phase 1 is clean, this pass may be unnecessary overhead.

### Step 2.5: Update pipeline

Modify `packages/bt-ir/src/pipeline/index.ts`:

```
TS Source → Scope Analyzer → IR Lowering → [Pass 1: TryFinally] → [Pass 2: Hoist] → BT Emitter → BS Output
```

Pipeline becomes configurable — passes are registered and run in order.

### Step 2.6: Verify

- Same approach as Phase 1 — output should be identical (or acceptably changed where hoisting order differs)
- All botest tests should pass

---

## Phase 3: Mode System Refactoring

**Goal:** Replace 200+ scattered mode checks with a configuration object.

### Step 3.1: Define ModeConfig

Create `packages/bt-ir/src/lowering/mode-config.ts`:

```typescript
interface ModeConfig {
  wrapPropertyAccess: boolean; // bt.getProperty vs direct .prop
  wrapCallExpression: boolean; // bt.callFunction vs direct ()
  wrapSetProperty: boolean; // bt.setProperty vs direct =
  useEnvDescPattern: boolean; // __env/__args/__this signature
  usePolyfills: boolean; // Array.map → bt.polyfill.Array.map
  hoistFunctions: boolean; // hoist to top
  moduleWrapper: boolean; // wrap in __init()
  useBtIsTrue: boolean; // bt.isTrue for boolean coercion
}

const BARE_CONFIG: ModeConfig = {
  wrapPropertyAccess: false,
  wrapCallExpression: false,
  wrapSetProperty: false,
  useEnvDescPattern: false,
  usePolyfills: false,
  hoistFunctions: false,
  moduleWrapper: false,
  useBtIsTrue: false,
};

const SCRIPT_CONFIG: ModeConfig = {
  wrapPropertyAccess: true,
  wrapCallExpression: true,
  wrapSetProperty: true,
  useEnvDescPattern: true,
  usePolyfills: true,
  hoistFunctions: true,
  moduleWrapper: false,
  useBtIsTrue: true,
};

const MODULE_CONFIG: ModeConfig = {
  ...SCRIPT_CONFIG,
  moduleWrapper: true,
};
```

### Step 3.2: Replace scattered checks

Replace `ctx.mode === "bare"` → `ctx.config.wrapPropertyAccess` (or relevant flag).
Add `config: ModeConfig` to VisitorContext.

### Step 3.3: Merge bare-visitors

With config flags, bare-visitors.ts logic can be merged back into main visitors with config-driven branching. Each visitor checks `ctx.config.useEnvDescPattern` instead of `ctx.mode === "bare"`.

**Or** keep bare-visitors.ts as fast-path for fully bare mode — decision point after evaluation.

### Step 3.4: Verify

- Test all 3 modes explicitly
- Ensure bare mode output unchanged
- Ensure script/module output unchanged

---

## Relevant Files

### Modified (Phase 1)

- `packages/bt-ir/src/lowering/statements.ts` — split into statements/ directory
- `packages/bt-ir/src/lowering/expressions.ts` — split into expressions/ directory
- `packages/bt-ir/src/emitter/bt-emitter.ts` — split into multiple emitter files
- `packages/bt-ir/src/lowering/visitor.ts` — update imports
- `packages/bt-ir/src/lowering/index.ts` — update exports

### Created (Phase 1)

- `packages/bt-ir/src/lowering/function-helpers.ts` — createPerCallEnv, extractFunctionParams, resolveHoistingTarget
- `packages/bt-ir/src/lowering/call-helpers.ts` — createMethodCall, createSuperCall
- `packages/bt-ir/src/lowering/expressions/` directory (4 files)
- `packages/bt-ir/src/lowering/statements/` directory (4 files)
- `packages/bt-ir/src/emitter/emit-statements.ts`, `emit-expressions.ts`, `emit-polyfills.ts`

### Created (Phase 2)

- `packages/bt-ir/src/passes/index.ts` — PassManager
- `packages/bt-ir/src/passes/types.ts` — IRPass interface
- `packages/bt-ir/src/passes/walker.ts` — generic IR walker
- `packages/bt-ir/src/passes/try-finally-desugar.ts`
- `packages/bt-ir/src/passes/hoist.ts`
- `packages/bt-ir/src/pipeline/index.ts` — updated pipeline

### Created (Phase 3)

- `packages/bt-ir/src/lowering/mode-config.ts`

---

## Verification (all phases)

1. `npm run build` in packages/bt-ir — TypeScript compiles
2. `npx turbo run build` from root — full monorepo builds
3. Run botest suite — all 14 suites pass
4. Compare output of examples/single and examples/multi before/after
5. CLI: compile a few .test.ts files and compare output manually

## Decisions

- **Iterative approach**: Phase 1 → 2 → 3, each phase is self-contained
- **Breaking changes acceptable** — tests may need updating after Phase 2 if hoisting order changes
- **Per-call env**: extract to helper first (Phase 1), evaluate IR pass later (Phase 2.4)
- **Bare mode**: keep bare-visitors.ts during Phase 1-2, evaluate merging in Phase 3
- **REFACTORING.md**: update after each phase with new state

## Further Considerations

1. **TypeInfo on IR nodes** (from technical document) — useful for future features (type-driven dispatch, generic instantiation) but NOT needed for current refactoring. Recommendation: separate initiative after Phase 3.
2. **IR Verifier** — basic integrity check for IR (parent/child consistency, required fields). Recommendation: add in Phase 2.1 alongside walker as debug utility.
3. **Source maps** — currently TODO in emitter. Multi-pass architecture doesn't block this. Recommendation: defer, not part of this refactoring.
