# BT-IR: Lowering vs Pass — Руководство разработчика

**Date:** 2026-03-14

---

## Когда использовать Lowering

**Lowering** — преобразование **TypeScript AST → IR**. Выполняется в `lowering/` при обходе TS AST.

### Используй lowering когда:

1. **Добавляешь поддержку новой языковой конструкции**
   - Деструктуризация `const { a } = obj`
   - Spread оператор `[...arr]`
   - Классы TypeScript
   - Async/await, генераторы

2. **Преобразование требует доступа к TS AST**
   - TypeChecker для определения типов (polyfills, type-driven dispatch)
   - SourceFile для location
   - Семантика TS-узлов (например, `isOptionalChain`)

3. **Создаёшь новые IR-узлы из TS**
   - Первичная генерация IR из исходного кода
   - Любая конструкция, которой ещё нет в IR

### Где писать

- `lowering/expressions/` — для expression (вызовы, литералы, операторы)
- `lowering/statements/` — для statements (объявления, control flow, циклы)
- `lowering/function-helpers.ts`, `call-helpers.ts` — общие хелперы

### Пример

```typescript
// lowering/expressions/literals.ts
function visitObjectLiteralExpression(
  node: ts.ObjectLiteralExpression,
  ctx: VisitorContext,
): IRExpression {
  // TS AST → IR
  const properties = node.properties.map((p) => visitObjectLiteralElement(p, ctx));
  return IR.object(properties, getLoc(node, ctx.sourceFile));
}
```

---

## Когда использовать Pass

**Pass** — преобразование **IR → IR**. Выполняется в `passes/` после lowering, до emitter.

### Используй pass когда:

1. **Трансформируешь уже существующие IR-узлы**
   - Desugaring (try-finally → state machine)
   - Hoisting (VarDecl → assignments, function reorder)
   - Оптимизация (dead code elimination, constant folding)

2. **Преобразование не требует TS AST**
   - Вся информация есть в IR
   - Обход дерева IR достаточен

3. **Логика изолирована и переиспользуема**
   - Один pass — одна ответственность
   - Можно тестировать на IR напрямую
   - Порядок passes явный в pipeline

### Где писать

- `passes/` — новый файл `passes/your-pass.ts`
- Использовать `mapStatements`, `mapExpression`, `forEachStatement` из `passes/walker.ts`

### Пример

```typescript
// passes/try-finally-desugar.ts
export const tryFinallyDesugarPass: IRPass = {
  name: "try-finally-desugar",
  run(program: IRProgram): IRProgram {
    return {
      ...program,
      body: mapStatements(program.body, (stmt) => {
        if (stmt.kind === "TryStatement" && stmt.finalizer) {
          return desugarTryFinally(stmt);
        }
        return stmt;
      }),
    };
  },
};
```

### Регистрация в pipeline

```typescript
// pipeline/index.ts
ir = runPasses(ir, [tryFinallyDesugarPass, hoistPass, yourNewPass]);
```

**Порядок важен:** Pass A может создавать узлы, которые pass B должен обработать (например, try-finally создаёт переменные → hoist поднимает их).

---

## Сравнительная таблица

| Критерий                | Lowering             | Pass                         |
| ----------------------- | -------------------- | ---------------------------- |
| Вход                    | TS AST               | IR                           |
| Выход                   | IR                   | IR                           |
| Доступ к TypeChecker    | ✓                    | ✗                            |
| Доступ к SourceFile     | ✓                    | ✗ (только loc в IR)          |
| Создание новых IR-узлов | ✓ (из TS)            | ✓ (из IR)                    |
| Обход                   | TS Visitor           | mapStatements, mapExpression |
| Когда добавлять         | Новая TS конструкция | IR-трансформация             |

---

## Режим-зависимое поведение

Для поведения, зависящего от bare/script/module:

- **Используй `ctx.config.*`** — не `ctx.mode`
- Флаги: `wrapPropertyAccess`, `useEnvDescPattern`, `moduleExports` и т.д.
- См. `lowering/mode-config.ts`

Если нужен новый аспект режима — добавь флаг в `ModeConfig` и preset'ы.

---

## Чек-лист: добавляю новую фичу

- [ ] Это новая TS конструкция? → **Lowering**
- [ ] Это трансформация существующего IR? → **Pass**
- [ ] Нужен TypeChecker/SourceFile? → **Lowering**
- [ ] Поведение зависит от режима? → **ctx.config.\***, при необходимости новый флаг

---

## См. также

- [ADR-011: BT-IR Multi-Pass Refactoring](../decisions/011-bt-ir-multi-pass-refactoring.md)
- [Архитектура IR Pipeline](../architecture/ir-pipeline.md)
- [passes/walker.ts](../../packages/bt-ir/src/passes/walker.ts) — API walker'а
