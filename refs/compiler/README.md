# Компилятор: основания и маршруты

Текущий режим компиляции — `bare`.
[Правила выбора режима](../../docs/reference/compile-modes.md) и
[ограничения BorisScript](../../docs/reference/borisscript-constraints.md).

| Вопрос                                                                        | Читать                          |
| ----------------------------------------------------------------------------- | ------------------------------- |
| Где менять lowering/pass/emitter, какие entrypoints и invariants              | [Pipeline](pipeline.md)         |
| Почему выбран IR, helpers/ModeConfig, что отвергали gen-1/2/3                 | [Эволюция](evolution.md)        |
| Как устроены targets, labels/finalizers/catch и comma-update workaround       | [Control flow](control-flow.md) |
| Какие старые findings fixed/confirmed/superseded/unverified, где reproduction | [Findings](findings.md)         |
| Какая судьба старых class/boolean/computed-key/type-info/object-sync идей     | [Proposals](proposals.md)       |
| Как проверять и что доказывают JS/C/output/cost gates                         | [Verification](verification.md) |

Существенные решения: [IR вместо transformers](../decisions/2026-02-23-ir-over-transformers.md),
[multi-pass](../decisions/2026-03-14-bt-ir-multi-pass-refactoring.md),
[structured completion](../decisions/2026-10-07-structured-abrupt-completion.md),
[safe updates](../decisions/2026-10-07-safe-for-updates.md).
Source имеет больший вес, чем старый план; исторический result не новая acceptance.

Узкий checkout workflow — [compiler skill](../../.agents/skills/boristype-compiler-development/SKILL.md).
Конкретный долг ведётся в [TODO](../../TODO.md). Данные о Datex signatures и
runtime semantics сверяются по [правилам evidence](../development.md), а не по
одному article или TS declaration.

## Архив режимов

Реализации, регрессии и документация прежних режимов сохранены в
[архивной ветке](https://github.com/BorisType/BorisType/tree/archive/compiler-modes) на коммите `7a0b6a2`.
Режимы убраны из основной ветки до принятия контракта памяти и ABI для
C-runtime. В компиляторе остаются реестр режимов, общий pipeline и отдельные
lowering visitors. При добавлении режима с замыканиями и собственным ABI
потребуются правила времени жизни escaping values и проверка циклических
ссылок на целевой платформе.

- [Решение о памяти](https://github.com/BorisType/BorisType/blob/7a0b6a26a004f480f76fad9d534fedcde9f8aea7/refs/decisions/2026-11-05-script-module-memory-freeze.md)
- [Исследования выражений, результаты и воспроизведение](https://github.com/BorisType/BorisType/blob/7a0b6a26a004f480f76fad9d534fedcde9f8aea7/refs/research/compiler-semantics/README.md)
- [Реестр прежних находок](https://github.com/BorisType/BorisType/blob/7a0b6a26a004f480f76fad9d534fedcde9f8aea7/refs/compiler/findings.md)
