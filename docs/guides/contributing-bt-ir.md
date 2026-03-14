# Руководство: Расширение bt-ir

Для разработчиков, добавляющих новые возможности в компилятор bt-ir.

## Архитектура

```
TS Source → Scope Analyzer → IR Lowering → [Passes] → BT Emitter → BS Output
```

- **Lowering** — TS AST → IR (новая языковая конструкция)
- **Pass** — IR → IR (трансформация существующих узлов)
- **Emitter** — IR → текст (обычно не требует изменений при новых фичах)

## Когда использовать Lowering

Добавляешь поддержку **новой конструкции TypeScript**:

- Деструктуризация, spread, классы
- Требуется доступ к TypeChecker, SourceFile
- Создаёшь новые IR-узлы из TS AST

**Где:** `packages/bt-ir/src/lowering/expressions/` или `statements/`

## Когда использовать Pass

Трансформируешь **уже существующие IR-узлы**:

- Desugaring (как try-finally → state machine)
- Hoisting, оптимизации
- Не требуется TS AST

**Где:** `packages/bt-ir/src/passes/` — новый файл + регистрация в `pipeline/index.ts`

**Инструменты:** `mapStatements`, `mapExpression`, `forEachStatement` из `passes/walker.ts`

## Режим-зависимое поведение

Используй **`ctx.config.*`**, не `ctx.mode`:

- `wrapPropertyAccess` — bt.getProperty vs прямой доступ
- `useEnvDescPattern` — env/desc vs plain params
- `moduleExports` — \_\_init wrapper, exports

Новый аспект режима → добавь флаг в `lowering/mode-config.ts`.

## Подробнее

- [Lowering vs Pass — алгоритм](../../ref/algorithms/bt-ir-lowering-vs-pass.md)
- [ADR-011: Multi-Pass Refactoring](../../ref/decisions/011-bt-ir-multi-pass-refactoring.md)
- [Архитектура IR Pipeline](../../ref/architecture/ir-pipeline.md)
