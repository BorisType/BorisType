# ADR 011: Разделение lowering, IR passes и emission

Дата решения: 2026-03-14. Статус: архитектурное разделение сохранено;
описание конкретного pipeline актуализируется в [pipeline](../compiler/pipeline.md).

## Причина и решение

Монолитные expression/statement lowering и emitter смешивали TS AST analysis,
режимные преобразования, finally desugaring и hoisting. Env/method-call patterns
повторялись, исправление одного пути оставляло аналогичный дефект в другом.

Выбрано разделение:

- lowering переводит TS AST в семантический IR;
- passes выполняют преобразования IR → IR;
- emitter печатает подготовленный IR;
- общие env/call helpers и ModeConfig выражают повторяемую политику.

Первая реализация выделила directories expressions/statements/emitter, helpers
`createPerCallEnv`/`createMethodCall`, pass runner/walker, finally и hoist passes.
Порядок `tryFinallyDesugarPass → hoistPass` описывает мартовский срез, а не весь
текущий pipeline. Позже добавлены structured completions и safe for updates;
shared bindings/pass context тоже появились при реальной потребности.

## Почему не другие варианты

- Bare visitors оставили отдельно: plain params и env/descriptor отличаются;
  механическое объединение увеличивало ветвление. Это не запрет пересмотра.
- PassContext не вводили заранее, когда два passes не делили состояние. Это
  историческая причина, а не правило «passes всегда stateless».
- Env setup оставили helper: выделение pass тогда не давало соразмерной пользы.
- Мелкие `resolveHoistingTarget` и контекстный `createSuperCall` не выделили
  только ради симметрии модулей.
- ModeConfig уменьшает повторение mode checks, но не означает, что `ctx.mode`
  запрещён во всём коде или все поведенческие различия уже покрыты флагами.

## Что доказывал старый отчёт

Отчёт первого поколения заявлял byte-identical output 138/138 файлов и меньшие
размеры modules. Это исторические показатели конкретного рефакторинга, не текущая
матрица acceptance и не ограничение длины файлов. Точная исходная запись доступна
через baseline и [migration map](../migration-map.json).

Выделенный walker уменьшает дублирование обхода, но не обеспечивает статическую
исчерпываемость автоматически: `assertNever(node as never)` может подавлять нужную
проверку TypeScript. Этот finding и другие остаточные ограничения находятся в
[findings](../compiler/findings.md); история поколений и исправленные противоречия
старых reviews — в [evolution](../compiler/evolution.md).

Развитие script/module [заморожено](2026-11-05-script-module-memory-freeze.md).
Новая трансформация выбирается по семантике и эффектам, не по обязательству
разместить любое изменение в очередном pass.
