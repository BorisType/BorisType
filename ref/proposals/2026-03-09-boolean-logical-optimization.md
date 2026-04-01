# Proposal 004: Оптимизация логических операторов для boolean-типизированных операндов

**Дата:** 2026-03-09  
**Статус:** Proposal (к обсуждению)  
**Связанные компоненты:** bt-ir (lowering), TypeScript type checker  
**Связанный ADR:** [009-logical-operators-lowering](../decisions/009-logical-operators-lowering.md)

## Проблема

Текущая реализация lowering для `||` и `&&` (ADR 009) **всегда** преобразует оператор
в ternary expression с `bt.isTrue()`:

```typescript
// Исходный код:
const a: boolean = true;
const b: boolean = false;
const c = a || b;

// Текущий output:
var __lo0;
var c = bt.isTrue((__lo0 = a)) ? __lo0 : b;
```

Когда **оба операнда имеют тип `boolean`** (по данным TypeScript type checker), нативный
BS `||` / `&&` работает корректно — BS поддерживает эти операторы для boolean значений.
В таком случае ternary lowering избыточен.

### Потенциальная оптимизация

Если type checker подтверждает `boolean` тип на обоих операндах — эмитить нативный оператор:

```typescript
// Исходный код:
const a: boolean = true;
const b: boolean = false;
const c = a || b;

// Оптимизированный output:
var c = a || b;
```

Это уменьшает размер output, убирает temporary variable и вызов `bt.isTrue()`.

## Опасность: type cast и runtime type mismatch

**Это потенциально опасная оптимизация.**

В TypeScript тип `boolean` — это контракт, но в runtime значение может быть другим из-за:

### 1. Type assertion (as)

```typescript
const value = getExternalValue() as boolean; // на самом деле string
const result = value || defaultBool; // TypeScript думает boolean || boolean
```

В JS: работает корректно, `||` вернёт `value` (string).  
В BS с оптимизацией: **"Value is not effective boolean"** — runtime ошибка.

### 2. Type assertion (angle bracket / satisfies)

```typescript
const value = <boolean>someUnknown;
const result = value && anotherBool; // TypeScript считает boolean && boolean
```

### 3. Неточные типы из внешних API / any

```typescript
function processFlag(flag: boolean) {
  // caller может передать 0, "", null через any
  return flag || defaultValue;
}

const x: any = 0;
processFlag(x); // TypeScript не ругается на any → boolean
```

### 4. JSON / десериализация

```typescript
interface Config {
  enabled: boolean;
}
const config: Config = JSON.parse(data);
// config.enabled может быть 1, "true", null — не boolean
const isEnabled = config.enabled || false;
```

### Ключевое отличие от JS

В JavaScript подобные ситуации с неправильным типом **не приводят к ошибке** —
`||` и `&&` просто работают с любыми значениями. Это один из self-healing механизмов JS.

В BorisScript с нативным `||` / `&&` — **runtime exception**. Код, который "тихо работал"
в JS несмотря на type mismatch, **перестанет работать** в BS после оптимизации.

Это делает оптимизацию принципиально отличной от "безопасных" оптимизаций — она изменяет
поведение при нарушении type contract.

## Предложение: экспериментальная опция компилятора

### Не делать оптимизацию по умолчанию

Учитывая риски, эту оптимизацию **не следует включать по умолчанию**. Вместо этого
предлагается добавить её как экспериментальную опцию:

### Конфигурация через `btconfig.json`

```json
{
  "compilerOptions": {
    "experimentalOptions": {
      "nativeBooleanLogical": true
    }
  }
}
```

### Или через CLI

```bash
npx btc build --x-native-boolean-logical
```

### Передача в компилятор

Экспериментальные опции (x-opts) передаются через `CompileOptions` и доступны в
`VisitorContext`:

```typescript
interface ExperimentalOptions {
  /** Использовать нативные || и && для boolean-типизированных операндов */
  nativeBooleanLogical?: boolean;
}
```

### Реализация в lowering

```typescript
if (operatorToken === ts.SyntaxKind.BarBarToken) {
  if (ctx.mode === "bare") {
    return IR.logical("||", left, right);
  }

  // Экспериментальная оптимизация: нативный || для boolean операндов
  if (ctx.experimentalOptions?.nativeBooleanLogical) {
    const leftType = ctx.checker?.getTypeAtLocation(node.left);
    const rightType = ctx.checker?.getTypeAtLocation(node.right);
    if (isBooleanType(leftType) && isBooleanType(rightType)) {
      return IR.logical("||", left, right);
    }
  }

  // Стандартный lowering через ternary
  // ...
}
```

### Функция проверки типа

```typescript
function isBooleanType(type: ts.Type | undefined): boolean {
  if (!type) return false;
  // Проверяем boolean, true, false
  return !!(type.flags & (ts.TypeFlags.Boolean | ts.TypeFlags.BooleanLiteral));
}
```

## Scope

- **Применимо к:** `||`, `&&`
- **Не применимо к:** `??` (использует null-check, не `bt.isTrue()`)
- **Compile modes:** script, module (bare уже использует нативные операторы)

## Открытые вопросы

1. **Нужна ли эта оптимизация?** Для большинства проектов overhead от ternary lowering
   минимален. Стоит измерить реальный impact на размер и производительность.

2. **Strict mode?** Можно добавить обратную опцию: режим, где type mismatch специально
   проверяется и выводится более понятная ошибка вместо BS-шной "Value is not effective boolean".

3. **Gradual rollout:** Если оптимизация покажет себя стабильной, можно в будущем
   сделать её дефолтной. Но только после длительного тестирования.

4. **Union types:** Как обрабатывать `boolean | undefined`? Консервативно — не оптимизировать.
   Только чистый `boolean`.
