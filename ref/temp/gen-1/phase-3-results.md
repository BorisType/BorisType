# Phase 3: Mode System Refactoring — Результаты

**Date:** 2026-03-13
**Status:** Completed

---

## Цель Phase 3

Заменить ~58 разбросанных `ctx.mode === "bare"` / `ctx.mode === "module"` проверок
на типизированный объект конфигурации `ModeConfig` с самодокументирующимися boolean-флагами.

---

## План vs Реальность

### Step 3.1: Define ModeConfig

**План:** Создать `mode-config.ts` с интерфейсом `ModeConfig` и три пресета.

**Реальность:** Создан `lowering/mode-config.ts` (91 строка):

```typescript
interface ModeConfig {
  wrapPropertyAccess: boolean; // bt.getProperty / bt.setProperty
  wrapCallExpression: boolean; // bt.callFunction / bt.createInstance
  useBtIsTrue: boolean; // bt.isTrue для && / || / ??
  useEnvDescPattern: boolean; // __env/__this/__args, closures, captured vars
  usePolyfills: boolean; // Array/String/Number polyfills
  useRefFormat: boolean; // ref/lib (module) vs callable (script)
  moduleExports: boolean; // __module.exports, __init wrapper
}
```

Три пресета: `BARE_CONFIG` (все false), `SCRIPT_CONFIG` (6 true, 1 false), `MODULE_CONFIG` (все true).

**Отклонения от плана:**

- `hoistFunctions` флаг **не создан** — hoisting управляется через `IRProgram.noHoist` (устанавливается из `!useEnvDescPattern`), что уже работает в hoist pass
- `moduleWrapper` переименован в `moduleExports` — более точно описывает семантику (не только \_\_init, но и экспорты)
- `usePolyfills` **объявлен, но не используется напрямую** — polyfill dispatch всегда работает через `getPolyfillType` из helpers.ts, который возвращает null для bare mode через type checker (bare-mode типы не имеют polyfill-методов). Флаг оставлен для будущего explicit контроля

### Step 3.2: Replace scattered checks

**План:** Заменить `ctx.mode === "bare"` → `ctx.config.wrapPropertyAccess` (или релевантный флаг).

**Реальность:** Заменены **все 58 проверок** `ctx.mode`:

| Старая проверка                                 | Новый флаг                                          | Файлы                                      |
| ----------------------------------------------- | --------------------------------------------------- | ------------------------------------------ |
| `ctx.mode === "bare"` (property access)         | `!ctx.config.wrapPropertyAccess`                    | operators.ts, dispatch.ts                  |
| `ctx.mode === "bare"` (call wrapping)           | `!ctx.config.wrapCallExpression`                    | calls.ts                                   |
| `ctx.mode === "bare"` (logical operators)       | `!ctx.config.useBtIsTrue`                           | operators.ts                               |
| `ctx.mode === "bare"` (env/desc, functions)     | `!ctx.config.useEnvDescPattern`                     | functions.ts, dispatch.ts, literals.ts     |
| `ctx.mode === "bare"` (this keyword)            | `!ctx.config.useEnvDescPattern`                     | dispatch.ts                                |
| `ctx.mode === "bare"` (import.meta)             | `!ctx.config.useEnvDescPattern`                     | dispatch.ts                                |
| `ctx.mode === "module"` (useRefFormat)          | `ctx.config.useRefFormat`                           | functions.ts, declarations.ts, literals.ts |
| `ctx.mode === "module"` (exports)               | `ctx.config.moduleExports`                          | declarations.ts, dispatch.ts, visitor.ts   |
| `ctx.mode === "module"` (hoisting target)       | `ctx.config.moduleExports`                          | declarations.ts, literals.ts               |
| `ctx.mode === "module"` (nested naming)         | `ctx.config.moduleExports`                          | functions.ts, declarations.ts              |
| `ctx.mode === "script" \|\| "module"` (helpers) | `ctx.config.useEnvDescPattern`                      | visitor.ts, calls.ts                       |
| `isModuleMode` (descriptor format)              | `config.useRefFormat`                               | visitor.ts                                 |
| `ctx.mode === "script"` (top-level env)         | `config.useEnvDescPattern && !config.moduleExports` | visitor.ts                                 |
| `ctx.mode !== "module"` (env depth)             | `!ctx.config.moduleExports`                         | env-resolution.ts                          |
| `ctx.mode === "script"` (hoisting target)       | `!ctx.config.moduleExports`                         | function-helpers.ts                        |

**Итого:** 45 использований `ctx.config.*` в lowering, 0 проверок `ctx.mode` в логике (кроме 2 пробросов `mode: ctx.mode` в child VisitorContext).

### Step 3.3: Bare-visitors — решение

**План:** Оценить merge bare-visitors.ts в main visitors с config-driven branching.

**Решение:** **Bare-visitors оставлены как есть.**

Причина: bare-visitors работают через dispatch в statements/dispatch.ts (`!ctx.config.useEnvDescPattern → visitBare*`) и expressions/functions.ts (`!ctx.config.useEnvDescPattern → visitBare*`). Этот паттерн уже использует config-флаги и достаточно чистый. Merge потребовал бы:

- Дублирование параметров (bare: original params vs script: **env/**this/\_\_args)
- Дублирование context creation (createBareFnCtx vs createInnerFunctionContext)
- Увеличение cyclomatic complexity каждого visitor

Выделение bare-visitors как fast-path для minimal-transpilation mode — осознанное архитектурное решение, не anti-pattern.

### Step 3.4: Verification

**Результаты:**

- `npx tsc --noEmit` — 0 ошибок
- `npx turbo run build` — **14/14 пакетов** собраны
- botest — **113/113 тестов** пройдено
- SHA256 сравнение — **138/138 файлов byte-identical**

---

## Итоговые метрики

### Файлы — создано

| Файл                      | Строки | Назначение                                 |
| ------------------------- | ------ | ------------------------------------------ |
| `lowering/mode-config.ts` | 91     | ModeConfig interface + 3 presets + factory |

### Файлы — изменено

| Файл                                  | До (строки) | После (строки) | Δ   | Изменения                                             |
| ------------------------------------- | ----------- | -------------- | --- | ----------------------------------------------------- |
| `lowering/visitor.ts`                 | 338         | 331            | −7  | Добавлен config в ctx, заменены все mode checks       |
| `lowering/bare-visitors.ts`           | 342         | 304            | −38 | Добавлен `config: ctx.config` в child ctx             |
| `lowering/function-helpers.ts`        | 230         | 230            | 0   | `config: ctx.config` + resolveHoistingTarget          |
| `lowering/env-resolution.ts`          | 155         | 144            | −11 | `config.moduleExports` вместо `mode !== "module"`     |
| `lowering/index.ts`                   | 89          | 92             | +3  | Export ModeConfig                                     |
| `lowering/statements/dispatch.ts`     | 182         | 157            | −25 | Config flags в dispatch routing                       |
| `lowering/statements/declarations.ts` | 665         | 603            | −62 | Config flags для exports, useRefFormat, destructuring |
| `lowering/expressions/operators.ts`   | 334         | 308            | −26 | Config flags для property access, logical operators   |
| `lowering/expressions/calls.ts`       | 290         | 256            | −34 | Config flags для call wrapping, polyfills             |
| `lowering/expressions/dispatch.ts`    | 443         | 414            | −29 | Config flags для property access, this keyword        |
| `lowering/expressions/literals.ts`    | 395         | 342            | −53 | Config flags для identifier, object methods           |
| `lowering/expressions/functions.ts`   | 135         | 116            | −19 | Config flags для env/desc, useRefFormat               |

### Нетто

- Создано: **+91 строка** (mode-config.ts)
- Изменения в существующих: **−301 строка**
- Нетто: **−210 строк**

Сокращение объясняется тем, что `ctx.config.flag` — одно обращение к boolean, заменяющее `ctx.mode === "bare"` или `ctx.mode === "script" || ctx.mode === "module"` (множественные string comparison).

---

## Проблемы и выводы

### 1. `usePolyfills` флаг не используется напрямую

**Причина:** Polyfill dispatch в calls.ts работает через `getPolyfillType(type, typeChecker)`, который использует TypeScript type system. В bare mode типы не содержат polyfill-методов (Array → нет маппинга), поэтому polyfill dispatch never triggers. Explicit `if (!ctx.config.usePolyfills) return null` не нужен.

**Вывод:** Флаг оставлен в ModeConfig для полноты и возможного будущего explicit контроля (например, script mode без polyfills для debugging).

### 2. `mode` field остаётся в VisitorContext

**Причина:** Bare-visitors и child context creation по-прежнему пробрасывают `mode: ctx.mode`. Удаление `mode` field потребовало бы масштабных изменений в bare-visitors (которые сами не проверяют mode). Оставлено для обратной совместимости.

**Вывод:** `mode` field can be deprecated in the future, but it's harmless. All runtime decisions now go through `config`.

### 3. Bare-visitors не merged

**Причина:** Merge увеличил бы complexity каждого visitor без пропорционального выигрыша. Bare mode — принципиально другая трансляция (plain params vs env/desc, no closures), и config-driven branching внутри одной функции создавал бы менее читаемый код.

**Вывод:** Dispatch через `!ctx.config.useEnvDescPattern → visitBare*` — ясный и explicit паттерн, финальное состояние.

---

## Маппинг: ctx.mode → ModeConfig

| CompileMode | wrapPropertyAccess | wrapCallExpression | useBtIsTrue | useEnvDescPattern | usePolyfills | useRefFormat | moduleExports |
| ----------- | ------------------ | ------------------ | ----------- | ----------------- | ------------ | ------------ | ------------- |
| **bare**    | ✗                  | ✗                  | ✗           | ✗                 | ✗            | ✗            | ✗             |
| **script**  | ✓                  | ✓                  | ✓           | ✓                 | ✓            | ✗            | ✗             |
| **module**  | ✓                  | ✓                  | ✓           | ✓                 | ✓            | ✓            | ✓             |

---

## Состояние кодовой базы после Phase 3

### Файлы lowering/ (итого)

| Файл                           | Строки |
| ------------------------------ | ------ |
| `visitor.ts`                   | 331    |
| `mode-config.ts`               | 91     |
| `bare-visitors.ts`             | 304    |
| `function-helpers.ts`          | 230    |
| `function-builder.ts`          | ~200   |
| `env-resolution.ts`            | 144    |
| `helpers.ts`                   | ~250   |
| `binding.ts`                   | ~120   |
| `call-helpers.ts`              | 95     |
| `spread-helpers.ts`            | ~50    |
| `precedence.ts`                | ~60    |
| `statements/dispatch.ts`       | 157    |
| `statements/declarations.ts`   | 603    |
| `statements/control-flow.ts`   | 65     |
| `statements/loops.ts`          | 189    |
| `statements/blocks.ts`         | 128    |
| `expressions/dispatch.ts`      | 414    |
| `expressions/operators.ts`     | 308    |
| `expressions/calls.ts`         | 256    |
| `expressions/literals.ts`      | 342    |
| `expressions/functions.ts`     | 116    |
| `expressions/module-access.ts` | 50     |
