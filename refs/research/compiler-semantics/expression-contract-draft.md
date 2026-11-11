# Expression evaluation: draft контракта E-02

Status: **draft, не accepted**. Research:
[E-01](expression-evaluation.md). Findings: R01–R03/R29;
задачи E-03–E-08, R-01, P-01. Normative algorithms перечислены в research.

2026-11-05: **on hold для script/module** до
[решения стратегии памяти](../../decisions/2026-11-05-script-module-memory-freeze.md).
Предложение сохранено для последующего пересмотра ABI/lifetime; этот draft
не разрешает начинать migration и не расширяет текущую поддержку bare.

## Scope и representation

Script/module: сохранять достижимую JS evaluation semantics для реализованных
expressions; env/descriptor ABI не менять в первом срезе. Bare: те же правила
placement/order для поддержанного native subset, без вызова script helpers и
без обещания general closures/optional chains/value-return logical semantics.

Предложение: lowering result с отдельными declarations (без execution), execution
plan и value; property/call lvalue требует Reference, не повторного visit.
Immutable composition, общий BindingManager, source loc/target IDs.
Inline form остаётся preferred при отсутствии execution statements и проверенном
parser shape. B/C/I sketches не production API и не acceptance этого spec.

## Rules

### EXPR-ORDER-01

Evaluate operands в source order и ровно один раз. Если поздний child имеет
execution prelude, ранний unstable read/call materialize до него. Identifier
read не считать stable, если значение может быть изменено поздним effect.
Reference сохраняет receiver/key отдельно от GetValue/PutValue.

### EXPR-LAZY-01

`&&`, `||`, `??`, `?:`, optional keys/args выполняют только selected execution
plan. Conditions и selected values сохраняют свои value/boolean distinctions.
Function/object creation setup принадлежит месту creation, а не внешнему statement.

### EXPR-THROW-01

Exception прерывает оставшиеся source evaluations в той же точке. Обычный call
вычисляет callee value, затем args; callable validation не переносить перед args.
Nullish optional call args не выполняет; non-null noncallable не означает skip.
Не вводить throw sentinels для не-исключительного expression/control flow.

### EXPR-FREQ-01

While test plan повторяется перед body. Do test plan — после body/на continue.
For init один раз; test перед каждой body entry; update после body/continue,
после crossed finalizers. Break/return/throw и finalizer override не выполняют
покинутый update. Нельзя просто вставить update/test в body tail.

### EXPR-PHASE-01

Parameter initialization проходит до body, sequentially; default только при
undefined (включая explicit undefined), не только при missing argument.
Его declarations доступны **до** default evaluation; execution не в body prelude.
Source function declaration hoisting и expression descriptor creation различаются.

### EXPR-SAFE-01

Parser normalization не переносит effects между branches/loop/parameter points.
Inline grouped ternary применим только в подтверждённых contexts; `(expr).member`
не генерировать. Unsupported capability не считать semantics-preserving pass.
Dynamic switch case lowering — отдельная задача R28/E-07, не новый blanket rejection.

## Output / стоимость

- Никаких новых helpers/IIFE/env/descriptor/args-array на simple expression.
- Grouping-only slice: zero дополнительных scalars, кроме обязательного single
  evaluation scratch для optional/logical base; no execution outside branch.
- Statement plan: scalar snapshot только когда требуется preserving order/read;
  каждый source receiver/key/callee/call исполняется нужное число раз.
- O(source nodes) representation/output для nesting без duplication continuations.
  Предварительные six-case counts в research — baseline estimates для shapes,
  не общая C performance гарантия. Dynamic allocations/latency проверять отдельно.
- Effects не hoist; declarations hoist без повторной native var; names/loc/targets
  не теряются. Full regression abrupt gate после изменения production path.

## Начальная acceptance matrix

| Rule  | Permanent cases сейчас                                                                         | Дополнения до acceptance                                                               |
| ----- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| ORDER | r02-argument-order, early-value-before-mutation, receiver-before-argument, array-element-order | callee rebinding, receiver/key throws, constructor/default/spread ordering             |
| LAZY  | четыре r01 cases, optional-key-skip, object-method-branch-skip, elseif-skipped-test            | nested selected/skipped combinations, optional call nullish/noncallable                |
| THROW | skipped-throw, argument-throw-order                                                            | selected throw, early throw stops later args, finally observes prior effects           |
| FREQ  | r03-while-frequency, for-test/update-frequency, do-test-frequency                              | continue/labels/finalizer overrides, condition throw, zero/one iteration               |
| PHASE | parameter-default-skipped/before-body                                                          | explicit undefined, dependent parameters, captures, all function forms                 |
| SAFE  | raw native survey + prototypes + safe-for-update AST assertion                                 | each parser pass, real MemberExpression receivers, source names, source loc/target ids |

Modes проверяются раздельно. Неподдержанный bare form — explicit diagnostic
test в будущем, не молчаливое omission и не ухудшение согласованного subset.
Каждый перенесённый baseline case становится strict regression без XFAIL.

## Decisions pending

B + inline fast path — рекомендация, пока не ADR. Выбор semantic IR wrapper/pass
уточнить после C shape evidence и одного vertical slice. Default/Reference API
должны быть совместимы с планом, но не требуют исправления всего ABI в одном PR.
Full ToPrimitive, числовая модель, host/XML reflection и iterator contracts
не определяются этим spec; breaking ABI/deployment потребует отдельного выбора.
