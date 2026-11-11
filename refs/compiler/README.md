# Компилятор: основания и маршруты

Активное направление развития — **bare mode**. Существующие script/module и
их регрессии сохранены, но развитие env/descriptor ABI и зависимых механизмов
приостановлено до решения стратегии памяти. CLI всё ещё выбирает module по
умолчанию: [публичный статус режимов](../../docs/reference/compile-modes.md).
Bare не обещает полную JS-семантику или отсутствие пользовательских циклов.

## Где искать реализацию

```text
TS Program → scope analysis → TS AST lowering → IR passes → BS emitter
```

- [pipeline/index.ts](../../packages/bt-ir/src/pipeline/index.ts): `compile`,
  `compileSourceFile` и порядок passes. Проверять нужно оба entrypoint.
- [analyzer](../../packages/bt-ir/src/analyzer/): scopes и captures.
- [lowering](../../packages/bt-ir/src/lowering/): новая TS-конструкция или решение,
  которому нужны SourceFile/TypeChecker. Visitors разбиты на expressions/statements.
- [mode-config.ts](../../packages/bt-ir/src/lowering/mode-config.ts): независимые
  свойства режима. Для конкретного аспекта используй `ctx.config.*`.
- [ir](../../packages/bt-ir/src/ir/): узлы и builders. Names резервируются через
  [BindingManager](../../packages/bt-ir/src/lowering/binding.ts), включая source names.
- [passes](../../packages/bt-ir/src/passes/): преобразования уже существующего IR.
  Walker и порядок проходов важны для узлов, вводимых предшественниками.
- [emitter](../../packages/bt-ir/src/emitter/): текстовое представление output и
  проверка оставшихся небезопасных форм, а не место обычного TS lowering.
- [bt-cli/core](../../packages/bt-cli/src/core/): диагностика, сборка, linking/push.
  TypeScript создаёт Program/AST/TypeChecker; emit выполняет bt-ir, не tsc emitter.

## Почему сохранены эти механизмы

| Вопрос                                          | Решение и основание                                                                                                                                                                                                                                                 |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Почему IR вместо TS transformers                | [Исходное решение](../decisions/2026-02-23-ir-over-transformers.md); lowering и target rewrites имеют разные обязанности. Старое описание архитектуры — [исторический снимок](../archive/compiler/architecture/ir-pipeline.md), не точная карта текущих файлов.     |
| Почему lowering и passes разделены              | [Multi-pass decision](../decisions/2026-03-14-bt-ir-multi-pass-refactoring.md); TS-specific анализ остаётся в lowering, общие IR-преобразования проходят отдельно. [Старый разбор](../archive/compiler/algorithms/bt-ir-lowering-vs-pass.md) полезен как основание. |
| Почему finally и labels преобразуются вместе    | [Structured abrupt completions](../decisions/2026-10-07-structured-abrupt-completion.md). Старый throw-sentinel мог попадать в пользовательский catch и терял правильный порядок завершений; нативные finally различаются между runtime.                            |
| Почему compound for-update превращается в while | [Safe for updates](../decisions/2026-10-07-safe-for-updates.md). Наблюдалось зависание на C; обход сохраняет update/continue/finalizer timing. Внутренняя причина C-дефекта не установлена.                                                                         |
| Почему script/module on hold                    | [Memory freeze](../decisions/2026-11-05-script-module-memory-freeze.md). Descriptor/env и receiver graph могут образовывать сильные циклы; одного reference counting недостаточно. Автоматическое обнуление разрушает escaping значения.                            |

## Как изменить преобразование

Начни с наблюдаемого контракта и counterexample: порядок/count побочных эффектов,
ленивость ветвей, момент throw, повторение условий цикла и стоимость output.
Выбери lowering или pass по нужным входным данным. При добавлении pass проверь
порядок и declared dependencies в обоих entrypoint; `for-update` обязан предшествовать
abrupt completion. Новый generated name не должен конфликтовать с исходным кодом.

Сохраняй source locations и control target metadata. Создавай IR builders и учитывай
immutability конкретного pass. Captured binding может иметь физическое переименование;
проверяй `renamedTo` и фактический scope вместо предположения, что source name пригодно.
Descriptor pattern относится не ко всем режимам одинаково.

Порядок проверок — [verification.md](verification.md). Короткий локальный workflow
агента — [developer skill](../../.agents/skills/boristype-compiler-development/SKILL.md).
Новые проверки должны выявлять семантический дефект или target invariant, а не только
совпадение текста с выбранной реализацией.

## Что пока не исправлено

[Expression research checkpoint](../research/compiler-semantics/results/2026-11-05-research-checkpoint.md)
сохраняет 38 exact XFAIL из 48 comparisons, prototypes и preliminary recommendation.
Это результат исследования, а не новый принятый lowering design. Полный inventory
и C expression probes не завершены. Старые планы не разрешают возобновить script/module.
Сводка долга — [TODO](../../TODO.md), подробности — [research index](../research/README.md).
