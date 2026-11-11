---
name: boristype-compiler-development
description: Use when changing BorisType TS-to-BorisScript lowering, IR passes, emitter, or compiler regression cases in a BorisType checkout.
---

# BorisType compiler changes

This is a checkout-local workflow. Paths below are relative to this skill;
run commands from the repository root. For platform/API knowledge use the
appropriate platform references instead.

Read [compiler entry](../../../refs/compiler/README.md) for implementation routes
and reasons, then [verification](../../../refs/compiler/verification.md) for
prerequisites and the meaning of each gate.

For the change at hand:

- Establish observable semantics: effect order/count, lazy branches, throw timing,
  control targets, and repeated loop conditions as relevant. Inspect generated BS
  and its cost: successful compilation is insufficient on the target parser/runtime.
- Choose lowering when TS syntax or TypeChecker is needed; choose a pass for an
  existing-IR rewrite. Check both pipeline entrypoints and ordering dependencies.
  Use mode properties in `ctx.config`, source locations, builders and shared
  bindings; captured names may be renamed. The compiler entry explains these traps.
- Add focused output/diagnostic or executable regression coverage for the defect.
  Botest cases use ambient `botest`, register the compiled `.test.js` name in the
  suite's `_suite.json`, and finish with `botest.assertOk()` (which throws a success
  sentinel). Missing registration silently excludes a case. Descriptive assertion
  messages help diagnosis; uniqueness is not a protocol requirement.
- Select gates from verification. Botest needs separately supplied runtime and a
  prior build; inspect nonzero execution counts. An unknown filter can report no
  failures while running nothing. Node tests, JS BorisScript, managed and native C
  evidence establish different things. A known-XFAIL baseline preserves failures.
- Keep bare as the active development mode. Preserve script/module implementations,
  defaults and regression checks; the memory freeze requires a separate strategy
  before extending their ABI or dependent mechanisms. A new native run needs its
  own bounded setup; old crash/hang probes are not ordinary regression commands.

Record an important changed decision or disproved assumption with its evidence in
`refs/`; public behavior changes also update `docs/` or package contracts.
[Development guide](../../../refs/development.md) explains the distinction.
