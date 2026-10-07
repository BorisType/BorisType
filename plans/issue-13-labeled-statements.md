# План реализации ECMAScript labels и корректных abrupt completions

- **Issue:** [#13 — Реализовать Labeled statement](https://github.com/BorisType/BorisType/issues/13)
- **Дата:** 2026-10-06
- **Статус:** Implemented locally; JS/Node gates и независимый C bare-mode smoke (60/60) прошли
- **Основной пакет:** `packages/bt-ir`
- **Связанные части:** `packages/eslint-plugin`, `tests`, `ref/decisions`

## 1. Короткое решение

Реализовать labels не как нативные BorisScript labels, а как компиляцию управляющих переходов в собственную модель завершения statement:

```text
completionType   = normal | return | throw | break | continue
completionTarget = числовой id цели break/continue
completionValue  = значение return/throw
```

Для структурного выхода использовать генерируемые одноразовые рамки:

```js
while (true) {
  // transformed body
  break;
}
```

`break`/`continue`/`return`, которые нельзя безопасно оставить нативными, записывают completion и выходят из ближайшей рамки. Границы циклов, `switch`, labels и `try/finally` либо потребляют предназначенный им completion, либо передают его выше.

Эта работа должна **заменить**, а не просто дополнить текущий `try-finally-desugar`: labels и `finally` используют одну и ту же семантику abrupt completion. Служебные `throw` для эмуляции `return` больше не используются.

## 2. Почему задача шире добавления `IRLabeledStatement`

Этот раздел и аудит ниже описывают baseline до реализации. Текущее состояние
зафиксировано в разделе 14 и superseding ADR.

Issue отдельно просит учитывать `try-catch-finally`. Сейчас эти части уже связаны:

- lowering сохраняет имя в `IRBreakStatement.label` и `IRContinueStatement.label`, но сам `LabeledStatement` не поддерживается;
- emitter способен напечатать `break outer;`, однако целевой парсер label не понимает;
- текущий `try-finally-desugar` поддерживает только `normal`, `return` и `throw`;
- `break/continue`, покидающие `try` с `finally`, запрещаются диагностикой `BT90012` и ESLint-правилом;
- текущий `return` через `finally` реализован служебным исключением и может быть перехвачен пользовательским `catch`.

Пример уже существующей ошибки:

```js
function f() {
  try {
    try {
      return 1;
    } catch (e) {
      return 2;
    }
  } finally {
    // empty
  }
}
```

ECMAScript возвращает `1`. Текущая схема превращает первый `return` в `throw`, внутренний пользовательский `catch` его перехватывает, и результатом может стать `2`.

Добавление labels поверх этой схемы закрепит ошибочную модель. Поэтому нужен единый pass для labels и `finally`.

## 3. Установленные ограничения целевой платформы

### 3.1. JavaScript-реализация BorisScript

Исследован `/home/agent/workspace/main.js`.

- `JsParseBreak` и `JsParseContinue` читают только ключевое слово и не сохраняют label. `break outer;` фактически может превратиться в `break; outer;`, то есть возможна тихая неправильная семантика вместо синтаксической ошибки.
- `ProcessBreak` и `ProcessContinue` знают только ближайший loop/switch через флаги окружения.
- нативный `finally` сломан: `ProcessTry` при переходе к right/finally body повторно запускает `leftSubCode`;
- `throw` любого значения, не являющегося `BmError`, преобразуется в новый `BmError`, поэтому точная ECMAScript-идентичность thrown value уже недоступна.

Следствия:

1. В финальном output не должно оставаться нативных labels, labelled `break/continue` или `finally`.
2. Служебные исключения нельзя использовать для `return/break/continue`.
3. Реальные исключения можно пропускать через нативный `try/catch`, принимая существующее ограничение платформы на thrown values.

### 3.2. C-реализация BorisScript

Полного доступа пока нет. Вручную проверено:

```js
try {
  while (true) {
    trace = trace + "A";
    break;
  }
} catch (e) {
  trace = trace + "C";
}

trace = trace + "B";
```

Результат `AB`. Это подтверждает ключевое допущение: обычный `break` внутри `try` не превращается в exception и не попадает в `catch`.

Также проверена передача числового state через вложенные циклы с последующим нативным `continue`; результат соответствует ожидаемому.

Практическое решение: генерировать `while (true)`, а не `do ... while (false)`. Первый вариант уже подтверждён обеими реализациями и меньше зависит от странностей парсера.

### 3.3. Неустранимые этой задачей различия

В scope задачи не входят:

- `async/await` и generators: они уже запрещены и требуют сохранения continuation между suspension points;
- точная идентичность, тип и stack trace произвольного thrown value в BorisScript;
- Annex B-конструкция `label: function f() {}` в sloppy mode;
- общие расхождения платформы, не относящиеся к control flow, например iterator closing у текущего lowering `for...of`.

Для синхронных ECMAScript labels, `return`, `break`, `continue` и приоритета completion из `finally` принципиально непокрываемых случаев у выбранной модели нет.

### 3.4. Аудит текущего `try-finally-desugar`

После первоначального плана текущий pass был проверен отдельно по коду и минимальным runtime-примерам. Вывод: расширять существующий throw-sentinel добавлением ещё двух type values нельзя; core pass нужно переписать.

Комбинированная проверка текущих generated patterns в `/home/agent/workspace/main.js` дала:

```text
current: 2 | undefined | inner | TNF
Node.js: 1 | error:boom | outer | TFNF
```

Каждая колонка соответствует отдельной ошибке.

| Проблема                                        | Причина                                                                             | Наблюдаемое отличие                                           | Решение                                                                       |
| ----------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| User `catch` перехватывает `return`             | `return` превращается в настоящий `throw`                                           | вложенный `try/catch` возвращает `2` вместо `1`               | убрать служебные exceptions                                                   |
| Exception из return expression теряется         | pass сначала пишет `fType = RETURN`, затем вычисляет expression                     | `return boom()` возвращает `undefined` вместо проброса `boom` | значение вычисляется до фиксации completion; настоящий throw ловится отдельно |
| Catch binding портит outer variable             | source `catch (e)` превращается в `var e = __fc`, затем hoist-ится                  | после catch outer `e` содержит error вместо `"outer"`         | сохранять native catch boundary с уникальным физическим параметром            |
| `continue` внутри `switch` пропускает finalizer | detector пропускает весь `SwitchStatement`, хотя switch не является continue-target | trace `TNF` вместо `TFNF`                                     | identity-based target resolution                                              |
| Возможны коллизии temporary names               | локальный `NameGen` не знает source/generated names                                 | source `__fType0` может быть перезаписан pass                 | shared `BindingManager`                                                       |
| Возвращаемый `BmError` мутируется               | служебный `throw` добавляет stack entry объекту                                     | return имеет побочный эффект                                  | completion state без throw                                                    |

Дополнительный target bug обнаружен уже в обычном `try/catch`: JS-интерпретатор добавляет catch parameter в текущий runtime env, а после catch присваивает ему `undefined`, не восстанавливая одноимённую outer variable.

```js
function f() {
  var e = "outer";
  try {
    throw "inner";
  } catch (e) {
    // empty
  }
  return e;
}
```

ECMAScript возвращает `"outer"`; JS BorisScript возвращает `undefined`. Поэтому обычный `try/catch` остаётся нативным как control-flow construct, но его физический catch parameter тоже нужно нормализовать в уникальное generated name. Это отдельная небольшая часть работы, а не перевод обычного catch на completion state.

Текущий scope analyzer намеренно не регистрирует catch binding. Из-за этого body может ошибочно разрешить `e` как одноимённую outer captured variable, а closure, созданный внутри catch, не получает корректное block binding. При переделке нужно моделировать catch parameter как полноценный block-scoped binding и отдельно инициализировать его в block environment, если он captured.

Что сохраняется из текущей реализации:

- место pass до hoist и parser-safety passes;
- bottom-up обработка nested `try/finally`;
- использование native `try/catch` только для настоящих runtime exceptions;
- числовая идея completion type;
- существующие happy-path tests как regression baseline.

Что заменяется:

- `NameGen`;
- `transformReturnsInBlock/List` и `buildSentinelSequence`;
- `detectBreakContinueInTry` и depth-based assumptions;
- ручное выполнение user catch через `var userParam = __fc`;
- отдельный state record на каждый try без общего control-target анализа.

Текущие tests проверяют normal flow, обычный throw/rethrow, nested finally и простые returns, поэтому все перечисленные ошибки проходят незамеченными. Отдельных unit/golden tests pass-а нет. Старая ADR также расходится с кодом: она утверждает, что temporary names создаются через `ctx.bindings`, хотя фактически используется независимый `NameGen`.

## 4. Рассмотренные варианты

| Вариант                               | Плюсы                                                                                             | Минусы                                                                        | Решение                                    |
| ------------------------------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------ |
| Эмитить нативные labels               | Минимальный output                                                                                | Парсер их не поддерживает и может тихо исказить код                           | Отклонить                                  |
| Служебный `throw`/sentinel            | Легко покинуть глубокую конструкцию                                                               | Перехватывается user `catch`; runtime меняет thrown value; дорого             | Отклонить                                  |
| IIFE + return token                   | Удобный нелокальный выход                                                                         | Новый scope, другая семантика `this`/arguments/captures; не решает `continue` | Отклонить                                  |
| Boolean flags и guards                | Только простые конструкции                                                                        | Быстро разрастается число флагов и `if`; сложно совместить с nested finally   | Не брать как основную модель               |
| Structured completion + escape frames | Близко к ECMAScript Completion Record; не использует exceptions; структурный и тестируемый output | Требует точного анализа целей и аккуратной вставки рамок                      | **Выбрать**                                |
| Полный program-counter/CPS автомат    | Может моделировать suspension и произвольный CFG                                                  | Очень большой/медленный output, тяжело читать и отлаживать                    | Оставить только как теоретический fallback |

## 5. Семантическая модель

### 5.1. Completion record

Предлагаемые числовые значения:

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

Окончательные имена и константы можно изменить при реализации; важен контракт, а не spelling.

### 5.2. Разрешение целей до переписывания

Pass должен сначала построить lexical control context, а не угадывать цель по глубине вложенности.

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

### 5.3. Escape frames

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

### 5.4. Labels

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

### 5.5. Циклические boundaries

На границе iteration statement:

- `CONTINUE` с target этого loop сбрасывается и превращается в нативный `continue`;
- `BREAK` с target этого loop сбрасывается и превращается в нативный `break`;
- любой другой pending completion покидает loop и распространяется выше;
- для `for` нативный `continue` обязан сохранить выполнение update expression;
- для `do/while` — перейти к condition;
- для `for-in/for-of-lowered` — перейти к следующей итерации.

`switch` потребляет только предназначенный ему `BREAK`. `CONTINUE` он никогда не потребляет.

При обработке `switch` отдельно сохранить fall-through. Нельзя безусловно оборачивать каждый `case` в frame и оставлять исходный локальный `break`: новый frame перехватит его раньше `switch`. Либо carrier использует сам `switch` как ближайший escape target с проверкой после него, либо локальные switch-break также remap-ятся на его target id.

### 5.6. `try/catch/finally`

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

### 5.7. Нормализация catch binding

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

Scope analyzer должен зарегистрировать logical catch binding как block-scoped variable с отдельным physical runtime name. Если binding захвачен вложенной функцией, catch body создаёт block environment и копирует `__caught0` в него до выполнения user statements. После выхода closure продолжает видеть caught value, а target может очистить свой временный catch parameter.

Для destructuring catch binding используется generated physical parameter и обычный destructuring lowering в начале catch body. Если полная поддержка binding patterns не войдёт в первый patch, compiler обязан выдать точную диагностику, а не трактовать pattern как отсутствующий parameter.

### 5.8. Effect analysis и размер output

Перед генерацией frames pass вычисляет для каждого statement эффект:

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

Первая версия может быть консервативнее, но оптимизации допускаются только после differential tests. Недопустима оптимизация, основанная только на счётчике глубины loop/switch.

## 6. Изменения в IR и pipeline

### 6.1. Новый промежуточный IR node

Добавить `IRLabeledStatement`:

```ts
interface IRLabeledStatement extends IRNodeBase {
  kind: "LabeledStatement";
  label: string;
  body: IRStatement;
}
```

Он существует только между lowering и control-flow desugar. BorisScript emitter не должен уметь печатать его как нативный label.

Затрагиваемые файлы:

- `packages/bt-ir/src/ir/nodes.ts` — тип и `IRStatement` union;
- `packages/bt-ir/src/ir/builders.ts` — `IR.labeled(...)`;
- `packages/bt-ir/src/ir/index.ts` — export при необходимости;
- `packages/bt-ir/src/passes/walker.ts` — рекурсивный обход и exhaustive switches;
- passes с ручными statement switches — явная поддержка/инвариант;
- emitter — hard failure, если `LabeledStatement` пережил обязательный desugar pass.

### 6.2. Lowering

В `packages/bt-ir/src/lowering/statements/dispatch.ts` добавить обработку `ts.isLabeledStatement`.

Lowering должен:

- сохранить label и statement в IR;
- не пытаться сразу выбирать стратегию;
- не считать label identifier использованием переменной — scope analyzer это уже делает;
- сохранить `loc` для диагностик.

Отдельный visitor в `statements/control-flow.ts` либо новом `statements/labels.ts` предпочтительнее inline-логики в dispatcher.

#### Важно: source target identity после lowering

Наивное `IR.labeled(label, visitStatement(node.statement))` недостаточно. Текущий `visitForOfStatement` для сложного iterable превращает один source loop в блок:

```text
for (const x of getItems()) body
    ↓
{
    var __arr = getItems();
    for (__item in __arr) body
}
```

Label исходно относится к iteration statement, поэтому `continue label` должен попасть в сгенерированный `ForInStatement`, а не в synthetic block. Подобные expansion не должны ломать identity control target.

Рекомендуемое решение:

- присваивать source breakable/iteration target стабильный внутренний id;
- сохранять id в `IRLabeledStatement` и на фактическом IR loop/switch, реализующем source target;
- для lowered `for...of` переносить id на generated `ForInStatement`, оставляя вычисление iterable перед ним;
- label resolver связывает имя с target id и kind (`statement`, `switch`, `iteration`), а не с предположением о форме дочернего IR;
- не искать target эвристикой вроде «последний statement в generated block».

Конкретное поле (`controlTargetId`, отдельная metadata map или typed lowering result с `prelude + target`) выбирается на этапе 1, но стабильная identity обязательна. Label сам по себе не создаёт lexical variable scope, а synthetic frames не должны создавать новый environment/capture scope.

#### Catch scopes

В `packages/bt-ir/src/analyzer/scope-analyzer.ts` убрать специальное исключение «catch parameter не регистрировать» и добавить binding kind `catch` либо эквивалентную typed metadata.

Lowering catch должен получать из scope analysis:

- logical source name;
- collision-safe physical catch name;
- признак capture;
- block scope/environment для lifetime captured binding;
- lowering binding pattern, если parameter не identifier.

`visitTryStatement` больше не должен терять destructuring pattern через `param = null`. Для optional catch binding он создаёт только неиспользуемый physical name, необходимый target parser.

### 6.3. Единый pass

Заменить текущую внутреннюю модель `try-finally-desugar` на pass с ответственностью:

1. разделить program на executable scopes;
2. разрешить label/control targets;
3. определить jumps, которым нужен carrier;
4. назначить target ids;
5. создать collision-safe completion variables;
6. нормализовать physical catch parameters;
7. переписать labels, loops, switch и try/finally;
8. гарантировать отсутствие labels/finally на выходе.

Рабочее имя файла: `packages/bt-ir/src/passes/abrupt-completion-desugar.ts`.

Рабочее имя pass: `abrupt-completion-desugar`.

Старый `tryFinallyDesugarPass` либо удаляется, либо временно re-export-ится как alias только для внутренней совместимости. Pipeline должен запускать новый pass первым, до parenthesize/comma-safety/literal-extract/hoist.

Зависимости остальных passes (`dependsOn`) обновляются с `try-finally-desugar` на новое имя.

### 6.4. Генерация имён

Текущий локальный `NameGen` в `try-finally-desugar.ts` не знает имён исходника, несмотря на старую ADR, утверждающую обратное. Это потенциальная коллизия с пользовательскими `__fType0`, `__fVal0` и т.п.

Исправление:

- добавить shared `BindingManager` в `PassContext`;
- передавать `scopeAnalysis.bindings` из обеих pipeline entry points;
- создавать все state/save/catch temps через тот же manager, который уже видел source и lowering-generated names;
- добавить regression test с намеренными коллизиями всех выбранных префиксов.

### 6.5. Защитные инварианты

Перед emitter или внутри нового pass проверять:

- не осталось `LabeledStatement`;
- ни один `BreakStatement/ContinueStatement` не содержит `label`;
- ни один `TryStatement` не содержит `finalizer`;
- каждый оставшийся `TryStatement` содержит handler с именованным catch parameter;
- completion target разрешён и существует в том же executable scope;
- `CONTINUE` никогда не указывает на non-iteration target;
- synthetic frame имеет гарантированный normal exit;
- pass не заходит через function boundary с control context родителя.

При нарушении лучше завершить compile диагностикой, чем сгенерировать код, который target parser тихо исказит.

### 6.6. Диагностики и ESLint

После полной реализации:

- убрать использование `BtDiagnosticCode.BreakContinueTryFinally` (`90012`);
- сам код можно оставить зарезервированным, чтобы не переиспользовать публичный diagnostic number;
- удалить предупреждение `no-break-in-try-finally` из recommended config;
- для совместимости на один релиз оставить rule экспортированным как deprecated/no-op либо удалить с changeset — выбрать по принятой policy пакета;
- обновить README и rule docs, чтобы они не описывали уже снятое ограничение.

## 7. Spec-driven режим разработки

Семантический контракт должен появляться раньше production-кода. Для каждого маленького изменения сначала добавляется исполнимый пример, который отвечает сразу на четыре вопроса:

1. Какой trace/return/throw требует ECMAScript при выполнении исходника в Node.js?
2. Какую target identity должен выбрать resolver?
3. Какие конструкции допустимы и недопустимы в generated BorisScript?
4. Совпадает ли выполнение generated code в JS BorisScript с Node.js?

Тест считается спецификацией только при наличии детерминированного observable result. Проверки вида «скомпилировалось без ошибки» недостаточно. Для control flow предпочтителен короткий trace, показывающий порядок side effects, а для throw дополнительно фиксируются место возникновения и число вычислений expression. Известные ограничения BorisScript, например потеря identity произвольного thrown value, описываются в fixture metadata и не маскируются расплывчатым сравнением.

### 7.1. Цикл одной задачи

Каждый semantic slice проходит один и тот же цикл:

1. **Contract:** добавить минимальный source fixture и ожидаемый Node.js result.
2. **Red:** доказать, что текущий compiler либо отклоняет fixture, либо даёт иной trace/output.
3. **IR expectation:** добавить unit assertion на lowering/resolution/pass, если изменение происходит до emitter.
4. **Green:** реализовать минимальную часть semantics без несвязанных оптимизаций.
5. **Conformance:** выполнить source в Node.js, generated code в JS BorisScript и сравнить результаты.
6. **Output audit:** проверить structural invariants, прочитать generated fragment и снять bytes/lines/generated vars/frames.
7. **Regression gate:** прогнать полный build/lint/test; на milestone сформировать C probe.

Красный тест не обязан попадать в отдельный commit и не должен надолго ломать ветку: contract и реализация одного slice коммитятся вместе. Но в описании теста или commit message должно быть понятно, какое исходное расхождение он воспроизводит.

### 7.2. Слои спецификации

- **ECMAScript oracle:** исходный JS/TS и точный результат Node.js.
- **IR contract:** сохранённые labels, stable target identity, crossed finalizers и выбранный carrier.
- **Output contract:** отсутствие неподдерживаемого синтаксиса, collision-safe names и ограниченный overhead.
- **JS target conformance:** выполнение через `botest` с предоставленным `/home/agent/workspace/main.js`.
- **C target conformance:** компактный самодостаточный probe pack на milestones, запускаемый пользователем до появления автоматического доступа.

Node.js не является oracle для формы output, а JS BorisScript не является oracle для ECMAScript-семантики. Прохождение только одного слоя не закрывает задачу.

### 7.3. Размер semantic slices

Одна задача должна менять один наблюдаемый инвариант и иметь собственный gate. Предлагаемая декомпозиция:

1. differential harness и output-metrics helper без изменения semantics;
2. unique physical catch parameter для identifier binding;
3. optional catch binding;
4. outer catch-name shadowing;
5. captured catch binding;
6. destructuring catch binding либо явная diagnostic;
7. `IRLabeledStatement` и emitter invariant;
8. resolver для unlabelled loop/switch targets;
9. resolver для labelled block/loop targets и chained labels;
10. stable target identity для expanded `for...of`;
11. удаление unused label;
12. `break` из arbitrary labelled statement;
13. labelled loop `break`;
14. labelled loop `continue` с сохранением `for` update/loop condition;
15. outer jump через nested loop/switch;
16. основной completion record и `return` через один finalizer;
17. настоящий `throw` через один finalizer;
18. `break/continue` через один finalizer;
19. completion из user catch;
20. override completion самим finalizer;
21. nested save/reset/restore;
22. collision hardening и post-pass invariants;
23. доказуемые fast paths и output budgets;
24. ESLint/docs/ADR/changeset и финальный C pack.

Если slice неожиданно требует одновременно менять resolver, scope analyzer и finalizer protocol, его нужно остановить и разделить по новому найденному инварианту. Рефакторинг общей инфраструктуры допустим отдельным preparatory slice с no-output-change tests.

## 8. Порядок реализации

### Этап 0. Preflight

- Зафиксировать baseline текущих тестов.
- Вести работу в отдельной `feat/issue-13-abrupt-completions`, созданной от актуального `origin/main` (`4863f76` после merge PR #18 и #26).
- Сохранить несколько известных неправильных примеров как regression fixtures до замены pass.
- Зафиксировать контрольные output metrics для обычного кода и существующих `try/finally` tests.

Baseline на 2026-10-06:

- Node.js `24.21.0`, pnpm `12.5.1`, `pnpm install --frozen-lockfile` проходит;
- `pnpm -r run build` проходит, но существующая сборка tests печатает non-fatal diagnostic `Unhandled statement: ModuleDeclaration` для `tests/src/test.ts`;
- после подключения предоставленного runtime все 16 suites / 124 tests проходят, в том числе 14 текущих `Try-catch-finally` tests;
- runtime подключён локальным ignored symlink `packages/botest/build/borisscript/main.js` → `/home/agent/workspace/main.js`; сам runtime в репозиторий не добавляется;
- `pnpm lint` проходит с 11 существующими warnings и без errors;
- `pnpm check-versions` проходит;
- `pnpm format:check` до форматирования этого документа указывал только на новый plan file.

### Этап 1. IR support без изменения output

- Добавить `IRLabeledStatement`, builder, walker support и lowering.
- Добавить unit tests: AST → IR сохраняет labels и labelled jumps.
- Emitter пока обязан отказать, если новый pass не удалил node.

Gate: exhaustive TypeScript build проходит; некорректный pipeline не может молча напечатать label.

### Этап 2. Control target resolver

- Реализовать отдельный resolver с lexical stack labels/loops/switch/functions/finalizers.
- Возвращать для каждого jump target, crossed boundaries и необходимость carrier.
- Обработать chain labels и одинаковые имена в непересекающихся regions.
- Не полагаться на `stmt.label` после resolution; использовать внутреннюю identity/target id.

Gate: table-driven unit tests на target resolution без генерации BorisScript.

### Этап 3. Labels без `finally`

- Удаление unused labels.
- Arbitrary labelled blocks через frames.
- Labelled loops и switch.
- `break outer`/`continue outer` через 2–4 вложенных loop/switch.
- Fast path только когда доказано совпадение нативной цели.

Gate: differential Node ↔ JS BorisScript; output не содержит label syntax.

### Этап 3.5. Catch binding normalization

- Регистрировать catch parameter как block-scoped binding.
- Всегда использовать collision-safe physical catch name.
- Поддержать optional binding без синтаксически пустого `catch` в output.
- Инициализировать block env для captured catch parameter.
- Поддержать binding patterns через generated parameter и destructuring prelude либо выдать явную временную диагностику.

Gate: outer variables не меняются, nested catch names не конфликтуют, closure сохраняет caught value после выхода из catch.

### Этап 4. Unified `try/finally`

- Заменить throw-sentinel на completion state.
- Добавить `BREAK/CONTINUE` propagation.
- Реализовать save/reset/restore вокруг finalizer.
- Корректно обработать actual exceptions из try body, user catch и finalizer.
- Удалить старый detector/diagnostic ограничения.

Gate: полная completion override matrix и regression на user catch, который раньше ловил `return` sentinel.

### Этап 5. Output hardening

- Подключить общий `BindingManager` к pass.
- Минимизировать state declarations и propagation checks через effect analysis.
- Проверить parenthesize/comma-safety/literal-extract/hoist на новом output.
- Добавить output invariants и focused golden tests.
- Вручную прочитать representative generated files, а не ограничиваться runtime assertions.

Gate: no-op для программ без labels/finally; размер и структура transformed output соответствуют установленным budget.

### Этап 6. Интеграция и документация

- E2E suite в `tests/src`.
- Обновление ESLint rule/config/docs.
- Новая ADR, superseding `ref/decisions/2026-03-11-try-finally-desugaring.md`.
- Changeset для затронутых публикуемых packages.
- Финальная проверка C-реализации compact probe pack.

## 9. Стратегия тестирования

Одного уровня тестов недостаточно: Node может подтвердить ожидаемую ECMAScript-семантику, но не синтаксис BorisScript; runtime test может пройти при случайно раздутом или хрупком output.

### 8.1. Unit tests `bt-ir`

Добавить test script для `packages/bt-ir` по уже используемому в monorepo шаблону Node test runner.

Группы:

1. Lowering `LabeledStatement` → IR.
2. Resolver: точная target identity каждого jump.
3. Effect analysis: какой jump требует carrier и какие boundaries пересекает.
4. Pass: IR до/после для маленьких изолированных деревьев.
5. Collision-safe generated names.
6. Structural invariants после pass.

### 8.2. ECMAScript differential tests

Каждый source fixture сначала исполняется как исходный JS/TS в Node, затем компилируется и исполняется в BorisScript. Сравнивается не только return value, а trace side effects.

Использовать `botest --node-check` там, где harness позволяет. Для compiler-level cases добавить deterministic differential harness с выводом:

- исходного source;
- ожидаемого Node trace;
- фактического BorisScript trace;
- generated output при расхождении.

### 8.3. Deterministic combinatorial generator

Без случайного fuzz dependency сгенерировать фиксированную декартову матрицу программ:

- глубина nesting: 0–3;
- container: block / if / loop / switch / try / catch / finally;
- completion origin: try / catch / finalizer;
- pending completion: normal / return / throw / break / continue;
- finalizer completion: normal / return / throw / break / continue;
- target: nearest / outer / chained label;
- loop: for / while / do-while / for-in / lowered for-of;
- condition branches: jump taken / not taken.

Генератор должен иметь фиксированный порядок и сохранять минимальный failing source. Это даст существенно более широкое покрытие, чем десятки вручную написанных примеров.

### 8.4. Обязательные semantic fixtures

#### Labels

- unused label;
- `break` из arbitrary block;
- label на `if`, block, loop, switch;
- chained labels;
- одинаковое имя label в непересекающихся scopes;
- labelled jump из nested `if`;
- `break outer` из nested loop;
- `break outer` из `switch` внутри loop;
- `continue outer` из nested loop;
- continue каждой разновидности iteration statement;
- label на `for...of` с простым и сложным iterable expression, чтобы проверить сохранение source target после lowering;
- label внутри nested function и jump boundary между functions;
- side effects до/после jump;
- unreachable code после jump не выполняется.

#### `finally`

- normal completion;
- return из try и catch;
- actual throw из try, catch и called function;
- return/throw expression вычисляется ровно один раз и до finalizer;
- break/continue из try и catch к внешней цели;
- локальный break/continue во внутреннем loop внутри try не запускает finalizer преждевременно;
- nested finalizers выполняются inside-out;
- finalizer normal сохраняет pending completion;
- finalizer `return/throw/break/continue` заменяет каждый применимый pending completion;
- conditional abrupt completion в finalizer;
- nested try/finally внутри finalizer не стирает внешний pending completion;
- user catch не ловит служебные return/break/continue;
- optional catch binding компилируется в допустимый для target `catch (generatedName)`;
- shadowing и capture исходного catch binding не меняются из-за generated wrappers;
- regression: вложенный user catch рядом с `return` возвращает `1`, а не `2`.

#### Catch bindings

- outer variable и catch parameter имеют одинаковое имя; outer value восстанавливается/не меняется;
- одинаковые имена в nested и последовательных catches;
- catch parameter совпадает с function parameter, local `var`, block `let` и import;
- optional `catch {}`;
- closure, созданный в catch, сохраняет caught value после выхода;
- несколько closures из повторных catches получают собственные values;
- catch body выбрасывает новую ошибку, physical temporary не наблюдаем source-кодом;
- object/array destructuring catch binding либо корректно lowering-ится, либо получает явную diagnostic;
- те же проверки в bare, script и module modes.

#### Scopes/modes

- bare, script и module compile modes;
- top-level labels;
- labels внутри обычных, nested, recursive и generated descriptor functions;
- source variables, конфликтующие с каждым generated prefix;
- captured variables и block env рядом с synthetic frames;
- multiple independent transformed regions в одной функции.

### 8.5. Generated-code tests

Для representative cases нужны focused golden/snapshot assertions и code checks:

- отсутствуют `label:`, `break label`, `continue label`, `finally`;
- отсутствует служебный `throw __acValue` для return/break/continue;
- настоящий source `throw` и runtime errors по-прежнему проходят через native catch path;
- каждый native catch имеет уникальный physical parameter, не совпадающий с source bindings;
- source catch binding не материализуется как hoisted `var error = __caught`;
- для исходника без labels/finally нет completion variables и synthetic frames;
- unused label не создаёт state;
- простой безопасный loop label использует fast path;
- arbitrary block label создаёт ровно необходимую boundary;
- один affected function не получает несколько независимых основных completion records без причины;
- generated vars объявлены до первого использования во всех compile modes;
- output устойчив к текущим parser-safety passes.

Не стоит хранить огромные snapshots всего module wrapper. Лучше проверять маленькие bare-mode golden outputs плюс структурные predicates для script/module.

### 8.6. Проверка двух runtimes

#### JavaScript client

- Автоматически прогнать весь новый suite через `botest`/предоставленный `main.js`.
- Отдельно прогнать emitted code напрямую через parser, чтобы отличать parser failure от assertion failure.

#### C server

До появления автоматизированного доступа собирать один самодостаточный probe pack:

- каждая функция возвращает короткий trace;
- общий entry point склеивает results в одну строку;
- в output нет зависимостей от `botest` или runtime polyfills;
- expected string вычислена Node differential runner;
- пользователь запускает один script и возвращает одну строку либо первую ошибку.

Минимальные C milestones:

1. labels без finally;
2. jumps через один finalizer;
3. nested finalizers и override;
4. финальный combinatorial smoke pack;
5. microbenchmark только после semantic correctness.

Проверка `while (true)` внутри `try` уже пройдена (`AB`) и повторно не блокирует начало реализации.

### 8.7. Performance/output budget

Зафиксировать до оптимизаций и после:

- bytes/lines output;
- число synthetic `while (true)`;
- число generated vars;
- время compile;
- время выполнения tight loop с локальными break/continue;
- время выполнения labelled outer continue и try/finally hot path.

Предлагаемые качественные критерии:

- нулевой output overhead для файлов без labels/finally;
- unused label — нулевой runtime overhead;
- локальные control-flow paths не переводятся в state без необходимости;
- нет исключений на normal/return/break/continue paths;
- рост output линейный от числа затронутых regions, не экспоненциальный от nesting.

Числовые thresholds задать после baseline measurement, а не угадывать заранее.

## 10. Критерии готовности

Работа считается завершённой, когда одновременно выполнено следующее:

- все валидные синхронные ECMAScript labelled statements из заявленного scope компилируются;
- generated BorisScript не содержит labels и native `finally`;
- `break/continue/return` через один и несколько finalizers совпадают с Node по trace;
- finalizer override matrix проходит;
- пользовательский `catch` не видит служебные completions;
- physical catch parameters не портят одноимённые outer variables, включая captured cases;
- текущие try/catch/finally regression tests продолжают проходить;
- новые tests проходят в Node differential mode и JS BorisScript interpreter;
- согласованный C smoke pack возвращает expected trace;
- collision tests generated names проходят;
- no-op/fast-path output свойства проверяются автоматически;
- ESLint и документация больше не запрещают поддержанный код;
- новая ADR описывает модель и явно supersedes старую throw-sentinel ADR;
- весь monorepo build/lint/test зелёный.

## 11. Риски и меры

### Неверное разрешение target

Самый опасный риск: код успешно компилируется, но jump попадает в ближайший loop/switch вместо исходной label.

Мера: отдельный target resolver, identity-based tests и запрет на label syntax в output.

### Synthetic frame перехватывает нативный jump

Мера: effect analysis до rewrite; каждый вставленный frame учитывается при remapping локальных break/continue; structural tests на nearest target.

### Потеря pending completion во вложенном finalizer

Мера: явный save/reset/restore protocol и полная override matrix.

### Коллизия generated names

Мера: shared `BindingManager`, намеренно конфликтующие fixtures.

### Catch parameter живёт в общем target env

Мера: всегда использовать уникальный physical catch name; logical binding моделировать в scope analysis; captured value копировать в отдельный block env до user body.

### Раздувание output

Мера: one record per affected executable scope, unused-label elimination, доказуемые fast paths, focused metrics. Оптимизировать только после semantic baseline.

### Расхождение C и JS реализаций

Мера: генерировать консервативный общий поднабор (`var`, `if`, `while`, `break`, `continue`, `try/catch`), milestone probe packs и отсутствие зависимости от exception identity для служебного control flow.

### Тихий partial lowering

Мера: post-pass invariants должны превращать оставшийся label/finally в compile error, а не отдавать его target parser.

## 12. Документация результата

Создать ADR, например:

```text
ref/decisions/2026-10-06-structured-abrupt-completion.md
```

В ней зафиксировать:

- подтверждённые bugs двух BorisScript implementations;
- почему throw sentinel больше не используется;
- completion record и target resolution;
- save/reset/restore semantics finalizer;
- правила fast path;
- известные platform limitations;
- ссылки на differential suite и C probe pack.

В `ref/decisions/2026-03-11-try-finally-desugaring.md` поставить статус `Superseded` и ссылку на новую ADR, сохранив старый документ как историю решения.

## 13. Предлагаемая структура коммитов

Чтобы ревью не превратилось в один непрозрачный diff:

1. `test(bt-ir): capture labeled control-flow semantics`
2. `feat(bt-ir): preserve labeled statements in IR`
3. `feat(bt-ir): resolve structured control-flow targets`
4. `fix(bt-ir): normalize catch binding scopes`
5. `feat(bt-ir): lower labels through completion state`
6. `fix(bt-ir): replace try-finally throw sentinels`
7. `test(bt-ir): add differential completion matrix`
8. `perf(bt-ir): add proven control-flow fast paths`
9. `docs: record structured abrupt completion design`
10. `chore(eslint-plugin): retire try-finally control-flow warning`

Если промежуточный commit не может пройти полный E2E из-за временного IR node, он всё равно должен проходить typecheck/unit tests и не должен попадать в отдельный release.

## 14. Реализация и результаты (2026-10-07)

Рабочая ветка: `feat/issue-13-abrupt-completions`, база `4863f76`. Изменения
локальные, без commit/push. После замечания пользователя refs обновлены, уже
влитые maintenance PR не переигрываются.

### Завершённые semantic slices

- IR labels, source target ids, expanded for-of и chained aliases.
- Lexical resolver: break/continue targets, crossed finalizers, protected
  returns, invalid/duplicate labels и function boundaries.
- Shared completion pass для labels/finalizers. Старый sentinel pass удалён;
  его export оставлен deprecated alias.
- Catch normalization: identifier/optional binding, parameter/import/local
  shadowing, assignments и вызовы, captured per-entry bindings.
- Истинные lexical block scopes при usage analysis; capture только через
  function boundary, а не при любом вложенном block.
- Value-first return, native exception bridges, finalizer override и
  save/reset/restore; no sentinel exceptions на non-exceptional paths.
- Рекурсивная обработка функций под if/loop/block/try; transformed children
  больше не теряются в unaffected enclosing containers.
- No-op IR identity, unused-label elimination, native unaffected loop/switch
  regions, native unprotected returns, optional target storage, no-save
  finalizers и устранение redundant end-of-frame checks.
- Emitter assertions на surviving labels/jumps/finally и ненормализованные
  catches; walker/parenthesize сохраняют source target metadata.
- Strict deterministic Node/BS harness, regression fixtures, output budgets и
  linear AST-growth check; generated C smoke pack со встроенными expectations.
- Deprecated ESLint legacy rule исключён из recommended. ADR, constraints,
  package README, roadmap и changeset обновлены; unit gates добавлены в CI.

### Проверки и измерения

Матрица: 1800 combinations (5 pending × 5 finalizer completions × 3 origins ×
6 containers × 4 depths), плюс 23 targeted regressions. Все 1823 сравнения
прошли в bare, script и настоящем code-library module mode: 5469 строгих
Node ↔ JS BorisScript comparisons. Node oracle ошибки fail gate, а не advisory
warning. Обычный `botest --node-check` пока остаётся advisory вне нового harness.

Conservative baseline: 17.86 / 19.18 / 19.42 MB generated output для 1816 cases.
После proven fast paths и исправления indentation: 11.50 / 12.83 / 13.06 MB для
1823 cases (bare/script/module). Сокращение примерно 35%; до косметической
правки indentation было около 39%. Это intentionally large stress suite, не
размер обычного пользовательского модуля.

Последний JS прогон: compile ~2.6 / 4.2 / 3.9 s; parse+execute ~1.9 / 3.4 / 5.5 s.
Эти числа включают startup и parsing, не являются C microbenchmark. Нативные
jumps в mixed affected regions всё ещё консервативно используют state; дальнейшие
selective fast paths требуют отдельного доказательства.

Полная repo-сборка проходит с прежним non-fatal `ModuleDeclaration` warning;
lint — 0 errors и прежние 11 warnings; dependency versions согласованы.
Финальные gates: 35/35 IR/unit/output tests, 146/146 E2E tests, 36/36 Node
validation cases в labels/finalizer suites, 5/5 ESLint test files и 5469/5469
строгих differential comparisons. `format:check`, `check-versions` и
`git diff --check` проходят. После последней правки повторная сборка также прошла.

### Существенные regressions, найденные именно проверкой

1. Функция внутри блока обходила rewrite; появились surviving label/finally.
2. Unaffected loop/switch/try возвращал исходную ноду и восстанавливал label.
3. Catch, совпадающий с function parameter/import, обходил lexical lookup.
4. Bare declarations использовали source name, а usages — renamed name.
5. После no-save оптимизации finalizer throw, обработанный внешним catch,
   оставлял pending RETURN. Catch для affected body теперь сбрасывает state.
6. Сброс state в любом локальном catch стирал legitimate pending return из
   outer fast-path finalizer. Unaffected local catches теперь state не трогают.

### Явные ограничения и следующий обязательный gate

Catch patterns сейчас отклоняются с BT90016; нельзя silently потерять bindings.
Annex B labelled functions отклоняются с BT90017. Не добавляются async/generators,
iterator closing, dynamic-eval statement values или сохранение произвольных
thrown values, превращаемых платформой в BmError. Bare не получает новую closure
эмуляцию; captures тестируются в script/module.

Отдельный существующий дефект, не исправлявшийся в этом scope: вызов вида
`readCaught!()` мог lowered-иться в неверный direct descriptor call и зависать.
Captured fixture использует обычный callable без non-null assertion. Это не
failure completion pass; нужен отдельный expression-lowering regression/fix.

Первый независимый C gate: сгенерирован
`packages/bt-ir/build/semantic/BtAbruptProbe.js`, expected был `MESSAGE: OK: 38/38`.
Этот pack подтверждён на JS runtime. Последующее C-зависание и актуальный 60-case
pack описаны в разделе 15; старый файл больше не использовать. Ранее ручные
`AB` и `012` подтверждают только carrier. Подробности в `plans/probes/README.md`.
До этого нельзя объявлять подтверждённую совместимость обеих реализаций.

## 15. C comma-update regression и IR обход (2026-10-07)

Пользователь сообщил зависание в старом C pack `check27` и подозревает, что
`for(i=0;i<3;ledger.value += "U",i++)` не выполняет `i++`. Это согласуется с
бесконечным циклом, но C parser internals/version и bounded raw result пока
не получены. Нельзя обобщать это на любые comma expressions или менять runtime.

Spec slice:

1. Зафиксировать output invariant, ForBodyEvaluation order и skip/update cases.
2. Нормализовать comma-update через IR до lexical resolver, сохранив target id.
3. Проверить ordinary/labelled continue, finalizer overrides и exceptions.
4. Просмотреть output, ограничить overhead, regenerated bounded C probes.
5. Подтвердить отдельно на C; только затем объявлять совместимость.

Выбран `forUpdateDesugarPass`: init + collision-safe first-entry flag + while,
update в начале повторного входа перед условием. Discarded binary/sequence comma
разбиваются на statements; logical/conditional сохраняют short-circuit.
Value-consuming вложенные expressions переносятся целиком, не превращаются в
новый general expression-lowering backend. Simple updates/argument separators
не меняются. Emitter fail-closed на surviving comma updates.

Output review первого обхода обнаружил лишний condition-break carrier.
Completion-free prefix теперь сохраняется native с проверкой resolved targets
и crossed finalizers; suffix использует прежние frames. Никаких helper calls,
IIFE, descriptor/environment allocations или duplication cleanup не добавлено.
Альтернативы и proof obligations: [ADR](../ref/decisions/2026-10-07-safe-for-updates.md).

Добавлено 97 update cases: 22 targeted и 75 (5×5×3) completion overrides.
Матрица теперь 1920 cases / 5760 comparisons; C pack — 60 selected cases.
Два E2E fixtures отдельно проверяют continue/finally и override return →
continue/break. IR/output tests проверяют immutable/idempotent rewrite, no-op,
chained aliases, nested loops/functions, collision avoidance и size budgets.

Первая актуальная C проверка: regenerate через
`node packages/bt-ir/test/semantic/check27-diagnostic.mjs`, запустить
`packages/bt-ir/build/semantic/Check27Fixed.js` (bounded), expected
`0FU1FU2FU|E`. Затем полный `BtAbruptProbe.js`, expected `OK: 60/60`.
Diagnostic содержит raw/legacy/simple/helper/fixed для различения update defect
и carrier behavior. Содержимое старого 38-case pack не использовать повторно.

Финальные проверки обхода: 45/45 IR/unit/output tests, 148/148 E2E tests,
38/38 Node validation cases в labels/finalizer suites, 5760/5760 strict
Node ↔ JS comparisons. Repo build проходит (прежний ModuleDeclaration warning).
Stress output после native-prefix optimization: 11 971 455 / 13 363 867 /
13 613 842 bytes для 1920 cases; первый вариант обхода был на 69 880 bytes больше
в каждом mode. Разница количества cases не позволяет напрямую сравнивать общий
размер с прежней 1823-case матрицей. C benchmark пока не выполнен.

### Независимый C gate пройден (2026-10-07)

Пользователь сообщил результаты ручного выполнения на C-платформе:

- Исправленный `Check27Fixed.js`: `MESSAGE: 0FU1FU2FU|E`.
- Полный актуальный `BtAbruptProbe.js`: `MESSAGE: OK: 60/60`.

Это подтверждает обход и selected 60 bare-mode cases, закрывает обязательный C
smoke gate. Версия платформы не предоставлена. Не означает выполнения всех
1920 cases в трёх modes на C: такой exhaustive gate прошёл на supplied JS runtime.
Raw/legacy C controls и C performance measurement не получены, поэтому точная
внутренняя причина исходного comma-update зависания не объявляется доказанной.
