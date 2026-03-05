# Рефакторинг Lowering Module

## Что было сделано

### Проблема

Файл `visitor.ts` вырос до ~1600 строк и содержал всю логику преобразования TypeScript AST в IR:
- Statement visitors (12 функций)
- Expression visitors (10+ функций)
- Helper функции (операторы, scope, location)
- Entry point

Это создавало проблемы:
- Сложность навигации по коду
- Трудности для AI-агентов (большой контекст)
- Риск конфликтов при параллельной работе

### Решение: Подход A (по категориям)

Разделили `visitor.ts` на 4 файла:

```
lowering/
├── visitor.ts      (~130 строк) — entry point, VisitorContext, transformToIR
├── statements.ts   (~400 строк) — все statement visitors
├── expressions.ts  (~550 строк) — все expression visitors
├── helpers.ts      (~220 строк) — вспомогательные функции
├── function-builder.ts (существовал) — построение env/desc
├── binding.ts      (существовал) — генерация уникальных имён
└── index.ts        — публичные exports
```

### Детали разделения

#### visitor.ts (entry point)
- `VisitorContext` interface — экспортируется как тип
- `transformToIR()` — главная функция
- Re-exports всех публичных функций для удобства

#### statements.ts
- `visitStatement()` — главный dispatcher
- Declaration statements: `visitFunctionDeclaration`, `visitVariableStatement`, `visitReturnStatement`
- Control flow: `visitIfStatement`, `visitFor*`, `visitWhile*`, `visitSwitch*`, `visitTry*`
- Block helpers: `visitBlock`, `visitStatementList`, `visitStatementAsBlock`

#### expressions.ts
- `visitExpression()` — главный dispatcher
- Literals: string, number, boolean, null
- `visitIdentifier`, `visitTemplateExpression`
- Operators: `visitBinaryExpression`, `visitPrefixUnaryExpression`, `visitPostfixUnaryExpression`
- Calls: `visitCallExpression`, `visitNewExpression`
- Literals: `visitObjectLiteral`, `visitArrayLiteral`
- Functions: `visitArrowFunction`, `visitFunctionExpression`

#### helpers.ts
- Location: `getLoc`
- Polyfill/Runtime: `getPolyfillType`, `isInternalAccess`, `isBuiltinFunction`
- Operators: `isAssignmentOperator`, `getAssignmentOperator`, `getUnaryOperator`
- Scope: `resolveVariableInScope`, `isScopeInsideOrEqual`, `getAllScopes`, `getCapturedVariablesInScope`, `collectCapturedVarsForArrow`

---

## Преимущества текущего подхода

| Критерий | До | После |
|----------|-----|-------|
| Размер файлов | 1600 строк | 130-550 строк |
| Навигация | Сложная | Интуитивная |
| AI-контекст | Перегружен | Оптимальный |
| Понимание структуры | Требует изучения | Очевидно из имён |

---

## Будущее: Подход C (если потребуется)

Если `expressions.ts` вырастет >600 строк, можно дополнительно разделить:

```
lowering/
├── visitor.ts          — entry point (без изменений)
├── statements/
│   ├── index.ts        — reexports
│   ├── control.ts      — if, for, while, switch, try
│   └── declarations.ts — variable, function declaration
├── expressions/
│   ├── index.ts        — reexports
│   ├── operators.ts    — binary, unary, postfix, template
│   ├── calls.ts        — call, new, polyfill logic
│   ├── literals.ts     — object, array, identifier
│   └── functions.ts    — arrow, function expression
├── helpers/
│   ├── scope.ts        — collectCaptured, resolveVariable
│   ├── operators.ts    — isAssignment, getAssignment
│   ├── runtime.ts      — getPolyfillType, isBuiltin
│   └── location.ts     — getLoc, getAllScopes
└── ...
```

### Преимущества подхода C:
- Ещё меньшие файлы (~100-200 строк)
- Логические группы внутри категорий
- Легко расширять (добавить `expressions/classes.ts`)
- Для AI: чёткая иерархия + маленькие файлы

### Недостатки подхода C:
- Больше файлов (12 вместо 6)
- Больше импортов
- Overhead для небольших изменений

### Когда применять C:
- `expressions.ts` > 600 строк
- Добавляются новые крупные фичи (классы, декораторы)
- Команда растёт и нужна параллельная работа

---

## Зависимости между файлами

```
visitor.ts
    ↓
statements.ts ←→ expressions.ts
    ↓               ↓
    └───────────────┴───→ helpers.ts
                          function-builder.ts
                          binding.ts
```

Note: `statements.ts` и `expressions.ts` имеют взаимную зависимость:
- statements импортирует `visitExpression` для обработки выражений
- expressions импортирует `visitStatementList` для тел функций

Это нормально для TypeScript с ESM (не создаёт circular dependency проблем).
