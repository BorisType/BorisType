# ADR 010: Исторический throw-sentinel для finally

Дата решения: 2026-03-11. Статус: **заменено**
[structured abrupt completions](2026-10-07-structured-abrupt-completion.md).
Это объяснение отклонённого подхода, не инструкция для новой реализации.

## Почему появился подход

В двух BS implementations наблюдалось несовпадающее native finally поведение:
повтор catch вместо finalizer либо пропуск finalizer при normal completion.
Исходная запись не идентифицировала точные версии; это не проверка всех современных
платформ. От native finally решили отказаться в генерируемом коде.

Мартовская схема хранила тип и значение completion (`normal=0`, `return=1`,
`throw=2`; break/continue оставлялись на будущее). Return в try/catch превращался
в установку состояния и `throw` передаваемого значения. Внешний catch отличал
такой sentinel по state; finalizer выполнялся перед dispatch сохранённого результата.
Nested functions исключались из return rewriting. BindingManager выдавал names.

## Почему схема заменена

Sentinel является настоящим exception и может попасть в source catch. Установка
RETURN до вычисления return expression теряет реальное исключение при его вычислении.
Break/continue наружу могли пропустить inline finalizer. Обещание полной корректности
для normal/throw/return оказалось слишком сильным. Стоимость throw/catch на медленном
runtime также не была измерена; прежнее «незначительна» снято.

Октябрьская схема использует native break frames для неэксепционных completions,
настоящие exceptions оставляет исключениями и сохраняет lexical targets/finalizer
overrides. Подробные counterexamples, native carrier probes и выбранный алгоритм —
[control flow](../compiler/control-flow.md) и
[датированный результат](../research/compiler-control-flow/2026-10-07-results.md).

## Альтернативы на момент решения

- Boolean flag проще для одной ошибки, но плохо выражает разные abrupt completions.
- IIFE добавляет функцию и меняет scope/this/arguments; не переносит outer jumps.
- Guarding остатка тела по state требует глубокой перестройки. В марте его отвергли
  как сложное; позже structured carrier стал обоснованным направлением.
- IR pass тогда отложили из-за отсутствия infrastructure. В дальнейшем passes
  появились: это историческое обстоятельство, а не требование выполнять finally
  lowering только на TS AST.

Старое lint-предупреждение о break в try/finally объясняло временное ограничение,
но не заменяло correctness pass. Текущий контракт задаёт новое решение и проверки.
