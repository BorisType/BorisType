# L2. Точечные исследования

Создавать `NN-<feature>.md`. Не заполнять будущие исследования выдуманными
результатами. Первое направление: [brief](./01-expression-evaluation.md) и
[JS research results / design alternatives](./01-expression-evaluation-results.md).
Последний не accepted architecture; C results pending.

Текущий срез завершён как [checkpoint](../results/2026-11-05-research-checkpoint.md).
Дальнейшее развитие script/module приостановлено до принятия стратегии памяти;
сами исследования и runnable cases сохранены.

Минимальная структура завершённого исследования:

1. Task/finding IDs, commit/runtime identity, modes и выбранный subset.
2. Source semantics со ссылками на нужные ECMAScript/TypeScript правила.
3. Source → analyzer → lowering → IR passes → emitter → helper → native trace.
4. Literal минимальные reproductions, positive controls, actual output и results.
5. Raw native probes на JS/C, separating compiler/helper/platform causes.
6. Не менее двух реальных вариантов при design choice: correctness, output shape,
   runtime cost, scope/ABI, migration, unknowns и rejection boundaries.
7. Рекомендация; что ещё нужно проверить прежде чем принять дизайн.
8. Ссылки на spec и маленькие tasks, созданные после исследования.

Гипотезу маркировать `hypothesis`, shape estimate — `estimate`, runtime timing —
`measured` с environment. Исследование всей feature family не заменяет assessment
отдельных необычных forms: missing/undefined, captures, modifiers, optional boundaries.
