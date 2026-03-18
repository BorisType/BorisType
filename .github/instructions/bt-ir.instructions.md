---
applyTo: "packages/bt-ir/**"
---

# BT-IR Backend — IR-based TypeScript → BorisScript transpilation

## Контекст

BT-IR — бэкенд транспиляции TypeScript → BorisScript на основе **промежуточного представления (IR)**. **Интегрирован в btc**: emit выполняется через bt-ir, tsc используется только для диагностики (noEmit).

## Режимы транспиляции (CompileMode)

| Режим      | Семантика                                                                          |
| ---------- | ---------------------------------------------------------------------------------- |
| **bare**   | Минимальный: без bt.getProperty, без polyfill. Для runtime, botest.                |
| **script** | Eval-скрипт: env/desc, bt.getProperty, polyfill. Для .test.ts, executable objects. |
| **module** | Codelibrary: hoist, \_\_init. Default для проектов.                                |

Определение: директива `/// @bt-mode` > .test.ts / executable > options.compileMode.

## Pipeline

```
TS Source → Scope Analyzer → IR Lowering → BT Emitter → BS Output
```

## Структура модулей

| Модуль       | Путь            | Роль                        |
| ------------ | --------------- | --------------------------- |
| **Analyzer** | `src/analyzer/` | Scopes, captured переменные |
| **IR**       | `src/ir/`       | IR ноды, builders           |
| **Lowering** | `src/lowering/` | TS AST → IR                 |
| **Emitter**  | `src/emitter/`  | IR → BorisScript текст      |
| **Pipeline** | `src/pipeline/` | Координация этапов          |

### API

- `compile(sourceCode, options)` — компиляция строки (создаёт свой Program)
- `compileFile(path, options)` — компиляция файла
- `compileSourceFile(sourceFile, program, options)` — для интеграции с btc (внешний Program)
- `CompileResult.outputs: Array<{ path, code, map? }>` — множественные выходы (пока 1)

### Lowering (важно)

`VisitorContext.mode` передаётся во все visitors — в bare mode: IR.dot/IR.member вместо bt.getProperty, без polyfill.

```
lowering/
├── visitor.ts          — entry point, VisitorContext, transformToIR, CompileMode
├── statements.ts       — visitors для statements (if, for, while...)
├── expressions.ts      — visitors для expressions
├── helpers.ts           — scope, operators, location, polyfills
├── function-builder.ts  — env/desc паттерн для функций
├── binding.ts          — генерация уникальных имён
```

## Ключевые концепции

### BindingManager

Генерация уникальных имён без коллизий:

```typescript
bindings.registerSourceNames(["__item", "foo"]);
bindings.create("item"); // → "__item0"
bindings.shadow("x"); // → "x__0" для shadowed
```

### CapturedVarInfo

Для captured переменных всегда используй `renamedTo ?? name`.

### Function desc паттерн

Все функции в BS:

```javascript
function myFunc(__env, __this, __args) { ... }
var myFunc_desc = { "@descriptor": "function", callable: myFunc, env: __env, obj: undefined };
__env.myFunc = myFunc_desc;
```

Отдельный per-function env (`myFunc_env`) **не создаётся** — дескриптор
ссылается на текущий env напрямую. Per-call env создаётся внутри тела
функции при каждом вызове, если функция содержит captured переменные.

## Добавление visitors

**Statement**: функция в `statements.ts` → case в `visitStatement()` → export  
**Expression**: функция в `expressions.ts` → case в `visitExpression()` → export

## Тестирование

```powershell
Set-Location "c:\Users\vomoh\Desktop\projects\BorisType"
npx turbo run build
pnpm run test
```

## Особенности

- **for-of → for-in**: BS `for-in` итерирует по значениям. `__env.item = __itemN` только если переменная captured.
- **var hoisting**: `var` hoists на function/module уровень. Конфликт с `let/const` → переименование `let/const`.
- **bare mode**: property access → прямой `obj.prop`, без bt.getProperty/bt.setProperty/bt.callFunction.

## Соглашения о коде

- JSDoc для всех публичных функций и типов
- IR ноды immutable — создавать новые, не мутировать
- Использовать IR builders (`IR.id()`, `IR.call()`, etc.)
- Не создавать ручные IR структуры (используй builders)

## См. также

- [IR Architecture](../../ref/architecture/ir-pipeline.md) — детальная архитектура
- [BorisScript Constraints](../../docs/reference/borisscript-constraints.md) — ограничения целевого языка
- [Compile Modes](../../docs/reference/compile-modes.md) — user-facing документация
