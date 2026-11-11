# ADR 001: IR между TypeScript AST и BorisScript

Дата решения: 2026-02-23. Статус: архитектурный подход сохранён.
Текущее устройство и entrypoints описаны в [pipeline](../compiler/pipeline.md).

## Причина выбора

В ранней реализации языковые features обрабатывались последовательными AST
transformers. Их порядок и промежуточная форма дерева влияли на следующие
transformations. Scope/capture analysis, renaming и env patterns повторялись;
комбинация arrow, template literal и destructured parameter требовала согласования
нескольких мест. Промежуточный AST затруднял поиск источника неверного output.

Выбран единый scope analysis, lowering TS AST → собственный IR и отдельный emitter
IR → BS. Затем добавлены [IR passes](2026-03-14-bt-ir-multi-pass-refactoring.md).
BindingManager централизует физические имена; семантический IR можно исследовать
до печати. Это уменьшает связанность, но не устраняет зависимость от порядка passes
и не гарантирует корректность scope/effects автоматически.

## Альтернативы

- Координатор старых transformers или несколько проходов сохраняли разрозненный
  scope analysis и требовали дополнительных договорённостей о промежуточном AST.
- Babel preset всё равно требовал custom env/property/runtime semantics. Отказ
  относится к цене адаптации в этом проекте: AST transformers в принципе могут
  быть глобальными и не ограничены только локальными преобразованиями.
- Прямая печать TS AST → BS не убирала scope analysis и смешивала его с formatting.
- Интерпретация TS в Node не давала deployable BS для HCM; это другая цель.

## Цена и границы

Нужно поддерживать два представления, IR builders/walkers, passes и emitter.
IR облегчает анализ, но само его наличие не доказывает O(n) всего pipeline,
отсутствие дополнительных обходов, детерминизм или семантическую совместимость.
Старые заявления об идентичной семантике всех прежних проектов и датах релизов
не имели приложенной acceptance matrix и не используются как гарантия.

Авторитетный API пример находится в [README пакета](../../packages/bt-ir/README.md);
старый import из `bt-ir` и выдуманное `result.outputs[0]` удалены. Конкретные
контрпримеры — [findings](../compiler/findings.md). Incremental re-lowering,
optimizations и source maps были вариантами будущего развития, не обязательствами
этого решения. Развитие script/module приостановлено из-за lifetime.
