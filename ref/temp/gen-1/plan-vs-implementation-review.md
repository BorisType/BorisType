# BT-IR Refactoring: План vs Реализация — Проверяющее ревью

**Date:** 2026-03-14  
**Scope:** Phase 1, Phase 2, Phase 3

---

## 1. Сводка: План vs Реальность

### Phase 1: Maintainability

| План                                        | Реализация                               | Отклонение                               | Оценка              |
| ------------------------------------------- | ---------------------------------------- | ---------------------------------------- | ------------------- |
| `resolveHoistingTarget`                     | Не выделен                               | Слишком контекстно-зависим (3 строки)    | ✅ Обосновано       |
| `createSuperCall` / `createSuperMethodCall` | Не выделены                              | Super-логика компактна (~20 строк)       | ✅ Обосновано       |
| expressions/ — 5 файлов                     | 6 файлов (+ module-access.ts)            | Property access не вписывался в literals | ✅ Улучшение        |
| statements/ — 5 файлов                      | 6 файлов (+ dispatch.ts)                 | Dispatcher 182 строки — отдельный файл   | ✅ Улучшение        |
| emitter — 4 файла                           | 5 файлов (+ emit-helpers, emit-hoisting) | Circular deps, hoisting объёмный         | ✅ Необходимо       |
| declarations.ts 200–400 строк               | 665 строк                                | Class declarations не учтены в плане     | ⚠️ Остаётся крупным |

### Phase 2: Multi-pass

| План                           | Реализация   | Отклонение                                         | Оценка        |
| ------------------------------ | ------------ | -------------------------------------------------- | ------------- |
| PassContext                    | Не создан    | Оба pass работают без shared context               | ✅ Обосновано |
| walkStatements → mapStatements | Переименован | Walker заменяет узлы, не просто обходит            | ✅ Улучшение  |
| Walker ~200 строк              | 532 строки   | 20 statements + 25 expressions — explicit matching | ⚠️ Ожидаемо   |
| Env setup pass                 | Пропущен     | createPerCallEnv достаточно чист                   | ✅ По плану   |
| try-finally в pass             | Реализовано  | Bottom-up desugar, затем transformReturns          | ✅ Корректно  |
| Hoist pass                     | Реализовано  | Полная миграция, emit-hoisting удалён              | ✅ Успешно    |

### Phase 3: Mode System

| План                          | Реализация                | Отклонение                                          | Оценка                    |
| ----------------------------- | ------------------------- | --------------------------------------------------- | ------------------------- |
| hoistFunctions флаг           | Не создан                 | Управляется через IRProgram.noHoist                 | ✅ Альтернатива           |
| moduleWrapper → moduleExports | Переименован              | Точнее описывает семантику                          | ✅ Улучшение              |
| usePolyfills                  | Объявлен, не используется | Polyfill через type checker в bare mode             | ✅ Оставлен для будущего  |
| Bare-visitors merge           | Оставлены как есть        | Dispatch через config, merge увеличил бы complexity | ✅ Осознанное решение     |
| mode field в ctx              | Оставлен                  | Проброс в child context, не для branching           | ✅ Обратная совместимость |

---

## 2. Почему именно так: Ключевые решения

### 2.1 resolveHoistingTarget не выделен

**План:** Консолидировать 3 точки принятия решения (hoistedFunctions vs pendingStatements).

**Реальность:** Логика — 2–3 строки, привязанные к `ctx.hoistedFunctions` и `ctx.pendingStatements`. Отдельная функция потребовала бы передачу обоих массивов и возврат ссылки — overhead больше, чем выигрыш.

**Вывод:** Не всякая дублируемая логика оправдывает абстракцию. Порог — ~10+ строк или 3+ использования с разной семантикой.

### 2.2 Super-хелперы не выделены

**План:** `createSuperCall`, `createSuperMethodCall` в call-helpers.

**Реальность:** Super-логика тесно связана с visitor context (superContext, текущий класс). Выделение потребовало бы передачи большого контекста. Код ~20 строк, используется в одном месте.

**Вывод:** Выделять имеет смысл при 2+ использованиях или когда логика >30 строк.

### 2.3 module-access.ts добавлен

**План:** literals.ts для object/array/identifier.

**Реальность:** Property access и element access (включая optional chaining) — отдельная категория, ~50 строк. В literals не вписывался семантически.

**Вывод:** Структура файлов должна отражать доменную логику, а не только размер.

### 2.4 PassContext не создан

**План:** PassContext для bindings, scopeAnalysis, mode config, diagnostics.

**Реальность:** `tryFinallyDesugarPass` использует внутренний `NameGen`. `hoistPass` использует `forEachStatement` и `mapStatements` — всё необходимое в IR. Shared context между passes не нужен.

**Вывод:** YAGNI. Добавить PassContext при появлении pass, требующего shared state (например, optimization с global info).

### 2.5 Walker 532 строки

**План:** ~200 строк generic walker.

**Реальность:** IR содержит 20 типов statements и 25+ expressions. Каждый требует explicit handling для корректной рекурсии. Нет возможности «пропустить» типы — иначе теряется покрытие.

**Вывод:** Размер walker пропорционален сложности IR. Одноразовая инвестиция — переиспользуется всеми passes.

### 2.6 Bare-visitors не merged

**План:** Оценить merge в main visitors с config-driven branching.

**Реальность:** Bare mode — принципиально другая трансляция:

- Параметры: original vs **env/**this/\_\_args
- Context: createBareFnCtx vs createInnerFunctionContext
- Merge удвоил бы cyclomatic complexity каждого visitor

**Вывод:** Dispatch `!ctx.config.useEnvDescPattern → visitBare*` — явный и читаемый паттерн. Fast-path для minimal-transpilation — архитектурное решение.

### 2.7 usePolyfills не используется напрямую

**План:** Флаг для explicit контроля polyfill dispatch.

**Реальность:** В bare mode TypeChecker возвращает типы без polyfill-методов — `getPolyfillType` возвращает null. Explicit check не нужен.

**Вывод:** Флаг оставлен для полноты и будущего (например, script без polyfills для debugging).

---

## 3. Проверяющее ревью кода

### 3.1 Pipeline порядок

```typescript
ir = runPasses(ir, [tryFinallyDesugarPass, hoistPass]);
```

**Проверка:** try-finally desugar создаёт `__fType`, `__fVal` — переменные. Hoist pass поднимает их. Порядок корректен.

### 3.2 Try-finally: bottom-up vs top-down

**Критический баг (исправлен):** Вложенные try-finally требуют desugaring снизу вверх. Внутренний desugar создаёт `return __fVal`, который должен быть видим transformReturns внешнего.

**Проверка:** Реализация использует bottom-up обход. ✅

### 3.3 Hoist pass: hoistOnly VarDecl

**Проверка:** VarDecl с `hoistOnly: true` удаляются в hoist pass — они существовали только для emitter'ной логики. Emitter больше не ожидает их. ✅

### 3.4 ModeConfig маппинг

| CompileMode | wrapPropertyAccess | useEnvDescPattern | moduleExports |
| ----------- | ------------------ | ----------------- | ------------- |
| bare        | false              | false             | false         |
| script      | true               | true              | false         |
| module      | true               | true              | true          |

**Проверка:** Все 58 проверок `ctx.mode` заменены на `ctx.config.*`. Остаточные `ctx.mode` — только проброс в child context (2 места). ✅

### 3.5 Обратная совместимость

**Проверка:** barrel re-exports (expressions.ts, statements.ts) сохранены. Внешние импорты не сломаны. ✅

### 3.6 Тесты

- botest: 113/113 ✅
- SHA256: 138/138 byte-identical ✅

---

## 4. Что получили: Итоги

### Метрики

| Метрика                           | До                              | После            | Δ     |
| --------------------------------- | ------------------------------- | ---------------- | ----- |
| lowering (expressions+statements) | ~3700                           | ~3500 (split)    | −200  |
| emitter                           | ~1214                           | ~726             | −488  |
| passes                            | 0                               | 1142 (новый код) | +1142 |
| mode checks                       | 58 scattered                    | 0 (config flags) | −58   |
| Circular deps (emitter)           | emit-statements ↔ emit-hoisting | Устранена        | ✅    |

### Архитектурные достижения

1. **Разделение ответственности:** Lowering → IR, Passes → IR transforms, Emitter → IR→text
2. **Расширяемость:** Новый pass = новый файл + регистрация в pipeline
3. **Тестируемость:** Passes изолированы, можно тестировать на IR напрямую
4. **Читаемость:** ModeConfig флаги самодокументируются
5. **Устранение circular dependency:** emit-hoisting удалён

### Шаг вперёд?

**Да.** Рефакторинг достиг целей:

- Файлы управляемого размера (макс 665 строк vs 1950)
- Дублирование устранено (createPerCallEnv, createMethodCall)
- IR passes — расширяемая инфраструктура
- Mode system — типизирован и понятен

---

## 5. Уроки

### 5.1 План vs реальность

- **Не всё дублирование стоит абстрагировать** — resolveHoistingTarget, super-хелперы
- **Структура файлов** — следовать доменной логике, не только целевым размерам
- **YAGNI для инфраструктуры** — PassContext не нужен пока нет use case

### 5.2 Технические

- **Порядок операций в pass критичен** — try-finally bottom-up
- **Атомарность миграций** — hoist pass + emitter simplification нельзя разделять
- **Walker размер** — пропорционален IR модели, не «переусложнение»

### 5.3 Процесс

- **Итеративная верификация** — SHA256 сравнение после каждой фазы
- **Документирование отклонений** — phase-\*-results.md ценны для ревью

---

## 6. Куда двигаться дальше

### Ближайшие шаги

1. **declarations.ts** — рассмотреть split на declarations.ts (vars, imports) + function-declarations.ts (functions, classes) при следующем касании
2. **IR Verifier** — базовая проверка целостности IR (опционально, для отладки)
3. **Source Maps** — не блокируется multi-pass, отдельная инициатива

### Долгосрочно

1. **TypeInfo на IR** — для type-driven dispatch (отдельная инициатива)
2. **Optimization passes** — dead code elimination, constant folding (walker готов)
3. **Custom ModeConfig** — возможность комбинировать флаги вне presets (если потребуется)

---

## 7. Рекомендации

### Добавление новой фичи

- **Lowering:** TS AST → IR, новая языковая конструкция (деструктуризация, spread, классы)
- **Pass:** IR → IR, трансформация уже существующих IR-узлов (оптимизация, desugaring)

### Изменение поведения по режиму

- **Использовать `ctx.config.*`** — не `ctx.mode`
- **Новый флаг в ModeConfig** — если поведение не покрывается существующими

### Новый pass

1. Создать `passes/name.ts` с `IRPass` интерфейсом
2. Использовать `mapStatements` / `mapExpression` / `forEachStatement` из walker
3. Зарегистрировать в `pipeline/index.ts` в правильном порядке
