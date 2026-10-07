# L2. Точечные исследования

Создавать `NN-<feature>.md`. Не заполнять будущие исследования выдуманными
результатами. Сейчас есть только [первый brief](./01-expression-evaluation.md).

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
