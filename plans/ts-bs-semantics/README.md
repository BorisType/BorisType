# TS → BS: исследование и восстановление семантики

Дата начала: 2026-10-07. Статус: план и предварительный реестр; реализация не начата.

Цель — максимально широкая достижимая JS-семантика через преобразования, с
предсказуемым и недорогим BorisScript output на **двух независимых runtime**.
Работа охватывает не только найденные контрпримеры, но и остальные ветки
реализованных преобразований и их взаимодействия.

Это рабочая папка, а не новый публичный language contract. Актуальный контракт
пользователя остаётся в [reference](../../docs/reference/borisscript-constraints.md).
Исторические ADR описывают намерения; проверенный output имеет больший вес.

## Навигация: от общего к частному

| Уровень             | Документ/каталог                                                             | Что должно появиться                                                                  |
| ------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| L0 — контекст       | [00-context.md](./00-context.md)                                             | Baseline, runtime identity, подтверждённые результаты и ограничения evidence          |
| L1 — карта          | [01-feature-map.md](./01-feature-map.md), [02-findings.md](./02-findings.md) | Полный реестр веток преобразований, находок и неизвестных областей                    |
| L2 — исследование   | [research/](./research/README.md)                                            | Причина, native probes, несколько вариантов эмуляции, плюсы/минусы/стоимость          |
| L3 — спецификация   | [specs/](./specs/README.md)                                                  | Нумерованные семантические правила, modes, output invariants, acceptance cases        |
| L4 — работа         | [tasks/](./tasks/README.md), [05-backlog.md](./05-backlog.md)                | Маленькие зависимые задачи: tests → implementation → integration                      |
| L5 — доказательства | [results/](./results/README.md)                                              | Результаты на конкретном commit и runtime, output review, стоимость, остаточные риски |

Процесс описан в [03-workflow.md](./03-workflow.md), проверки — в
[04-verification.md](./04-verification.md). Первое исследование подготовлено как
[brief по expression lowering](./research/01-expression-evaluation.md), не как
уже принятое архитектурное решение.

## Рекомендуемый маршрут

1. Зафиксировать существующие failures и научить проверочный запуск надёжно
   отличать pass, failure, отсутствие runtime и нулевую выборку. Для начала нужен
   небольшой runner, не законченная универсальная инфраструктура.
2. Исследовать **evaluation order / laziness / evaluation frequency**. Выбрать
   модель expression lowering и переносить на неё consumers небольшими шагами.
3. Стабилизировать **Reference semantics**: property reads/writes, compound/update,
   delete, calls и optional calls.
4. Проверить functions/scopes/parameters и loops/iteration; это основа корректных
   destructuring, classes и captured exports.
5. Довести templates, destructuring, spread, numeric/type erasure и parser safety.
   Независимые маленькие fixes допустимы раньше, если не закрепляют ошибочный core.
6. Довести module ABI/live bindings и class/prototype semantics.
7. Исследовать polyfills **по одному методу/семейству** и type-based dispatch.
   Мелкие независимые fixes допускаются раньше; стоимость проверяется во всех волнах.
8. Выполнить cross-feature матрицу, повторить JS/C gates и синхронизировать
   публичную документацию с фактически доказанным subset.

Diagnostics/source validation — сквозная работа во всех волнах. Новая поддержка
должна расширять subset. Временный Error diagnostic защищает от silent corruption,
но **не считается исправлением поддерживаемой фичи** и не закрывает её feature task.
Отказ от достижимой семантики либо изменение публичного ABI требуют отдельного решения.

## Зависимости

```text
baseline + воспроизводимые cases
              ↓
expression evaluation + безопасные имена
              ↓
references / calls / optional chains
              ↓
functions / scopes / parameters / loops
              ↓
destructuring / spread / modules / classes
              ↓
cross-feature validation + JS/C acceptance
```

Templates, numeric normalization, diagnostics и отдельные polyfills не обязаны
ждать всю цепочку: зависимости задаются для каждой задачи, а не только для папки.
Performance review сопровождает каждый шаг, не переносится в конец.

## Правила границ работы

- Не переписывать весь compiler заранее. Сохранять полезные analyzer/IR/pass/emitter
  abstractions; заменять механизм после исследования и сравнения вариантов.
- Не выводить поддержку C из JS result; не переносить bare smoke на script/module.
- Не заменять output execution сравнением generated JS, запущенного в Node.
- Не компенсировать lowering defect обходом в тестовом исходнике.
- Не публиковать supplied runtime и не смешивать планирование с runtime provisioning.
- Не начинать массовую миграцию callers до проверки одного vertical slice.
- Не пересобирать labels/finalizers с нуля без нового доказанного дефекта;
  PR #27 остаётся regression baseline.
- Не обещать доказательство всей ECMAScript для произвольных программ. Завершение
  измеряется конкретным inventory, контрактами и покрытыми interactions.

## Текущий прогресс

- [x] Поверхностный аудит и выборочные in-memory probes выполнены до создания папки.
- [x] Context, findings, feature map, workflow и backlog записаны.
- [x] Подготовлен brief первого точечного исследования.
- [ ] Все findings перенесены в постоянные executable cases и заново воспроизведены.
- [ ] L1 inventory сверено со всеми dispatch branches, modifiers и runtime exports.
- [ ] Выбран expression lowering design, зафиксированы ADR/spec и acceptance cases.
- [ ] Первый implementation slice завершён и проверен.
- [ ] Весь согласованный inventory прошёл итоговые gates.

## Первый рабочий пакет

Начать с `F-01` + `F-02` + `E-01`: перенести контрпримеры `R01–R03` в
воспроизводимый runner, исследовать pending-statements и сравнить варианты из
brief. Deliverable: отчёт, рекомендуемая модель, мини-spec и несколько маленьких
implementation tasks. Создание этой папки само по себе не запускает реализацию.
