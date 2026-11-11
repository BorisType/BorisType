# Labels, finalizers и безопасные for updates

Модель реализована в PR #27; source сверено 2026-11-11. Датированные source
counterexamples, rejected baseline, metrics, JS comparisons и C handoff сохранены
в [evidence 2026-10-06/07](../research/compiler-control-flow/2026-10-07-results.md).
Эта страница объясняет текущий алгоритм, а не возобновляет implementation plan.

[abrupt-completion-desugar](../../packages/bt-ir/src/passes/abrupt-completion-desugar.ts)
и [control-target-resolver](../../packages/bt-ir/src/passes/control-target-resolver.ts)
обрабатывают synchronous labels и normal/return/throw/break/continue вместе.
[Lowering dispatcher](../../packages/bt-ir/src/lowering/statements/dispatch.ts)
сохраняет label/loc и stable target id; loop expansion переносит id на фактический
loop, включая complex iterable for-of и chained aliases.

## Почему единая completion model

Нативные labels могут тихо превратиться в unlabelled jump в исследованном JS
BorisScript; native finally повторял try body. Старый служебный throw для return
ловился пользовательским catch, мутировал BmError и терял exception из return
expression. IIFE/return token меняет scope/this/arguments/captures и не решает
continue; guards размножаются при nesting; полный PC/CPS автомат ожидался слишком
тяжёлым для синхронной задачи (этот вариант не прототипировали). Выбраны scalar completion и одноразовые
`while(true)` escape frames. C carrier checks `AB`/`012` подтвердили выбранную
форму; они не доказывали всю semantics.

Native try/catch остаётся для настоящих exceptions. Точная identity/type/stack
произвольного thrown value ограничена runtime (нормализация в BmError). Async,
generators, dynamic-eval statement values и iterator closing эта модель не
добавляет. Bare не получает general closure emulation. Annex B labelled functions
отклоняются BT90017, catch patterns — BT90016.

## 1. Completion record

Числовые значения в действующем pass:

```text
0 = NORMAL
1 = RETURN
2 = THROW
3 = BREAK
4 = CONTINUE
```

На затронутый executable scope (program/function) создаются не более одной основной тройки:

```js
var __acType0;
var __acTarget0;
var __acValue0;
```

Плюс допускаются короткоживущие save-переменные на активный `finally`, необходимые для save/reset/restore. Поля основной тройки можно прореживать: например, labels-only scope без `return/throw` carrier не обязан получать `value`.

Переменные создаются только если scope действительно требует carrier. `type` инициализируется `NORMAL` до первого transformed region. Простая функция без labels/finally должна компилироваться как раньше.

Инварианты:

- `type == NORMAL` означает, что `target/value` игнорируются;
- `RETURN/THROW` используют `value`, но не `target`;
- `BREAK/CONTINUE` используют `target`, но не `value`;
- target id уникален внутри executable scope, не зависит от имени label;
- completion не пересекает границу функции;
- перед исполнением обычного transformed region active completion равен `NORMAL`;
- boundary либо полностью потребляет предназначенный ей completion и сбрасывает type, либо распространяет его наружу без изменения.

Generated spelling не является публичным ABI; важны completion и target invariants.

## 2. Разрешение целей до переписывания

Resolver сначала строит lexical control context, а не угадывать цель по глубине вложенности.

Для каждого `break/continue` определяется конкретная target node:

- unlabelled `break` → ближайший loop или `switch`;
- unlabelled `continue` → ближайший loop;
- labelled `break` → statement соответствующего lexical label;
- labelled `continue` → iteration statement соответствующего label; chain labels на одном loop считаются aliases одной iteration boundary;
- function boundary обрывает видимость labels и control targets.

Это обязательно для различения:

```js
while (outerCondition) {
  try {
    while (innerCondition) {
      continue; // остаётся внутри try и не запускает finally
    }

    continue; // покидает try, сначала должен выполнить finally
  } finally {
    cleanup();
  }
}
```

Анализ «есть ли где-то выше цикл» недостаточен, особенно для `break outer` из вложенного loop/switch.

## 3. Escape frames

Нелокальный completion структурно переносится через одноразовые loops:

```js
while (true) {
  statement1;

  if (condition) {
    __acType0 = 3;
    __acTarget0 = 7;
    break;
  }

  statement2;
  break;
}
```

Последний `break` — нормальное завершение frame. После frame boundary проверяет state.

Критически важно: вставленный `while (true)` сам становится ближайшей целью нативных `break/continue`. Поэтому transformer обязан делать одно из двух:

1. не вставлять frame там, где он изменит нативную цель; или
2. переписать затронутые `break/continue` в completion и восстановить их на настоящей boundary.

Нельзя сначала обернуть дерево рамками, а потом локально заменить только labelled statements.

## 4. Labels

#### Label без ссылок

```js
unused: statement;
```

Label удаляется без overhead.

#### Простой loop label

Если каждый jump к label после удаления label всё ещё попадёт в ту же нативную цель, label можно стереть, а jump сделать unlabelled.

```js
outer: while (x) {
  if (a) continue outer;
  if (b) break outer;
}
```

Здесь возможен нативный fast path, пока между jump и loop нет другого loop/switch, меняющего нужную цель.

#### Arbitrary labelled statement

```js
done: {
  a();
  if (x) break done;
  b();
}
c();
```

Требует synthetic boundary. `break done` устанавливает `BREAK/target`, boundary `done` потребляет его, после чего выполняется `c()`.

#### Nested loop/switch

```js
outer: for (;;) {
  switch (x) {
    case 1:
      break outer;
  }
}
```

Простая замена на unlabelled `break` неверна: она выйдет только из `switch`. Здесь нужен carrier.

## 5. Циклические boundaries

На границе iteration statement:

- `CONTINUE` с target этого loop сбрасывается и превращается в нативный `continue`;
- `BREAK` с target этого loop сбрасывается и превращается в нативный `break`;
- любой другой pending completion покидает loop и распространяется выше;
- для `for` нативный `continue` обязан сохранить выполнение update expression;
- для `do/while` — перейти к condition;
- для `for-in/for-of-lowered` — перейти к следующей итерации.

`switch` потребляет только предназначенный ему `BREAK`. `CONTINUE` он никогда не потребляет.

При обработке `switch` отдельно сохранить fall-through. Нельзя безусловно оборачивать каждый `case` в frame и оставлять исходный локальный `break`: новый frame перехватит его раньше `switch`. Либо carrier использует сам `switch` как ближайший escape target с проверкой после него, либо локальные switch-break также remap-ятся на его target id.

## 6. `try/catch/finally`

Нативный `finally` не эмитится. Нативный `try/catch` применяется только для настоящих runtime exceptions.

Схематически:

```text
1. Выполнить transformed try body внутри native try.
2. Если есть user catch, настоящий exception передать в него.
3. Exception, покидающий try/catch, сохранить как THROW completion.
4. Сохранить pending completion от try/catch.
5. Сбросить active completion в NORMAL.
6. Выполнить transformed finalizer.
7. Если finalizer завершился нормально — восстановить сохранённый completion.
8. Если finalizer дал новый completion — он заменяет сохранённый.
9. Передать итоговый completion наружу.
```

Save/reset/restore необходим для вложенного `try/finally` внутри finalizer:

```js
function f() {
  try {
    return 1;
  } finally {
    try {
      work();
    } finally {
      cleanup();
    }
  }
}
```

Внутренний `try/finally`, завершившийся нормально, не должен стереть pending `return 1` внешней конструкции.

`finally` с собственным `return/throw/break/continue` должен заменить ранее сохранённый completion, как требует ECMAScript.

Для `try-catch-finally` нужен внешний native catch вокруг user catch, потому что exception из тела user catch всё равно обязан запустить finalizer. Служебные completions native catch не видит, поскольку они не используют `throw`.

У JS-клиента есть дополнительное синтаксическое ограничение: каждый нативный `try` обязан иметь `catch (name)`. Поэтому generated wrapper всегда создаёт collision-safe catch parameter, даже если в исходнике был optional catch binding. Нативный `try` без `catch` не должен дойти до emitter.

## 7. Нормализация catch binding

Обычный `try/catch` не переводится на completion state, но каждый физический catch parameter в output должен быть уникальным:

```js
// source
try {
  work();
} catch (error) {
  use(error);
}

// schematic output
try {
  work();
} catch (__caught0) {
  use(__caught0);
}
```

Это одновременно:

- защищает outer `error` от повреждения target runtime;
- удовлетворяет парсеру, требующему `catch (name)` даже для source `catch {}`;
- исключает коллизии между nested catches;
- позволяет user catch внутри transformed `try-catch-finally` остаться настоящим catch, а не hoisted `var`.

Scope analyzer регистрирует logical catch binding как block-scoped variable с отдельным physical runtime name. Если binding захвачен вложенной функцией, catch body создаёт block environment и копирует `__caught0` в него до выполнения user statements. После выхода closure продолжает видеть caught value, а target может очистить свой временный catch parameter.

Catch binding patterns пока отклоняются BT90016 (Error с source range),
а не lowering-ятся как отсутствующий параметр. Это explicit unsupported boundary.

## 8. Effect analysis и размер output

Модель эффекта для выбора frames учитывает:

```text
maySetCompletion
mayPropagateCompletion
consumesTargets
crossedFinalizers
```

Это позволяет:

- не добавлять проверки после statements, которые не могут создать pending completion;
- не создавать completion variables в незатронутых scopes;
- оставлять локальные нативные `break/continue/return` там, где synthetic frame не меняет их цель и они не пересекают `finally`;
- удалять неиспользуемые labels без frame;
- после корректной baseline-реализации добавить fast paths без смены семантической модели.

Текущие mixed affected regions консервативны; новые selective fast paths требуют differential tests. Недопустима оптимизация, основанная только на счётчике глубины loop/switch.

## Safe for-update normalization

[for-update-desugar](../../packages/bt-ir/src/passes/for-update-desugar.ts)
выполняется **до** target resolution/completion. Источник — C hang в compound
comma update. Гипотеза пользователя о пропуске i++ не доказана без raw/legacy
controls; успешный workaround не раскрывает C parser internals.

Affected for превращается в init + collision-safe first-entry flag + while.
На первом входе update пропускается, на следующих выполняется перед test; поэтому
continue идёт через update после crossed finalizers, а break/return/throw и
finalizer override не выполняют покинутый update. Нельзя просто перенести update
в конец body: continue его пропустит. Simple updates/argument separators остаются
без rewrite. Discarded binary/sequence comma разбивается на statements;
value-consuming nested expressions и short circuit сохраняются целиком. Это
локальный workaround, не общий expression-effect normalizer.

Source controlTargetId сохраняется на новом while. Completion-free prefix
остаётся вне frames: condition break должен попадать в настоящий while без
лишнего carrier. Нет новых helpers/IIFE/env/descriptor allocations. Общий
[IR predicate](../../packages/bt-ir/src/ir/utils.ts) проверяет comma subtree;
pass-module export сохранён deprecated, без emitter→passes dependency.

## Защитные контракты и routes

Shared BindingManager резервирует source/generated names. PassContext.bindings
обязателен. Manager проверяет for-update dependency; deprecated
tryFinallyDesugarPass — alias того же completion pass. При прямом .run порядок
обеспечивает caller. После новых Errors manager не продолжает passes, pipeline
не выдаёт partial output. Invalid/duplicate target — отдельные BT90018 с source
range (CRLF/UTF-16), positionless fallback при отсутствии loc/source.

Emitter отклоняет surviving label, labelled jump, native finalizer, try без
именованного catch и comma update. Scope analysis различает logical/physical
catch binding; captured catch копируется в per-entry block env до user body.
Unused labels стираются; source без affected control flow сохраняет no-op identity.
Jumps остаются native лишь когда frames/finalizers не меняют target.

| Проверка                             | Source route                                                                                                                                                                                                              |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lowering/resolver/labels             | [labels-ir](../../packages/bt-ir/test/labels-ir.test.mjs), [control-target-resolver tests](../../packages/bt-ir/test/control-target-resolver.test.mjs), [labels-output](../../packages/bt-ir/test/labels-output.test.mjs) |
| Catch lexical/physical/capture       | [catch-bindings](../../packages/bt-ir/test/catch-bindings.test.mjs), [pass-invariants](../../packages/bt-ir/test/pass-invariants.test.mjs)                                                                                |
| Completion/output                    | [abrupt-completion-output](../../packages/bt-ir/test/abrupt-completion-output.test.mjs), [abrupt cases](../../packages/bt-ir/test/semantic/abrupt-cases.mjs)                                                              |
| Update invariants/interactions       | [for-update IR](../../packages/bt-ir/test/for-update-ir.test.mjs), [output](../../packages/bt-ir/test/for-update-output.test.mjs), [cases](../../packages/bt-ir/test/semantic/for-update-cases.mjs)                       |
| Dependencies, diagnostics, collector | [review-regressions](../../packages/bt-ir/test/review-regressions.test.mjs)                                                                                                                                               |

[Verification](verification.md) объясняет strict Node↔JS gate и независимый C
pack. Recorded JS matrix: 1920 cases × 3 modes = 5760 comparisons. C 2026-10-07:
Check27Fixed `0FU1FU2FU|E`, selected bare pack **OK: 60/60**, версия неизвестна.
Это не новый запуск current head и не C script/module/memory/performance
acceptance. [Probe protocol](../research/compiler-control-flow/probes/README.md)
сохраняет bounded generation и raw diagnostic limitations.
