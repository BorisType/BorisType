# Pipeline и контракты IR

Сверено с source 2026-11-11. Это устройство существующей реализации; развитие
script/module остаётся [замороженным](../decisions/2026-11-05-script-module-memory-freeze.md).
Текущее направление — bare. Частичная реализация функции не означает полную JS
семантику: [findings](findings.md), [область исследования](../research/compiler-semantics/scope.md).

## Entrypoints и диагностика

[Pipeline](../../packages/bt-ir/src/pipeline/index.ts) имеет два основных пути:

| API                                         | Что получает и проверяет                                                                                                                          |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `compile(source, options)`                  | Создаёт virtual CompilerHost/Program/TypeChecker, собирает TS diagnostics (кроме node_modules), затем BT diagnostics; default filename `input.ts` |
| `compileSourceFile(file, program, options)` | Использует переданный Program/TypeChecker; собирает **только BT diagnostics**. TS diagnostics собирает вызывающий consumer                        |
| `compileFile(path, options)`                | Читает файл и делегирует `compile`; не заменяет project build/import resolution                                                                   |

Оба основных пути выбирают `options.mode ?? "module"`, анализируют scopes и
запускают одинаковый lowering/pass/emitter pipeline. `compile` формирует output
path из filename либо `output.js`; `compileSourceFile` учитывает `outputPath`,
затем filename/SourceFile filename. Для project integration нужен второй путь.
`debugIR` печатает raw IR перед passes; возвращаемый `ir` после passes доступен
при `debugIR`. Это разные точки наблюдения.

Lowering, passes и emitter имеют отдельные error boundaries: ошибки получают
BT90015/90013/90014 соответственно. Diagnostics используют `ts.Diagnostic`,
единый формат с TypeScript и CLI reporter; старый проект `warnings: string[]`
не реализован. Error означает `success: false`, `outputs: []`. Warning этого
не требует. Pass manager останавливается после **новых** Error diagnostics
текущего pass; прежние TS errors не теряются. Анализ scopes находится перед
lowering boundary, поэтому это не универсальная защита от любого exception.

[bt-cli compiler](../../packages/bt-cli/src/core/building/compiler.ts) создаёт
Program и собирает TS diagnostics, фильтрует declaration/node_modules files,
вызывает `compileSourceFile`, выбирает executable/file modes, пишет output.
При `declaration` tsc получает `emitDeclarationOnly` и `noEmitOnError`, иначе
`noEmit`. Один Program используется для диагностики, BT emit и `.d.ts`; watch
сохраняет стандартный declaration emit в `afterProgramCreate`. Отдельный Program,
subprocess `tsc` и writeFile-фильтр отклонены как лишние память/parse/spawn/watch
издержки. Наличие кода не аттестует watch/linking/multi-package declarations:
это отдельные integration checks, не выполненные документальной миграцией.

## Данные между этапами

```text
TS Program / TypeChecker
  → analyzeScopes + shared BindingManager
  → transformToIR (TS AST → raw IR)
  → for-update-desugar
  → abrupt-completion-desugar
  → parenthesize → comma-safety → cleanup-grouping → literal-extract
  → hoist
  → emit (IR → BorisScript text)
```

[Scope analyzer](../../packages/bt-ir/src/analyzer/scope-analyzer.ts) сначала
резервирует source identifiers, собирает scopes/declarations и физические
переименования, разрешает var/let conflicts, затем usages/captures и env depth.
Capture означает переход через function boundary; вложенный block сам по себе
не создаёт closure capture. Catch имеет lexical binding и отдельное physical name.
`renamedTo` и declaration scope важнее исходного spelling при доступе к binding.

[VisitorContext](../../packages/bt-ir/src/lowering/visitor.ts) содержит TypeChecker,
SourceFile, ScopeAnalysis, ModeConfig, shared diagnostics/bindings/helperFlags,
function parameters, env scope/reference, import bindings и control-target IDs.
Child contexts должны делить allocator/diagnostics/target identity, но иметь
правильные function/scope/pending boundaries. [Env resolution](../../packages/bt-ir/src/lowering/env-resolution.ts)
строит доступ по фактическому scope: `resolveEnvAccess`, `resolveModuleLevelAccess`,
`getModuleEnvDepth`. Не вычисляй `__parent` по одной syntactic глубине.

[IR nodes/builders](../../packages/bt-ir/src/ir/) разделяют statements, обычные
expressions, env access/declarations, runtime/polyfill calls и module operations.
Используй реальные builders из `builders.ts`: исторические `IR.bin/func/lit`
примеры не являются API. `SourceLocation` нужно переносить через rebuild,
как и `controlTargetId` loops/switch/expanded for-of/chained labels. Catch
physical name не является обычным hoisted VarDecl.

## Lowering или pass

Новая TS-конструкция, TS type decision (XML/polyfill), optional token или исходный
SourceFile/TypeChecker анализ относятся к [lowering](../../packages/bt-ir/src/lowering/).
Преобразование уже существующего IR относится к [passes](../../packages/bt-ir/src/passes/).
Emitter сериализует подготовленное IR и отклоняет небезопасные survivors;
обычный TS lowering туда не переносится. PassContext уже имеет optional SourceFile
для диагностики, поэтому старое «passes не имеют доступа к source» устарело.
TypeChecker/общий type-aware IR остаются unscheduled (варианты в [proposals](proposals.md)).

[PassContext/IRPass](../../packages/bt-ir/src/passes/types.ts) требуют shared
`bindings`, diagnostics и optional sourceFile. `dependsOn` проверяет, что
зависимость уже выполнена, а не автоматически сортирует passes.
[runPasses](../../packages/bt-ir/src/passes/index.ts) добавляет имя pass к exception
и прекращает дальнейшие passes после новых Errors. Прямой `.run()` не проверяет
manager ordering: ответственность у вызывающего кода.

| Pass                        | Причина позиции и invariant                                                                                                  |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `for-update-desugar`        | До lexical target resolution: comma update превращается в first-entry while с сохранением source target; simple update no-op |
| `abrupt-completion-desugar` | Требует update pass. Разрешает targets, преобразует labels/finalizers; invalid targets — отдельные BT90018 с source range    |
| `parenthesize`              | Требует abrupt completion; сохраняет grouping на IR expressions, введённых предыдущими passes                                |
| `comma-safety`              | После parenthesize; parser context normalization, не восстановление потерянного source order                                 |
| `cleanup-grouping`          | После comma-safety; убирает target-неприемлемые grouping contexts                                                            |
| `literal-extract`           | После cleanup; извлекает literal/array MemberExpression receivers. Hygiene/effect-placement долг сохраняется (R22/H03)       |
| `hoist`                     | Требует abrupt completion; обрабатывает также созданные предыдущими passes vars; последнее место задаётся pipeline           |

[Walker](../../packages/bt-ir/src/passes/walker.ts) имеет отдельные
`mapStatements`, `mapExpression`, `forEachStatement`. Statement traversal по
умолчанию не входит в functions; expression children statements он автоматически
не переписывает. Наличие `mapExpression` не означает unified `mapIR`.
No-op сохраняет identity там, где pass это гарантирует; rewrites не должны
мутировать вход. Генерального verifier между каждым pass пока нет.

## ModeConfig и ABI

[ModeConfig](../../packages/bt-ir/src/lowering/mode-config.ts) — независимые
свойства режима, а не лицензия включать любой экспериментальный набор flags.
Для конкретного поведения используй `ctx.config.*`.

| Свойство                                        | bare  | script | module |
| ----------------------------------------------- | ----- | ------ | ------ |
| property/call wrapping, `useBtIsTrue`, env/desc | false | true   | true   |
| `useRefFormat`                                  | false | false  | true   |
| `moduleExports`                                 | false | false  | true   |
| `usePolyfills` preset                           | false | true   | true   |

`usePolyfills` сейчас не читается dispatch-кодом; фактический выбор опирается на
TypeChecker/getPolyfillType. Это reserved flag, а не подтверждённый независимый
switch. Factory возвращает Readonly preset; runtime freeze здесь не выполняется.
Hoist режим определяется IR `noHoist`/plainSignature, отдельный `hoistFunctions`
flag не вводился. Bare visitors оставлены отдельным fast path: plain параметры
и child contexts существенно отличаются от env/desc ABI; merge усложнял visitors.

В script/module функция представляется descriptor с `env`, `obj` и `callable`
либо module `lib/ref`. Captured bindings живут в env slots; per-call env нужен
для изоляции повторных вызовов/рекурсии. Method receiver может хранить backlink.
Это механизмы частичного subset, не general closures или JS reflection. Сильные
циклы env/descriptor/receiver — причина memory freeze. Bare не добавляет их
эмуляцию; отсутствие generated ABI не запрещает пользовательские циклы.

Hoist перенесён из emitter в IR pass, чтобы одно native имя объявлялось один раз;
на местах declarations остаются assignments, captured values — env assignments.
Это не runtime TDZ/const enforcement. Bootstrap runtime компилируется bare:
новый helper не должен рекурсивно зависеть от lowering, использующего этот helper.

## Проверка изменения

Маршруты и смысл gates — [verification](verification.md). Entry-point diagnostics,
manager stopping/order, source ranges (CRLF/UTF-16), predicate traversal и block
indentation закреплены в [review-regressions](../../packages/bt-ir/test/review-regressions.test.mjs).
Control metadata, no-op identity и emitter survivors — в
[pass-invariants](../../packages/bt-ir/test/pass-invariants.test.mjs).
Семантические failures и старые ложные выводы не закрываются зелёным shape test:
[findings](findings.md), [история решений](evolution.md).
