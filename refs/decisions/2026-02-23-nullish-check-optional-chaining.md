# ADR 003: Явная nullish-проверка optional chaining

Дата решения: 2026-02-23. Статус: реализованный подход с известными ограничениями;
уточнён при миграции 2026-11-11. Это основание выбора, а не обещание полной JS-семантики.

## Выбор и причина

В BS нет `?.`; нужно вернуть `undefined` для nullish receiver и сохранить остальные
значения. Выбран условный оператор с временной переменной и двумя проверками:

```javascript
var __tmp;
var result = (__tmp = obj) == null || __tmp == undefined ? undefined : bt.getProperty(__tmp, "prop");
```

Это концептуальный output script/module. Наличие helper, скобки и extraction
зависят от контекста и режима. Реализация `createOptionalCheck` находится в
[expressions/dispatch.ts](../../packages/bt-ir/src/lowering/expressions/dispatch.ts).
Она может переиспользовать temp цепочки; присваивание receiver остаётся inline,
объявление попадает в pending statements.

В JavaScript `x == null` уже охватывает null/undefined. Исторически двойная проверка
выбрана ради явности намерения. Из этого не следует равенство всех BS coercions
правилам JavaScript или доказанная необходимость второй проверки на обоих runtime.

## Альтернативы и контрпример

- `!x` неверно отождествляет nullish с falsy: `0`, `false`, `""` должны сохраняться.
  Например, `value?.toString()` не должен пропускать вызов только из-за `value === 0`.
- Одна loose-проверка короче; упрощение требует отдельной проверки target coercions.
- Две strict-проверки — JS-вариант, но сам по себе `===` не доказывает соответствие
  BS runtime. Старое утверждение о безусловной эквивалентности снято.
- `bt.isNullish()` добавляет helper и вызов. Inline-проверка не требует отдельного ABI.
- `(obj ?? undefined).prop` не заменяет optional access: BS не поддерживает `??`,
  а доступ после подстановки `undefined` всё равно не защищён.

## Цена и границы

Temp, assignment и две проверки увеличивают output. Измерений, позволяющих объявить
стоимость незначительной или отсутствие hot-path сценариев, в исходной ADR нет.
Проверки falsy/nullish в [propSemantic](../../tests/src/propSemantic) полезны, но
не доказывают порядок всех эффектов, receiver binding или C acceptance всех контекстов.
Известные проблемы extraction описаны в
[expression evaluation](../research/compiler-semantics/expression-evaluation.md).
Script/module development [заморожено](2026-11-05-script-module-memory-freeze.md).

Связанные решения: [IR](2026-02-23-ir-over-transformers.md),
[extraction](2026-03-03-expression-extraction.md).
