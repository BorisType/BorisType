# Приостановка развития script/module до решения стратегии памяти

**Date:** 2026-11-05

**Status:** Accepted

## Context

Пользователь сообщил об утечке циклических ссылок на C-платформе: управление
памятью основано на reference counting без сборщика циклов. Версия платформы и
численные измерения памяти не предоставлены; нового C memory probe в этом PR нет.
Поведение JS-интерпретатора не доказывает освобождение объектов на C.

В `packages/bt-ir/src/lowering/function-builder.ts` script/module descriptor
получает `env`, а при `registerInEnv` записывается в environment. Когда это один
environment, получается сильный цикл:

```text
environment.function → descriptor.env → environment
```

Такой цикл возможен без явного closure в исходнике. У object methods возможен
также путь `object.method → descriptor.obj → object`. Недостижимый граф с такими
связями не освобождается одним reference counting. Исправление порядка вычисления
само по себе эту проблему не решает.

## Decision

1. Завершить и опубликовать текущий F-02a/E-01 research/test checkpoint:
   [результат и проверки](../../plans/ts-bs-semantics/results/2026-11-05-research-checkpoint.md).
   Сохранить cases, exact XFAIL baseline, prototypes, cost analysis и draft spec.
2. До принятия стратегии памяти поддерживаемое направление развития — **bare**.
   Расширение script/module, их env/descriptor ABI и зависящих от него
   closures/classes/module/polyfill mechanisms приостановлено. Это относится и
   к запланированной миграции expression lowering для этих режимов.
3. Существующие реализации script/module, CLI/API modes, defaults и regression
   checks сохраняются. Эти режимы остаются доступны как экспериментальные;
   passing regression не означает memory acceptance на C. Новая разработка bare
   обязана сохранять существующие регрессии всех режимов.
4. Этот checkpoint не меняет compiler/runtime production code и не реализует
   автоматическую очистку. Документация явно различает реализованный режим,
   направление поддержки и проверенный subset.

## Условия возобновления

Нужно отдельно исследовать варианты и принять ownership/lifetime contract для
environment, descriptors, receivers, module cache и platform library handles.
Он должен покрывать escaping closures, recursion, method extraction, repeated
calls/module initialization, исключения и teardown. До возобновления необходимы:

- утверждённые spec/ADR и план совместимости ABI;
- доказанный способ предотвращения или освобождения сильных циклов без потери
  достижимых функций/объектов;
- ограниченные по времени C-проверки повторных allocation/release и удержания
  памяти с указанными версией платформы, setup и измерениями;
- семантические регрессии JS/C, включая время жизни escaping значений.

## Consequences

Сохраняются результаты исследования и работающий regression baseline; новая
сложность runtime не наращивается до решения lifetime. Исправление известных
script/module miscompilations откладывается, а не объявляется завершённым.
Bare не создаёт этот общий env/descriptor graph, но не гарантирует отсутствие
утечек: пользовательские циклы и platform handles требуют собственной дисциплины.
Default `module` и автоматический выбор `script` в btc пока сохраняются;
bare следует выбирать явно с учётом приоритета директив и типа файла.

## Alternatives Considered

- **Продолжить развитие и решить память позже.** Даёт новые возможности быстрее,
  но закрепляет ABI с неразрешённым lifetime и увеличивает стоимость переделки.
- **Удалить или запретить script/module сейчас.** Убирает возможность новых
  запусков, но теряет совместимость и полезный regression baseline; не соответствует
  согласованной границе работы.
- **Обнулять env/receiver автоматически при выходе из функции.** Локально просто,
  но разрушает escaping closures/методы и разделяемые environment; без lifetime
  contract такой обход нельзя считать корректным.
- **Weak references, explicit dispose, cycle collector или другой ABI.** Возможные
  предметы следующего исследования; доступность платформенных механизмов,
  семантика и стоимость ещё не установлены. Ни один вариант этим ADR не выбран.
