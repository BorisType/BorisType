# Компилятор: основания и маршруты

Активное направление — **bare**. Развитие script/module/env/descriptor ABI и
зависимых механизмов приостановлено до решения стратегии памяти C-runtime.
Существующие реализации, default `module` и регрессии сохранены. Bare не обещает
полную JS семантику, general closures или отсутствие пользовательских циклов.
[Публичные режимы](../../docs/reference/compile-modes.md),
[ограничения](../../docs/reference/borisscript-constraints.md).

| Вопрос                                                                        | Читать                                                          |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Где менять lowering/pass/emitter, какие entrypoints и invariants              | [Pipeline](pipeline.md)                                         |
| Почему выбран IR, helpers/ModeConfig, что отвергали gen-1/2/3                 | [Эволюция](evolution.md)                                        |
| Как устроены targets, labels/finalizers/catch и comma-update workaround       | [Control flow](control-flow.md)                                 |
| Какие старые findings fixed/confirmed/superseded/unverified, где reproduction | [Findings](findings.md)                                         |
| Какая судьба старых class/boolean/computed-key/type-info/object-sync идей     | [Proposals](proposals.md)                                       |
| Как проверять и что доказывают JS/C/output/cost gates                         | [Verification](verification.md)                                 |
| Почему expression baseline содержит 38 XFAIL и какой дизайн ещё не принят     | [Research checkpoint](../research/compiler-semantics/README.md) |

Существенные решения: [IR вместо transformers](../decisions/2026-02-23-ir-over-transformers.md),
[multi-pass](../decisions/2026-03-14-bt-ir-multi-pass-refactoring.md),
[structured completion](../decisions/2026-10-07-structured-abrupt-completion.md),
[safe updates](../decisions/2026-10-07-safe-for-updates.md),
[memory freeze](../decisions/2026-11-05-script-module-memory-freeze.md).
Source имеет больший вес, чем старый план; исторический result не новая acceptance.

Узкий checkout workflow — [compiler skill](../../.agents/skills/boristype-compiler-development/SKILL.md).
Конкретный долг — [TODO](../../TODO.md); детальные нерешённые semantic contracts —
[scope](../research/compiler-semantics/scope.md). Данные о Datex signatures и
runtime semantics сверяются по [правилам evidence](../development.md), а не по
одному article или TS declaration.
