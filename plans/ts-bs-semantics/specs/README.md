# L3. Спецификации

В этой папке пока **нет accepted feature specs**. Создавать их после research,
с именами `NN-<feature>.md`; rules имеют стабильные IDs, например `EXPR-ORDER-01`.
Ссылки на ECMAScript брать на конкретные algorithms/sections; наблюдаемый BS actual
не использовать как нормативную семантику TS.

## Шаблон

```markdown
# <Feature>: контракт

Status: draft | accepted | superseded
Research: <link>; Findings: <IDs>; Tasks: <IDs>
Normative source: <ECMAScript/TypeScript rules>

## Scope и mode matrix

<Поддерживаемые forms/types, bare/script/module; native/host boundaries.>

## Semantic rules

### FEATURE-RULE-01

<Порядок evaluation, count, value/reference, throws и state.>

## Output/IR invariants

<Forbidden survivors, binding/target/loc preservation, helper/ABI contract.>

## Diagnostics

<Неподдерживаемые forms: Error/range/no output. Temporary rejection не feature completion.>

## Cost budget

<Structural budget, expected growth, measurements needed, fast-path controls.>

## Acceptance matrix

<Rule ID → source case ID → oracle → modes → JS/C requirement → output invariant.>

## Boundaries, open questions и upgrade/compatibility

<Explicit assumptions, decisions needed, host differences, runtime version coupling.>
```

Spec должна различать отсутствующий argument и explicit undefined, reads и
presence, source declaration и initialization, logical value и boolean predicate.
Для unsupported mode допустима diagnostic expectation, но support matrix должна
быть осознанной, не результатом отсутствия tests.

Если обязательство меняется после исследования — новая revision с причиной и
изменёнными cases. Не ослаблять spec молча, чтобы implementation прошла gate.
