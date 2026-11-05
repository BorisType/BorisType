# Structured abrupt completions for labels and finalizers

**Date:** 2026-10-07

**Status:** Accepted (C-runtime smoke passed, 2026-10-07)

## Context

Issue [#13](https://github.com/BorisType/BorisType/issues/13) requires labels with
ECMAScript control-flow behavior. BorisScript does not implement labels, and its
JS and C implementations disagree about native `finally`. The former
throw-sentinel pass let source catches intercept returns, lost exceptions while
evaluating a return expression, and rejected jumps crossing finalizers.

The supplied JS runtime is `/home/agent/workspace/main.js`. The user separately
confirmed on the C runtime that a native `break` through `try/catch` is not an
exception (`AB`), and that an explicit state carrier preserves nested-loop
continuation (`012`). These are carrier probes, not validation of the full pass.

## Decision

Replace the old pass with `abruptCompletionDesugarPass`. Keep its old export as
a deprecated alias, not a second implementation. Resolve lexical targets before
rewriting statements, reset targets at function boundaries, and preserve target
ids when lowering expands a `for...of` into a prelude and a native `for...in`.
Chained labels alias the same source target.

Use one completion record per affected executable:

| Type       | Value             | Target                      |
| ---------- | ----------------- | --------------------------- |
| 0 normal   | unused            | unused                      |
| 1 return   | returned value    | unused                      |
| 2 throw    | escaped exception | unused                      |
| 3 break    | unused            | numeric source target id    |
| 4 continue | unused            | numeric iteration target id |

Synthetic `while (true)` frames carry non-exceptional completions using native
`break`. Every frame has an unconditional exit. A loop consumes only its own
break/continue; switch consumes only its own break. Other completions propagate
out without running a skipped update, condition, case, or statement.

Real exceptions remain native exceptions. A return expression is evaluated
before setting RETURN. A native wrapper captures an escaped exception for a
finalizer. A throw bridge rethrows pending THROW before a source catch; that
catch clears stale completion state if its protected body can produce state.
No return, break, or continue is implemented by throwing a sentinel.

A finalizer that can produce completion state saves, resets, and restores the
outer record. Normal finalizer completion restores it; abrupt completion
replaces it. Unaffected finalizers keep the record without copying it. Local
native catches within such finalizers preserve the outer record; a source catch
recovering from a transformed region clears a completion superseded by the
real exception. Tests cover both cases explicitly.

Catch bindings get lexical scopes and unique physical catch parameters.
Captured bindings are copied into a fresh per-entry block environment before
user statements. Block references alone do not imply capture; function
boundaries do. Source names are reserved before allocation, including names
declared later. Catch destructuring currently receives BT90016; it must not
silently drop bindings. Annex B labelled functions receive BT90017.

### Proven fast paths

- No labels/finalizers: preserve the input IR identity.
- Unreferenced labels: erase them without a carrier.
- Returns crossing no source finalizer: keep native return.
- Unaffected complete loop/switch subtrees: keep native local jumps, even in
  an otherwise affected function. An outer synthetic frame cannot intercept
  jumps protected by those complete native boundaries.
- No stateful jumps: omit target storage.
- Finalizer without state-producing children: omit save/reset/restore.
- Direct frame exit or final statement: omit redundant propagation checks.
- Completion-free loop prefix: preserve native local jumps outside escape frames
  if their resolved target is the iteration and they cross no finalizer. This
  avoids stateful exits for conditions inserted by for-update normalization.

Mixed affected loop bodies still use conservative state for local jumps;
selective nearest-target optimization is deferred until its proof and tests
justify the extra compiler complexity.

The emitter rejects surviving labels, labelled jumps, native finalizers and
unnamed/missing catch handlers, as well as comma operators in for updates.
Generic walkers preserve source target metadata. The
[safe for-update pass](2026-10-07-safe-for-updates.md) runs before resolution.

## Verification

`pnpm --filter @boristype/bt-ir test` covers IR, resolution, scopes, output
invariants and fast paths. E2E fixtures live in `tests/src/labels` and
`tests/src/try-catch-finally`.

`pnpm test:semantic` is a strict differential gate: Node evaluates source
TypeScript; the supplied BorisScript interpreter evaluates output in bare,
script and real code-library module modes. The deterministic 5×5 override
matrix covers origins in try/catch/finalizer, six containers and depths 0–3,
plus targeted regressions. Traces and outcomes must match exactly. Failures
return nonzero and save standalone repros under `packages/bt-ir/build/semantic`.
This does not rely on botest's advisory `--node-check` exit status.

The same command produces a standalone C pack, `BtAbruptProbe.js`, with embedded
Node expectations and one `MESSAGE` result. Its independent C execution checks
the selected bare-mode smoke cases, separately from the full three-mode JS gate.
See `plans/probes/README.md`.

The first C attempt hung in check27 (compound for update), per the user. This is
consistent with a skipped increment, but not a verified diagnosis of C parser
internals. A selective IR normalization removes comma update headers. The gate
now includes 97 update-specific cases (22 regressions and 75 completion overrides),
for 1920 cases / 5760 three-mode comparisons; the C pack contains 60 cases.

On 2026-10-07 the user reported the corrected C executions:
`Check27Fixed.js` → `MESSAGE: 0FU1FU2FU|E`, then the full `BtAbruptProbe.js` →
`MESSAGE: OK: 60/60`. This completes the independent C smoke gate on the tested
platform (version not provided). The full 1920-case matrix and script/module
execution were verified on the supplied JS runtime, not independently on C.
No isolated C performance measurement or raw comma-parser diagnosis is implied.

The initial conservative matrix generated 17.86 MB (bare), 19.18 MB (script),
19.42 MB (module) for 1816 cases. Proven fast paths reduced output to 11.50 MB
(bare), 12.83 MB (script), 13.06 MB (module) for 1823 cases, roughly 35% less
including corrected output indentation and additional regressions. Measurements include parsing and
runtime setup; they are not isolated C performance benchmarks.

## Consequences and limits

Synchronous labelled control flow and finalizer override behavior share one
model, and source catches cannot observe non-exceptional carrier transitions.
Output grows structurally with affected regions rather than duplicating whole
continuations. State checks still cost more than native jumps on the platform.

This is not a general ECMAScript runtime. BorisScript converts arbitrary thrown
values to platform errors; original thrown-value identity is not recovered.
Async/generators, Annex B functions, general iterator closing, direct-eval
statement completion values, and pre-existing bare-mode closure limitations
are outside this feature. Catch binding patterns require explicit destructuring
inside the body until their own complete lowering is implemented.

## Alternatives considered

- Native labels: unsupported and can silently parse as unlabelled jumps.
- Throw sentinels: interact with catches and mutate platform errors; rejected.
- Function/IIFE wrapping: changes scope and function boundaries; adds calls and
  allocations on a slow runtime.
- Full CFG/state-machine dispatcher: general but larger and harder to inspect.
- Duplicating cleanup at each jump: grows output and makes nested override and
  exception semantics difficult to keep correct.

This supersedes [the throw-sentinel ADR](2026-03-11-try-finally-desugaring.md).
