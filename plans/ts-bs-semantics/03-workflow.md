# L2–L5. Протокол исследования и исправления одной фичи

## Единица работы

Feature family — контейнер, не размер одного PR. Например, functions делится
на parameter defaults, rest, lexical this, arguments, callable representations
и captures. Один leaf task имеет проверяемый инвариант и ограниченный diff.

Для каждого leaf пройти последовательность:

1. **Research.** Сопоставить source semantics, analyzer, lowering, IR passes,
   emitter, helper и native runtime. Найти минимальный counterexample и positive
   control, определить точный слой потери семантики.
2. **Alternatives.** Сравнить хотя бы два реальных варианта, если есть design choice.
   Оценить correctness, interaction risks, generated shape, helper calls,
   allocations/copies, JS/C compatibility и migration complexity.
3. **Spec.** Записать правила с IDs, modes, explicit boundaries, expected traces,
   diagnostics и acceptance criteria. Не объявлять найденный actual правильным expected.
4. **Tests.** Добавить permanent reproduction и минимальный проверочный runner.
   На baseline показать failure в нужном слое. Нельзя оставлять общий CI красным:
   до fix использовать отдельный research runner с явным fail/xfail manifest;
   после fix case становится обязательным regression test.
5. **Implementation.** Выполнить одну небольшую задачу, сохраняя runtime bootstrapping,
   source locations, shared name hygiene и pass invariants.
6. **Integration.** Проверить ближайшие consumers и combinations с loops,
   closures, finalizers, exceptions, optional chaining и module ABI.
7. **Acceptance.** Повторить gates на новом output, получить нужные C results,
   записать стоимость/ограничения и обновить публичную документацию.

## Статусы — не проценты готовности

`queued → researching → spec-ready → tests-ready → implementing → validating → done`.

Дополнительно: `needs-decision`, `awaiting-c`, `deferred`. Они не равны `done`.
Research completion, локальный fix и portable acceptance — разные события.
Пока C run не выполнен, писать «JS-verified, C pending», а не «совместимо с обеими».

Evidence labels в findings:

- `observed`: воспроизведено в surface-аудите на указанном runtime/mode;
- `documented`: известный случай из reference/предыдущих работ, надо перенести/перепроверить;
- `code-only`: подозрение по реализации, runtime reproduction ещё отсутствует;
- `unknown`: конкретное свойство не исследовано;
- `fixed`: regression tests и result manifest привязаны к проверенному commit.

Одного surface observation недостаточно для архитектурной гарантии. Буквальный
source, expected, actual и output нужно повторно сохранить в `F-02`.

## Решения и эскалация

- Очевидный localized fix не требует искусственного большого ADR; достаточно
  контракта, причины и проверок. Если меняется shared lowering или ABI — ADR нужен.
- Перед реализацией спорного варианта представить рекомендацию и trade-offs.
  Не выбирать молча существенную потерю JS semantics ради короткого output.
- Отклонять недостижимые/ещё не поддержанные формы явно, с range diagnostics,
  но не закрывать feature request таким rejection без согласованного изменения scope.
- Если fix требует новых host APIs, прав на runtime, изменения платформы,
  breaking deployment или отдельного numeric contract — зафиксировать выбор,
  спросить направление; остальные независимые tasks могут продолжаться.
- Не считать C gate блокирующим research/tests/output review; он блокирует
  утверждение portable acceptance, когда изменённая форма требует нового C evidence.

## Правила маленького diff

- Scope: один contract slice + прямо зависимые consumers/tests/docs.
- Сначала baseline counterexample, затем изменение механизма, затем migration
  одного consumer и его interactions. Не менять все visitors одним PR.
- Runtime library компилируется через bare: проверить bootstrap до использования
  helper, который сам зависит от нового lowering. Не создавать рекурсивную зависимость.
- Не оптимизировать эффектные expressions перестановкой или повторной оценкой.
- Не применять helper/IIFE/CPS ко всему output ради одного сложного случая.
- Использовать IR builders, immutable rewrites и общий BindingManager.
- При изменении IR node: пройти walker, collector, emitter, validation, все passes
  и source-loc/control-target preservation. Одного нового case в emitter недостаточно.
- При изменении runtime ABI: определить compiler/runtime version coupling,
  upgrade order, совместимость со старыми artifacts и возможность rollback.

## Definition of done

- [ ] Все acceptance rules имеют traceable tests; baseline failure и fix описаны.
- [ ] Пройден JS differential либо явно выделенный platform-contract test.
- [ ] Output разобран/проверен, invariants сохранены, unintended repeats отсутствуют.
- [ ] Modes проверены раздельно; documented unsupported modes дают согласованный Error.
- [ ] Ближайшие cross-feature tests и existing abrupt gate прошли.
- [ ] Нужный независимый C run получен или задача честно остаётся `awaiting-c`.
- [ ] Cost report содержит structural counts и необходимые runtime measurements.
- [ ] Обновлены relevant reference, package README, ROADMAP, ADR при design change.
- [ ] Remaining unknowns/deferred work вынесены в backlog; нет скрытого blanket skip.

Конкретная implementation task может закончиться раньше feature family, но не
должна переносить статус своего узкого успешного case на всю семантику фичи.
