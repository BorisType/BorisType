> Исторический материал из `plans/ts-bs-semantics/tasks/F-02-expression-baseline.md` (baseline `8ff2739`).
> Статусы, команды и утверждения ниже относятся к описанному этапу; актуальные входы — [refs](../../../README.md).

# F-02a: named expression baseline

Status: **done для первого expression среза**, не для всех R01–R29.
Depends on: F-01 scoped audit. Research:
[E-01](../research/01-expression-evaluation-results.md).
Result: [2026-10-08](../results/2026-10-08-expression-baseline.md).

Закрыт как [research/test checkpoint 2026-11-05](../results/2026-11-05-research-checkpoint.md).
Развитие script/module отложено до решения стратегии памяти; текущие тесты,
prototypes и реализации сохраняются. Это завершение исследовательского leaf,
а не исправление обнаруженных miscompilations.

## Scope

23 named strict-valid TS probes; script/module + два bare controls. Node source
oracle и supplied BS output execution раздельны. Raw/final IR, output/source/
oracle hashes, diagnostics/cost manifest в ignored build. Private runtime не копируется.

Strict default failures exit 1; `--baseline` проверяет только 38 exact known
mismatches. XPASS, changed mismatch, compiler/adapter/load/runtime error и timeout
не могут стать successful baseline. Unknown/incomplete/zero selection rejected.
Worker isolation/watchdog проверяется намеренным synchronous hang без BS runtime.

## Acceptance

- [x] R01–R03 baseline failures + positive controls reproduced.
- [x] Immutable expected/actual/finding per case/mode, не blanket skip.
- [x] Nonzero counts/failure exit; unsafe comma-update AST invariant.
- [x] Source/oracle/raw IR/final IR/generated output + execution manifest.
- [x] Synchronous hang watchdog и worker-load failure tests.
- [x] Existing build/unit/E2E/abrupt gates повторены.
- [ ] Все остальные findings перенесены — это следующий F-02 scope, не этот leaf.

## Отложенные leaf tasks после memory strategy и design discussion

1. **E-03a, on hold:** explicit declarations/execution/value primitive + один
   initializer/return consumer; pure path identity, stable early snapshots,
   metadata preservation. Не меняет descriptor ABI или whole visitor разом.
2. **E-04a, on hold:** branch/optional/logical producer migration; r01 + nested
   key/object-method setup/throws. Не закрывается одними constant RHS tests.
3. **E-05a, on hold:** ordered callee/args и get-before-RHS Reference boundary.
4. **E-06a, on hold:** while test plan; затем отдельные do/for/continue/finalizer tasks.
5. **E-07a, on hold:** parameter phase; отдельно literal/multi-decl/switch consumers.

Эти implementation tasks не spec-ready: сначала разрешить memory blocker,
принять draft E-02/ADR и получить необходимые C capability results.
Текущий PR не начинает следующую волну research или production lowering.
