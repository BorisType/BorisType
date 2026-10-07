# Ограничения BorisType и совместимость JS/C runtime

Состояние на 2026-10-07, после merge PR #27 (`fa493a2`). Документ описывает
текущий контракт транспиляции, ограничения целевого языка и известные
расхождения. Это не заявление о полной совместимости с ECMAScript.

## Область действия и терминология

Необходимо различать три уровня:

1. **Исходный TypeScript** — синтаксис frontend и ожидаемая JS-семантика.
2. **BorisType** — scope analysis, lowering, IR passes, emitter и `@boristype/runtime`.
3. **BorisScript runtime** — JS-интерпретатор либо независимая C-реализация платформы. Один output может выполняться по-разному.

Статусы правил:

- **Реализовано** — есть преобразование и проверки конкретного subset, не всех комбинаций.
- **Ограничено** — реализована часть семантики либо нужен определённый mode/тип значения.
- **Отклоняется** — есть Error diagnostic; output не должен генерироваться.
- **Известный дефект** — исходник может быть принят, но output некорректен. Это не допустимая альтернативная семантика.
- **Не проверено на C** — отдельного C-подтверждения нет, даже если JS gate проходит.

`success: true`, отсутствие TS errors и прохождение ESLint по отдельности не
доказывают семантическую корректность. Некоторые unsupported forms сейчас
пропускаются, дают Warning или превращаются в placeholder.

## Основания и границы подтверждения

JS-проверки используют supplied `main.js`, загружаемый адаптером botest. Версия
runtime не сообщена; SHA-256:
`8f999ef036db5b9d4ce9ce98b0d81709f7db265197919c2a337560fad56b5090`.
Адаптер предоставляет файловые/платформенные функции; это не полная WebSoft HCM.

Исходный код C-интерпретатора и его версия недоступны. Подтверждённые C-данные —
пользовательские запуски: carrier probes `AB`/`012`, `Check27Fixed.js` →
`0FU1FU2FU|E`, `BtAbruptProbe.js` → `OK: 60/60`. Последний результат относится
к выбранным **60 bare cases**, не к полной матрице, script/module, всем
возможностям runtime или всем версиям платформы.

| Область                                       | Supplied JS implementation                                               | Независимая C implementation                                                                |
| --------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| Labels/finalizers/comma-update после lowering | Strict Node ↔ JS: 1920 cases × 3 modes = 5760 сравнений                  | Selected bare pack: 60/60; full three-mode gate не выполнялся                               |
| Исходный compound for update                  | Исходный check27 завершается                                             | Пользователь наблюдал зависание; пропуск `i++` — гипотеза, не доказанная внутренняя причина |
| Native labelled break/continue                | Парсер не сохраняет label; возможна тихая неверная интерпретация         | Native support не подтверждён; output labels не требует                                     |
| Native finally                                | `ProcessTry` запускает catch body вместо finally; trace `TC` вместо `TF` | Native semantics не аттестована; используется общий IR-обход                                |
| Arbitrary thrown value                        | Не-`BmError` превращается в `BmError`; identity теряется                 | Сохранение значения/identity не подтверждено                                                |
| Ассоциативность                               | Native `20 / 5 / 2` → `10`; `(20 / 5) / 2` → `2`                         | Для этих raw expressions данных нет; emitter сохраняет дерево скобками                      |
| Closures/classes/polyfills                    | Есть JS E2E для отдельных форм                                           | C smoke не подтверждает целиком эти подсистемы                                              |

Отсутствие C-данных не означает ни поддержку, ни доказанный дефект. Нельзя
переносить устройство JS-парсера и его ошибки на C без отдельного воспроизведения.

## Compile modes

Режим меняет не только размер output, но и семантическую инфраструктуру.

| Механизм                          | `bare`                                              | `script`                                                                        | `module`                                            |
| --------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------- |
| Функции                           | Plain signature, исходные параметры                 | `__env`, `__this`, `__args`, descriptors                                        | Та же ABI; library/ref descriptors                  |
| Captured bindings                 | Общая эмуляция closures отключена                   | Environment objects                                                             | Environment objects                                 |
| Properties/вызовы                 | В основном native BS                                | `bt.getProperty`/`bt.setProperty`/`bt.callFunction`, кроме специальных accesses | Как в script                                        |
| Polyfills                         | Автоматическая подстановка отключена                | Подстановка поддерживаемых типов/методов                                        | Как в script                                        |
| `&&`, `\|\|`, `??`                | Native `&&`/`\|\|`; `??` — BT90003 Error            | Operand-valued lowering через conditional/temporaries                           | Как в script                                        |
| `?.`                              | Не поддерживается; возможен `__invalid__` без Error | Частичный optional-chain lowering                                               | Как в script                                        |
| Imports/exports                   | Imports удаляются, стандартной module semantics нет | Собственный import runtime, без module export ABI                               | Require/exports и `__init(__codelibrary, __module)` |
| Control-flow/parser-safety passes | Выполняются                                         | Выполняются                                                                     | Выполняются                                         |

`bare` не означает «полная JS-семантика без runtime». `script`/`module` не
обеспечивают все возможности JS или его стандартную библиотеку.

Выбор режима в **btc**: `/// @bt-mode` → `.test.ts`/executable object → CLI option
→ `module`. Прямые API bt-ir используют `options.mode`, не применяя автоматически
правила выбора btc. См. [режимы компиляции](./compile-modes).

## Контракт генерируемого BorisScript

### OUT-01. Объявления, имена и тела statements

Output использует `var`. В script/module hoist заменяет повторные объявления
присваиваниями; в bare это выполняется внутри функций, но не на top-level.
Bare top-level `var x=1; var x=2` сохраняется как два объявления и может успешно
скомпилироваться, хотя supplied JS отвергает повторный native var в одном scope:
`Variable x already declared`. В bare не повторять top-level declarations.
Нативный захват локальной переменной после возврата внешней функции не обеспечивает
JS closures; bare не должен полагаться на него.

Для portable identifiers использовать `[A-Za-z_][A-Za-z0-9_]*`, исключая reserved
words. `$` не распознаётся scanner supplied JS. BorisType оставляет `var $x = 1`
без Error; автоматического sanitization в `__dollar__` нет. Unicode identifier
compatibility на C не установлена.

Loop/condition bodies эмитятся блоками. Пустое тело — `{}`, не `while (false);`:
последняя форма отвергается supplied JS и вызвала синтаксическую ошибку в
пользовательской C-проверке. Служебные escape frames используют
`while (true) { ...; break; }`, не empty loop statements.

### OUT-02. Исключённый синтаксис

Перед emitter должны быть устранены:

- `LabeledStatement`, `break label`, `continue label`;
- native `finally`;
- unnamed catch — каждый native catch имеет identifier parameter;
- comma operators на любой глубине классического `for` update.

Emitter проверяет эти invariants и отказывается генерировать surviving forms.
Supplied JS требует `catch (identifier)` после native try. Исходные `try/finally`
и `catch {}` получают подходящий generated catch.

Эти assertions защищают конкретные invariants, не валидируют весь output
на каждой версии обеих платформ.

### OUT-03. ABI, runtime и internal accesses

В script/module source function value обычно представлен descriptor object,
не native ECMAScript Function. Нужны согласованные compiler/runtime ABI и
initialization. Generated module не является Node CJS/ESM; запуск output в
обычном Node не проверяет его выполнение в BorisScript.

Native platform APIs, XML-типы и internal identifiers могут обходить wrappers.
Не использовать `__env`, `__this`, `__args`, descriptor fields как публичный JS API.
Имена с префиксом `__` имеют специальные native-access fast paths; не выбирать
их для бизнес-объектов. Collision-safe control-flow names не означают sanitization
всех identifiers. Npm dependency/TS types не гарантируют наличие host APIs.

## Выражения, значения и порядок вычисления

### EXPR-01. Приоритет, ассоциативность и parser safety

Нельзя описывать оба runtime правилом «всё вычисляется слева направо».
В supplied JS `2 + 3 * 4` → `14`, но native цепочка делений выше ассоциируется
справа. BorisType ставит скобки по IR-дереву/source associativity:
compiled `20 / 5 / 2` даёт `2` на supplied JS.

Conditional/sequence expressions и сложные элементы comma-separated lists
проходят parser-safety transformations: parenthesize, comma safety, cleanup
grouping, literal extraction. Commas между arguments/object properties/array
elements — не comma operators.

Native property/method access у literal/grouped receiver имеет ограничения.
`obj.key` и `(expr).key` нельзя считать одной поддерживаемой формой: chain parser
не эквивалентен ECMAScript. Literal receivers при необходимости выносятся во
временные переменные. Для ручного BS сначала присвоить receiver переменной;
это не требование вручную расставлять скобки во всём TS.

Expression extraction — не общая linearization с доказанным сохранением
side effects во всех контекстах. Известное нарушение laziness описано ниже.

### EXPR-02. Boolean contexts и logical operators

Native `&&`/`||` supplied JS требуют boolean operands и не возвращают JS operand
values; `1 || 2` даёт `Value is not boolean`. В bare использовать boolean
expressions, не `value || default`.

Script/module используют `bt.isTrue` и возвращают исходный operand/выбранную RHS.
Helper считает falsy `false`, `0`, `""`, `null`, `undefined`. Это не полная
аттестация ECMAScript ToBoolean, включая NaN и host values. `??` проверяет
null/undefined, не общую falsiness.

Raw `if`/loop/ternary conditions и unary operators не получают автоматически
одну общую JS truthiness-модель. Supplied JS допускает `if (1)`, но condition
с ordinary object может дать `Value is not effective boolean`. Для portable
code использовать boolean predicates, например
`value !== null && value !== undefined`, не `if (object)` или `!!object`.

### EXPR-03. Properties, prototypes и polyfills

`bt.getProperty` смягчает часть native differences: missing property может дать
`undefined`; read у `null`/`undefined` остаётся ошибкой. Это не универсальный
«безопасный доступ» и не подавление exceptions.

Runtime реализует отдельные array/string/number/object operations и свою
prototype-chain convention. Method descriptor может копироваться/bind-иться
к receiver при чтении. Нельзя переносить гарантии JS property descriptors,
accessors, function identity, method extraction и reflection на эти wrappers.

Native host method/polyfill проверяется по конкретному типу, методу и версии.
Общая стандартная JS-библиотека не реализована. Node/browser APIs, Map/Set,
Symbol, Proxy/Reflect, Weak collections и Promise нельзя считать доступными
по одному лишь наличию types/imports.

### EXPR-04. Числа и строки

Numeric literal separators удаляются; hex/octal/binary нормализуются в decimal
text. Decimal integer text сохраняется в `raw`, который использует emitter;
вспомогательный Node BigInt не попадает в output. Это intended precision path,
не гарантия всех форматов: обнаруженный hex/E дефект описан ниже. Literal `1n`
не поддерживается (BT90001).

Сохранение текста большого integer не гарантирует одинаковую арифметику Node
Number и platform integer/real, overflow, bitwise operations, NaN/Infinity или
negative zero на JS/C. Для точной переносимой integer arithmetic не выходить
за `Number.MAX_SAFE_INTEGER` без отдельного платформенного контракта/тестов.

Template expressions превращаются в concatenation. Полная JS coercion-модель,
tagged templates, Unicode indexing и все string/regexp APIs не обещаются.
Regex literal `/pattern/` не lowering-ится (BT90001).

## Переменные, функции и итерация

### SCOPE-01. Lexical bindings и closures

`let`/`const` превращаются в physical var/env slots; analyzer переименовывает
shadowed bindings и обнаруживает captures. Runtime-enforcement const и полная
Temporal Dead Zone не эмулируются. TS может отклонить часть нарушений статически,
но это не runtime semantics.

В script/module captures хранятся в environment chain; per-call env создаётся
при необходимости. Catch получает lexical binding и per-entry captured env.
Bare не обеспечивает общий closure contract.

Наличие block-env в отдельных for-of transformations не доказывает полную
per-iteration semantics classic `for (let ...)`. Capture loop-header variable
в classic for остаётся проблемным (см. дефекты).

### FUNC-01. Функции и параметры

Обычные функции/arrows/function expressions lowering-ятся; поддерживаемые
capture scenarios имеют тесты. Полная семантика Function objects, lexical
`this`/`arguments` у arrows, bind/call/apply, constructors/reflection не обещается.
Для таких свойств нужен отдельный test в нужном mode/runtime.

Identifier parameters поддерживаются; destructured parameters дают BT90011.
Rest в script/module извлекается из `__args` через array helper. Bare plain
emitter не реализует rest/default metadata. Script/module defaults имеют
известное отличие для explicit undefined.

Async/await, generators/yield и suspension/continuations не поддерживаются.
Recommended ESLint запрещает async/generator declarations. Нельзя полагаться
только на compiler rejection: `async function f(){return 1}` и пустой
`function* f(){}` могут превратиться в synchronous function. Await/yield дают
BT90001, но удаление modifier без expression также теряет семантику.

### ITER-01. for...in и for...of

Native BS for-in по массиву перечисляет **значения**, не JS index keys.
В supplied JS `var item; for (item in [10, 20]) { ... }` даёт `10`, `20`.
Исходный for-in не превращается в общую JS key enumeration; порядок и host/XML
object behavior зависят от платформы.

For-of lowering использует native value iteration. Подтверждённый базовый случай
— массив с identifier binding; это не общий ECMAScript iterator protocol.
Custom iterators, Symbol.iterator, iterator return()/IteratorClose и for-await-of
не поддерживаются. Destructured loop bindings не имеют полного lowering и не
входят в portable subset.

### CLASS-01. Классы и наследование

Class declaration в bare — BT90008. Script/module имеют **частичный** lowering
в constructor/method descriptors и prototype objects. Named instance methods,
explicit constructor, простые property initializers, отдельные extends/super
scenarios покрыты JS E2E. «BorisType вообще не поддерживает классы/прототипы»
— неверное описание.

Полная class semantics не реализована: accessors, static/private members,
computed names, decorators, class expressions, parameter properties и сложная
derived-constructor initialization не входят в подтверждённый контракт.
Getter/setter members пропускаются; static field может стать instance initializer
без Error.

Recommended ESLint всё ещё запрещает class declarations и direct `.prototype`
access. Partial lowering не разрешает эти формы в recommended subset. Если
правила ослаблены, проект должен проверить конкретные scenarios сам. Полной
отдельной C-проверки classes нет.

## Labels, catch и finally

### CF-01. Синхронные abrupt completions

Реализованы arbitrary labelled statements/chained labels, lexical jump targets,
loop/switch distinction и function boundaries. Resolver определяет target до
структурного rewrite.

Affected scope использует completion record: `NORMAL=0`, `RETURN=1`, `THROW=2`,
`BREAK=3`, `CONTINUE=4`, с optional value/target slots. Non-exceptional jumps
переносятся через ordinary break/state checks. Source catch не должен ловить
return/break/continue.

Return expression вычисляется до RETURN. Crossed finalizers выполняются
inside-out. Normal finalizer сохраняет pending completion; abrupt finalizer
completion заменяет её. Frames не создают функций/IIFE. Unaffected native
regions могут оставаться без completion record.

Annex B `label: function f(){}` — BT90017; invalid target/duplicate active lexical
label — BT90018. Same label в независимых scopes не является active duplicate.

### EXC-01. Catch bindings и thrown values

Catch identifier получает уникальный physical parameter; shadowing не должен
портить outer parameter/import/local. Catch без binding получает generated name.
Captured catch binding в script/module получает новое значение при каждом входе.
Catch patterns дают BT90016: использовать identifier и поддерживаемое
destructuring в body либо explicit property reads.

Source throw/runtime errors идут по native exception path. Supplied JS превращает
не-BmError в BmError; rethrow может добавить stack entry. Не требовать
`caught === original`, primitive type, Error subclass, всех properties или
Node stack trace. Эти гарантии на C также не подтверждены. IR не восстанавливает
arbitrary thrown-value identity.

Direct eval/statement completion values, dynamic control targets, general
iterator closing и async finalization не входят в CF-01. Контракт правильных
finalizers относится к **compiled output**, не к native finally.

### CF-02. C-safe for update

Comma-containing classic for update до resolver преобразуется в init prelude,
first-entry flag и while. Верхнеуровневые discarded sequences разделяются
слева направо. После первого entry update выполняется перед condition, после
source finalizers.

- Normal body/continue выполняют update один раз.
- Break/return/throw пропускают update, если итоговая completion не заменена на continue.
- Exception в update прекращает оставшиеся действия и следующий condition.
- Simple update и commas аргументов не требуют rewrite.

Value-consuming subexpressions (`i = (effect(), i + 1)`) сохраняются вне header.
General comma linearization не реализована. Обход конкретного C header-дефекта
не доказывает корректность comma во всех других C contexts.

Цена — scalar flag и branch на affected loop entry, без helper function,
descriptor/env или копирования finalizer. C microbenchmark не проводился;
JS wall time не является C benchmark.

## Известные дефекты и небезопасные исходные формы

Это compiler/lowering defects: выбор другого runtime не восстановит уже
потерянную семантику output.

1. **Несколько declarations в classic for init.** `for (var i=0, j=10; ...)`
   сохраняет лишь первое объявление. Остальные initializer/side effects теряются
   без Error, включая zero iterations. Подтверждено во всех modes;
   [#28](https://github.com/BorisType/BorisType/issues/28). До исправления — один
   binding в header или отдельно спроектированный init с сохранением scope/order/captures.
2. **Runtime enum.** Declaration удаляется, `Kind.A` остаётся. Успешная компиляция
   не доказывает поддержку: non-const enum требует runtime object, которого нет.
3. **Runtime namespace.** Script/module пропускают body с BT90007 **Warning**;
   success может остаться true. Bare flattening и META:NAMESPACE marker не
   создают обычный объект namespace с `N.member` semantics.
4. **Optional chain в bare.** `var obj={x:1}; var result=obj?.x` принимается без
   BT Error, но даёт `result = __invalid__`. Отсутствие диагностики не является поддержкой.
5. **Bare destructuring/default/rest.** Array binding может читать необъявленный
   `__arr`; object binding — повторно вычислять initializer для разных полей;
   rest elements пропускаются. Plain emitter игнорирует default/rest parameter
   metadata. Использовать explicit reads/собственную обработку аргументов.
6. **Default при explicit undefined.** `function f(x=7){return x}` в script:
   `f()` → `7`, `f(undefined)` → `undefined`, вместо JS `7`. Emitter проверяет
   длину args, не значение. Bare defaults не применяет. Проверка `x === undefined`
   в body может служить локальным обходом, но не полной parameter-environment эмуляцией.
7. **Short-circuit с extracted RHS.** Script `false && make()?.x` может вызвать
   make до LHS check: RHS conditional выносится в pending statements. Счётчик
   должен остаться `0` в Node, compiled JS-runtime даёт `1`. Logical tests не
   аттестуют все combinations optional chain/extraction/side effects. Обход —
   explicit if с вычислением RHS только в выбранном block.
8. **Classic for header captures.** `for (let i=0; ...){callbacks.push(()=>i)}`
   не обеспечивает все per-iteration bindings. Принятый script probe при вызове
   callbacks дал `Unknown object property: i`, не JS `0/1/2`. Generic closure
   support не доказывает корректность header capture; обход тоже требует test.
9. **Type wrappers в expression/call.** `fn!()` может обойти descriptor call
   lowering и дать неверный native call в script/module. Это прежний дефект,
   не completion pass. `as`/non-null assertions не валидируют runtime value;
   satisfies/angle-bracket assertions не имеют универсального erase во всех
   visitors (standalone `1 satisfies number` даёт BT90001).
10. **Precision normalization hex с E/e.** Detector fractional/exponential literal
    проверяет наличие E/e до определения hex prefix. Поэтому
    `0xEEEEEEEEEEEEEEEE` даёт decimal output `17216961135462248000`, вместо
    точного текста `17216961135462248174`. Эмиттер не может восстановить уже
    потерянный raw. Большие hex integers с E/e не входят в precision guarantee;
    это отдельный compiler defect, не доказанное расхождение арифметики C.
11. **Недостаточный rejection.** Async/generator modifiers, отдельные class members,
    `$` identifiers и другие формы могут терять семантику без Error. Таблица
    diagnostics ниже не является полным source validator.

## Диагностики и integration API

| Код           | Условие                                                                            |
| ------------- | ---------------------------------------------------------------------------------- |
| BT90001       | Unhandled expression: await/yield, bigint/regexp literals, некоторые type wrappers |
| BT90003       | `??` в bare — Error                                                                |
| BT90006       | Неразбираемый binding в определённом visitor, не rejection всех patterns           |
| BT90007       | Namespace в script/module — Warning; body не генерируется                          |
| BT90008       | Class declaration в bare — Error                                                   |
| BT90009       | Unhandled statement                                                                |
| BT90010       | Computed object literal key                                                        |
| BT90011       | Destructured function parameter                                                    |
| BT90013/14/15 | Pass/emitter/transformation failure                                                |
| BT90016       | Destructured catch binding                                                         |
| BT90017       | Annex B labelled function                                                          |
| BT90018       | Invalid target / duplicate active lexical label                                    |

`compile()` собирает TS и BT diagnostics; `compileSourceFile()` — только BT diagnostics,
TS checks выполняет вызывающий btc/consumer. BT90018 сохраняет source range;
без source/loc — positionless fallback. Error даёт `success: false`, `outputs: []`;
Warning не обязан блокировать output.

Custom pipeline использует shared `PassContext.bindings` из analysis/lowering.
Порядок: for-update-desugar → abrupt-completion-desugar → parenthesize → comma
safety → cleanup grouping → literal extract → hoist. `runPasses()` проверяет
dependency completion pass, прекращает следующие passes после новых Error
diagnostics. При прямых `.run()` calls consumer обеспечивает порядок/checks сам.
`tryFinallyDesugarPass` — deprecated alias, не старый throw-sentinel pass.

## Проверка переносимости и обновление правил

Из корня после build и подключения approved JS runtime:

```bash
pnpm --filter @boristype/bt-ir --filter @boristype/eslint-plugin test
pnpm test
pnpm test:semantic
```

После PR #27: 55 IR/output tests, 148 E2E, 38 advisory Node validations и 5760
strict control-flow/update comparisons. Это не full language/platform coverage
и не C execution. Новые probes документа не расширяют ранее запущенный C pack.

Проверять counts/failures, не только exit status: botest допускает false-green
с 0 tests при неизвестном filter ([#30](https://github.com/BorisType/BorisType/issues/30)).
Advisory Node check не заменяет strict gate. Execution CI gates требуют approved
runtime provisioning ([#29](https://github.com/BorisType/BorisType/issues/29)).

При расширении правила фиксировать source, mode, expected Node result/trace,
output, compiler commit, runtime version/hash и actual result обеих реализаций.
Potentially unbounded C probe ограничивать счётчиком шагов. JS success не отменяет
C gate при изменении target shape. Supplied runtime нельзя публиковать без прав.

## Источники реализации

- [ModeConfig](https://github.com/BorisType/BorisType/blob/main/packages/bt-ir/src/lowering/mode-config.ts), [lowering](https://github.com/BorisType/BorisType/tree/main/packages/bt-ir/src/lowering), [diagnostics](https://github.com/BorisType/BorisType/blob/main/packages/bt-ir/src/pipeline/diagnostics.ts).
- [Runtime semantic helpers](https://github.com/BorisType/BorisType/blob/main/packages/builtin-runtime/src/semantic.ts), [recommended ESLint](https://github.com/BorisType/BorisType/blob/main/packages/eslint-plugin/src/index.ts).
- [Structured completion ADR](https://github.com/BorisType/BorisType/blob/main/ref/decisions/2026-10-07-structured-abrupt-completion.md), [C-safe updates ADR](https://github.com/BorisType/BorisType/blob/main/ref/decisions/2026-10-07-safe-for-updates.md).
- [Numeric literal ADR](https://github.com/BorisType/BorisType/blob/main/ref/decisions/2026-03-30-numeric-literal-precision.md), [IR architecture](https://github.com/BorisType/BorisType/blob/main/ref/architecture/ir-pipeline.md).
- [Pre-merge/C probes](https://github.com/BorisType/BorisType/blob/main/plans/probes/README.md), [implementation plan](https://github.com/BorisType/BorisType/blob/main/plans/issue-13-labeled-statements.md).

При расхождении исторического ADR/комментария с текущим output документ фиксирует
наблюдаемое состояние, не объявляет прошлое намерение реализованной гарантией.
