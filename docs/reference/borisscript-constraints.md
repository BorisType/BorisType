# Ограничения BorisType и совместимость JS/C runtime

Документ описывает выход компилятора, ограничения целевого языка и границы
известных проверок JS и C. Датированные результаты относятся к проверенным
ревизиям и конфигурациям платформы.

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

JS-проверки используют supplied `main.js`, загружаемый адаптером botest.
Исходные наблюдения октября 2026 относятся к SHA-256:
`8f999ef036db5b9d4ce9ce98b0d81709f7db265197919c2a337560fad56b5090`.
Повторные regression/expression проверки 2026-11-05 выполнены на локально
предоставленном runtime с другим SHA-256:
`7ad30901c8b58de7255a38059e0793d2def16a9768e15ef603a8ea1a5e75e09c`.
Версии обоих runtime не сообщены; тождество реализаций не предполагается.
Адаптер предоставляет файловые/платформенные функции; это не полная WebSoft HCM.

Исходный код C-интерпретатора недоступен. Исходные C-данные о compiler control flow —
пользовательские запуски: carrier probes `AB`/`012`, `Check27Fixed.js` →
`0FU1FU2FU|E`, `BtAbruptProbe.js` → `OK: 60/60`. Последний результат относится
к выбранным **60 случаям bare** в пользовательской проверке 2026-10-07.

Дополнительные server-side eval проверки числового вывода, строк и SQL проведены
2026-11-07 на Linux `websoft/hcm:2025.2.1333` / CLR 9.0.11. Они описаны в EXPR-04
и [отчёте XQuery acceptance](https://github.com/BorisType/BorisType/blob/main/refs/research/mcp/09-xquery-native.md);
это отдельные пробы, не расширение compiler control-flow gate.

| Область                                       | Supplied JS implementation                                               | Независимая C implementation                                                                |
| --------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| Labels/finalizers/comma-update после lowering | Исторический набор из 1920 случаев bare                                  | Выбранный набор bare: 60/60                                                                 |
| Исходный compound for update                  | Исходный check27 завершается                                             | Пользователь наблюдал зависание; пропуск `i++` — гипотеза, не доказанная внутренняя причина |
| Native labelled break/continue                | Парсер не сохраняет label; возможна тихая неверная интерпретация         | Native support не подтверждён; output labels не требует                                     |
| Native finally                                | `ProcessTry` запускает catch body вместо finally; trace `TC` вместо `TF` | Native semantics не аттестована; используется общий IR-обход                                |
| Arbitrary thrown value                        | Не-`BmError` превращается в `BmError`; identity теряется                 | Сохранение значения/identity не подтверждено                                                |
| Ассоциативность                               | Native `20 / 5 / 2` → `10`; `(20 / 5) / 2` → `2`                         | Для этих raw expressions данных нет; emitter сохраняет дерево скобками                      |

Отсутствие C-данных не означает ни поддержку, ни доказанный дефект. Нельзя
переносить устройство JS-парсера и его ошибки на C без отдельного воспроизведения.

## Режимы компиляции

`bare` сохраняет исходные сигнатуры функций и выдаёт прямые обращения к
свойствам и API целевой платформы. Полная поддержка замыканий, автоматических
полифилов и загрузки импортов отсутствует. Общие IR-проходы обрабатывают
управление потоком и ограничения парсера. Порядок выбора режима описан в
[справочнике](./compile-modes).

Пользовательские графы объектов могут содержать циклические ссылки.
Наблюдения на C-runtime указывают на reference counting без сборщика циклов.
JS-проверки вычислений не определяют время жизни объектов на C.

## Контракт генерируемого BorisScript

### OUT-01. Объявления, имена и тела statements

Компилятор использует `var` и выполняет hoisting переменных внутри функций.
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

### OUT-03. Сигнатуры и хост

`bare` эмитит функции с исходными именованными параметрами. Для выполнения
нужен соответствующий способ запуска на платформе и используемые кодом API хоста.
Imports в исходном TypeScript могут предоставлять типы, а исполняемые функции
должны быть доступны на платформе.

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

`??` даёт ошибку BT90003.

Raw `if`/loop/ternary conditions и unary operators не получают автоматически
одну общую JS truthiness-модель. Supplied JS допускает `if (1)`, но condition
с ordinary object может дать `Value is not effective boolean`. Для portable
code использовать boolean predicates, например
`value !== null && value !== undefined`, не `if (object)` или `!!object`.

### EXPR-03. Свойства и вызовы

Прямое чтение свойства и вызов метода используют семантику BorisScript.
Имена свойств, методы контейнеров и API платформы определяются конкретным
типом и версией runtime. TS-тип или npm-зависимость не предоставляют операцию
на платформе автоматически.

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

На Linux C-runtime HCM 2025.2.1333 подтверждены дополнительные расхождения:

- Для `var n = -1` вызовы `alert(n)`, `String(n)`, `StrInt(n)` и `"" + n`
  выводят `18446744073709551615`. При этом `n < 0` и `n + 1 == 0` истинны.
  Формат вывода числа не доказывает знак при вычислении. `EncodeJson(n)` в этой
  пробе возвращает JSON-текст `-1`; это не общий контракт всех числовых API.
- Для знакового целочисленного вывода есть отдельный
  [StrSignedInt](https://wshcm-docs.boristype.dev/news/platform/7203008530070830541.html).
  В дополнительной native-пробе `StrSignedInt(-1)` возвращает `"-1"`,
  а `StrSignedInt(-9007199254740993)` — `"-9007199254740993"` без потери цифр.
  `StrReal(-1)` также возвращает `"-1"`, но `StrReal(-9007199254740993, 0)`
  уже возвращает `"-9007199254740992"`; это не замена точному integer formatter.
  Документация [StrInt](https://wshcm-docs.boristype.dev/news/platform/7163366631179989813.html)
  явно ограничивает аргумент неотрицательными числами. Сигнатуры сверены с
  [wshcmx/types, lib/core/index.d.ts, revision a3b1e43](https://github.com/wshcmx/types/blob/a3b1e43d0b2add53bbc1f2acc2c5128360e8c97b/lib/core/index.d.ts#L252);
  точные native-значения установлены пробой, а не декларациями.
- Для `var s = "👋"` значение `StrCharCount(s)` равно 1, а `s.length` — 4.
  В проверенной C-сборке `.length` строки не является JS UTF-16 length.
  Единицы offsets/лимитов нужно определять для конкретного API.
- Прямой SQL через XQuery отдаёт `SELECT -7 AS neg` как пустое XML-поле integer:
  `HasValue=false`, `Value=null` ещё до JSON-сериализации. Это наблюдалось также
  для больших отрицательных integer. `CAST(-7 AS VARCHAR(32))` позволяет получить
  текст со знаком; в пробе отдельно подтверждено сохранение
  `CAST(-9007199254740993 AS VARCHAR(32))`. SQL `NULL` без явного типа и `''`
  оба получены как пустая строка. Полное сохранение SQL типов не обеспечивается
  самим платформенным XML/JSON путём.

Область evidence — server-side eval в временной библиотеке и PostgreSQL 16
на одной C-сборке. Supplied JS implementation, Windows HCM и другие версии
этими пробами не проверялись. Compiler coercion или SQL serializer здесь
не переделывались; детали и точные результаты — в связанном отчёте.
Существенные числовые наблюдения и три самостоятельные BS-пробы также входят
в переносимый [websoft-hcm skill](https://github.com/BorisType/BorisType/blob/main/skills/websoft-hcm/references/numbers-and-sql.md).

## Переменные, функции и итерация

### SCOPE-01. Lexical bindings и closures

`let`/`const` превращаются в physical var/env slots; analyzer переименовывает
shadowed bindings и обнаруживает captures. Runtime-enforcement const и полная
Temporal Dead Zone не эмулируются. TS может отклонить часть нарушений статически,
но это не runtime semantics.

Bare не обеспечивает общий контракт замыканий.

Наличие block-env в отдельных for-of transformations не доказывает полную
per-iteration semantics classic `for (let ...)`. Capture loop-header variable
в classic for остаётся проблемным (см. дефекты).

### FUNC-01. Функции и параметры

Компилятор преобразует обычные функции, стрелки и function expressions. Полная семантика Function objects, lexical
`this`/`arguments` у arrows, bind/call/apply, constructors/reflection не обещается.
Для таких свойств нужен отдельный test в нужном mode/runtime.

Identifier parameters поддерживаются; destructured parameters дают BT90011.
Emitter не применяет rest/default metadata.

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

### CLASS-01. Классы

Объявления классов отклоняются с BT90008. Recommended ESLint запрещает
class declarations и прямые обращения к `.prototype`.

## Labels, catch и finally

### CF-01. Синхронные abrupt completions

Реализованы arbitrary labelled statements/chained labels, lexical jump targets,
loop/switch distinction и function boundaries. Resolver определяет target до
структурного rewrite.

Source catch не должен ловить return/break/continue как исключения.
Внутреннее представление completion и причины выбора описаны в
[решении о control flow](https://github.com/BorisType/BorisType/blob/main/refs/compiler/control-flow.md).

Return expression вычисляется до RETURN. Crossed finalizers выполняются
inside-out. Normal finalizer сохраняет pending completion; abrupt finalizer
completion заменяет её. Frames не создают функций/IIFE. Unaffected native
regions могут оставаться без completion record.

Annex B `label: function f(){}` — BT90017; invalid target/duplicate active lexical
label — BT90018. Same label в независимых scopes не является active duplicate.

### EXC-01. Catch bindings и thrown values

Catch identifier получает уникальный physical parameter; shadowing не должен
портить outer parameter/import/local. Catch без binding получает generated name.
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
   без Error, включая zero iterations.
   [#28](https://github.com/BorisType/BorisType/issues/28). До исправления — один
   binding в header или отдельно спроектированный init с сохранением scope/order/captures.
2. **Runtime enum.** Declaration удаляется, `Kind.A` остаётся. Успешная компиляция
   не доказывает поддержку: non-const enum требует runtime object, которого нет.
3. **Runtime namespace.** Bare flattening и META:NAMESPACE marker не
   создают обычный объект namespace с `N.member` semantics.
4. **Optional chain в bare.** `var obj={x:1}; var result=obj?.x` принимается без
   BT Error, но даёт `result = __invalid__`. Отсутствие диагностики не является поддержкой.
5. **Bare destructuring/default/rest.** Array binding может читать необъявленный
   `__arr`; object binding — повторно вычислять initializer для разных полей;
   rest elements пропускаются. Plain emitter игнорирует default/rest parameter
   metadata. Использовать explicit reads/собственную обработку аргументов.
6. **Порядок вычисления сложных выражений.** Перенос промежуточных вычислений
   перед statement может менять ленивость, порядок и частоту вычисления.
   Для зависимых от порядка вычислений полезны явные локальные переменные и блоки.
7. **Type wrappers в expression/call.** `as`/non-null assertions не валидируют runtime value;
   satisfies/angle-bracket assertions не имеют универсального erase во всех
   visitors (standalone `1 satisfies number` даёт BT90001).
8. **Precision normalization hex с E/e.** Detector fractional/exponential literal
   проверяет наличие E/e до определения hex prefix. Поэтому
   `0xEEEEEEEEEEEEEEEE` даёт decimal output `17216961135462248000`, вместо
   точного текста `17216961135462248174`. Эмиттер не может восстановить уже
   потерянный raw. Большие hex integers с E/e не входят в precision guarantee;
   это отдельный compiler defect, не доказанное расхождение арифметики C.
9. **Недостаточный rejection.** Async/generator modifiers,
   `$` identifiers и другие формы могут терять семантику без Error. Таблица
   diagnostics ниже не является полным source validator.
10. **Dynamic switch cases.** Supplied JS BS parser требует literal в `case`:
    `case key:` даёт `Literal value expected in 'case' statement`. Lowering
    пока оставляет expression cases нативными; успешная TS/BT компиляция не
    гарантирует execution. Данные C отсутствуют. До semantic switch lowering
    использовать literal cases либо явно спроектированный if chain, учитывая
    once-only discriminant, lazy case expressions и fall-through.

## Диагностики и integration API

| Код           | Условие                                                                            |
| ------------- | ---------------------------------------------------------------------------------- |
| BT90001       | Unhandled expression: await/yield, bigint/regexp literals, некоторые type wrappers |
| BT90003       | `??` в bare — Error                                                                |
| BT90006       | Неразбираемый binding в определённом visitor, не rejection всех patterns           |
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

При прямом использовании bt-ir сверяйтесь с его package README. Внутренний
порядок passes, shared analysis state и compatibility aliases описаны в
[compiler pipeline](https://github.com/BorisType/BorisType/blob/main/refs/compiler/pipeline.md);
CLI применяет этот pipeline самостоятельно.

## Проверка переносимости и обновление правил

Из корня после build и подключения approved JS runtime:

```bash
pnpm --filter @boristype/bt-ir --filter @boristype/eslint-plugin test
pnpm test
pnpm test:semantic
```

Датированные результаты и их область действия приведены в
[compiler verification](https://github.com/BorisType/BorisType/blob/main/refs/compiler/verification.md).

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
- [Structured completion ADR](https://github.com/BorisType/BorisType/blob/main/refs/decisions/2026-10-07-structured-abrupt-completion.md), [C-safe updates ADR](https://github.com/BorisType/BorisType/blob/main/refs/decisions/2026-10-07-safe-for-updates.md).
- [Numeric literal ADR](https://github.com/BorisType/BorisType/blob/main/refs/decisions/2026-03-30-numeric-literal-precision.md), [IR architecture](https://github.com/BorisType/BorisType/blob/main/refs/compiler/pipeline.md).
- [Pre-merge/C probes](https://github.com/BorisType/BorisType/blob/main/refs/research/compiler-control-flow/probes/README.md), [implementation plan](https://github.com/BorisType/BorisType/blob/main/refs/compiler/control-flow.md).

При расхождении исторического ADR/комментария с текущим output документ фиксирует
наблюдаемое состояние, не объявляет прошлое намерение реализованной гарантией.
