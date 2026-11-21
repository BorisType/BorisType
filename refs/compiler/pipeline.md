# Pipeline и контракты IR

Общие этапы применяются после выбора режима. Ограничения поддерживаемого
подмножества перечислены в [справочнике](../../docs/reference/borisscript-constraints.md).

## Entrypoints и диагностика

[Pipeline](../../packages/bt-ir/src/pipeline/index.ts) имеет два основных пути:

| API                                         | Что получает и проверяет                                                                                                                          |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `compile(source, options)`                  | Создаёт virtual CompilerHost/Program/TypeChecker, собирает TS diagnostics (кроме node_modules), затем BT diagnostics; default filename `input.ts` |
| `compileSourceFile(file, program, options)` | Использует переданный Program/TypeChecker; собирает **только BT diagnostics**. TS diagnostics собирает вызывающий consumer                        |
| `compileFile(path, options)`                | Читает файл и делегирует `compile`; не заменяет project build/import resolution                                                                   |

Оба основных пути выбирают `options.mode ?? DEFAULT_COMPILE_MODE`, анализируют scopes и
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
вызывает `compileSourceFile`, разрешает режим файла по директиве и опциям, пишет output.
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
control-target IDs и информацию о текущем scope.
Дочерние контексты используют общий allocator, diagnostics и target identity
с собственными function/scope/pending boundaries.

[IR nodes/builders](../../packages/bt-ir/src/ir/) разделяют statements, обычные
expressions, environment statements и явно моделируемые runtime calls.
Используй реальные builders из `builders.ts`: исторические `IR.bin/func/lit`
примеры не являются API. `SourceLocation` нужно переносить через rebuild,
как и `controlTargetId` loops/switch/expanded for-of/chained labels. Catch
physical name не является обычным hoisted VarDecl.

## Lowering или pass

Новая TS-конструкция, решение по TS-типу, optional token или исходный
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

## Настройки режимов

В [реестре](../../packages/bt-ir/src/lowering/mode-config.ts) описаны доступные
режимы, режим по умолчанию и настройки каждого режима. CLI и API используют
единый реестр. В конфигурации режима также выбираются visitors для функций,
переменных и namespaces. Lowering переносит применимые параметры в IR, например `noHoist`
сохраняет порядок statements верхнего уровня в `bare`.

Обработчики plain-функций и объявлений находятся в
[bare-visitors.ts](../../packages/bt-ir/src/lowering/bare-visitors.ts).
Общие passes работают с контрактом IR. При добавлении режима его преобразования
подключаются в lowering, а требования к output описываются в справочнике
[режимов компиляции](../../docs/reference/compile-modes.md).

## Проверка изменения

Маршруты и смысл gates — [verification](verification.md). Entry-point diagnostics,
manager stopping/order, source ranges (CRLF/UTF-16), predicate traversal и block
indentation закреплены в [review-regressions](../../packages/bt-ir/test/review-regressions.test.mjs).
Control metadata, no-op identity и emitter survivors — в
[pass-invariants](../../packages/bt-ir/test/pass-invariants.test.mjs).
Семантические failures и старые ложные выводы не закрываются зелёным shape test:
[findings](findings.md), [история решений](evolution.md).
