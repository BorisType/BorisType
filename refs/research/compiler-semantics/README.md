# Исследование TS → BS семантики

Завершённый research checkpoint, **не feature acceptance**. Развитие
script/module приостановлено до [стратегии памяти](../../decisions/2026-11-05-script-module-memory-freeze.md);
реализации/defaults/regressions сохранены. Активное направление — bare с
ограниченным native subset, без обещания general closures или полной JS semantics.

- [Expression evaluation](expression-evaluation.md): причина R01–R03/R29,
  producer/consumer audit, native parser survey, A/B/C/inline alternatives и costs.
- [Draft expression contract](expression-contract-draft.md): substantive rules
  ORDER/LAZY/THROW/FREQ/PHASE/SAFE; **не accepted**, implementation on hold.
- [Исследовательская область](scope.md): неполный F-01 inventory, downstream
  Reference/functions/loops/bindings/modules/classes/library вопросы и критерии.
- [Findings/reproductions](../../compiler/findings.md): R01–R29, K01–K11 и
  современная классификация старых reviews, включая ambient declarations.
- [2026-10-08 baseline](results/2026-10-08-expression-baseline.md) и
  [2026-11-05 checkpoint](results/2026-11-05-research-checkpoint.md): разные JS
  runtime hashes, команды/counts, C handoff, limits и результаты.

Первый срез: 23 strict-valid named TS cases / 48 mode comparisons — **38 exact
XFAIL и 10 PASS**. Baseline зелёный только при exact known mismatches; XPASS,
changed mismatch, errors, timeout и empty selection ошибочны. Strict runner
требует equivalence и остаётся красным на этих failures. Production lowering
этим исследованием не менялся. Все остальные R/K ещё не перенесены в этот catalog.

Prototypes — 24 sketches, 21 conforming/3 intentional A counterexamples.
Предварительная рекомендация **B + inline fast path**, не принятый дизайн.
Native JS survey — 6 MATCH/2 PARSER_REJECTION, C capability pending.
Два bounded C shape files имеют ожидаемый `OK:6/6`, но **C запусков нет**;
они не compiled production fix и не descriptor/module ABI acceptance.

## Откуда взялся baseline

Surface audit 2026-10-07: HEAD `57eaa89050f850eb426e971e5c8d338c87037cb6`,
compiler после PR #27 `fa493a2f69aaf2c48d284ff4224ace8983bbbbb`.
Recorded Node24.21.0/pnpm12.5.1/TS6.0.3 — исторические identity, актуальные pins
берутся из manifests. Supplied JS runtime был `/home/agent/workspace/main.js`,
ignored symlink `packages/botest/build/borisscript/main.js`, version unknown,
hash `8f999ef036db5b9d4ce9ce98b0d81709f7db265197919c2a337560fad56b5090`.
Botest adapter предоставляет часть host/file API, не полную платформу.

Surface audit recorded: 55 IR tests, 148 E2E/17 suites; advisory Node137 PASS,
1 FAIL,10 SKIP. Числовой failure `7603264645902515852` → Node Number
`7603264645902516000` позже выделен в platform-specific test (Nov5 report),
а не объявлен исправлением numeric lowering. Полный abrupt gate тогда не
повторялся самим surface audit: его исторический результат — 5760 comparisons.
Прежние in-memory seed findings не равны permanent suite.

Следующий expression baseline использовал commit `324c588` (merge #32).
Oct8/Nov5 reports сохраняют точные hashes библиотек/catalog/manifest и изменение
runtime identity; supplied runtime требуется предоставить отдельно. Files в
ignored build воспроизводятся runners, не обещаются как доступный git artifact.
C carrier `AB`/`012`, Check27Fixed и selected 60-case smoke относятся к отдельному
[control-flow evidence](../compiler-control-flow/2026-10-07-results.md), не к этим
expression sketches или class/module support.

## Как продолжать после решения памяти

Сначала принять design и один vertical slice, затем branch/ordered-call/loop/
parameter consumers с соответствующими interactions. Не восстанавливать потерянную
source semantics поздним parser pass; не обходить lowering bug изменением test
source; не заменять target execution запуском emitted BS в Node. Не начинать
whole-visitor rewrite или считать Error rejection реализацией requested feature.

[Verification](../../compiler/verification.md) задаёт evidence/JS/C/cost gates,
[scope](scope.md) сохраняет конкретные questions. Диагностическая защита, локальный
fix, исследовательский результат и portable acceptance — разные исходы; дата
исторического PASS не переносится на current output автоматически.
