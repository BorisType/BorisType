# ADR 003: Явная проверка nullish для Optional Chaining

**Дата:** 2026-02-23
**Статус:** Принято  
**Компонент:** Lowering optional chaining (`?.`) в bt-ir

## Контекст

Оператор optional chaining TypeScript (`?.`) прекращает выполнение при встрече `null` или `undefined`:

```typescript
const result = obj?.prop; // undefined если obj — null/undefined
const nested = a?.b?.c; // останавливается на первом null/undefined
```

При транспиляции в BorisScript, мы должны **явно реализовать** эту проверку, поскольку в BorisScript нет оператора `?.`.

### Варианты обнаружения nullish

Существуют несколько подходов к проверке `null`/`undefined`:

1. **Нестрогая проверка равенства**

   ```javascript
   if (x == null) {
     /* true для null и undefined */
   }
   ```

   Pro: Компактно (одна проверка)  
   Con: Полагается на приведение типов (неявное поведение)

2. **Явная двойная проверка**

   ```javascript
   if (x == null || x == undefined) {
     /* явно */
   }
   ```

   Pro: Чёткое намерение  
   Con: Более длинный код

3. **Строгая двойная проверка**

   ```javascript
   if (x === null || x === undefined) {
     /* строго */
   }
   ```

   Pro: Избегает приведения типов  
   Con: Самый длинный код, тот же результат что и #2 в данном случае

4. **Проверка на ложность**
   ```javascript
   if (!x) {
     /* falsy: null, undefined, 0, "", false, NaN */
   }
   ```
   Pro: Кратчайший  
   Con: **Неправильная семантика** - обрабатывает `0`, `false`, `""` как nullish

### Почему подход #4 неправилен

Optional chaining **только** проверяет `null`/`undefined`, не ложность:

```typescript
const obj = { value: 0 };
const result = obj?.value; // 0 (НЕ undefined!)
```

С проверкой на ложность:

```javascript
var result = !obj ? undefined : obj.value; // 0 ✓
var result2 = !obj.value ? undefined : obj.value; // undefined ✗ НЕПРАВИЛЬНО!
```

**Следовательно:** Проверка на ложность (`!x`) **семантически некорректна** для `?.`

## Решение

Использовать **явную двойную проверку: `== null || == undefined`** (подход #2)

### Реализация

```typescript
// TypeScript input
const result = obj?.prop;

// BorisScript output (conceptual)
var __tmp;
var result = (__tmp = obj) == null || __tmp == undefined ? undefined : bt.getProperty(__tmp, "prop");
```

**Фактический IR lowering** ([bt-ir/src/lowering/expressions.ts](../../bt-ir/src/lowering/expressions.ts)):

```typescript
function createOptionalCheck(
  expr: IRExpression,
  buildAlternate: (tempRef: IRExpression) => IRExpression,
  ctx: VisitorContext,
  loc?: SourceLocation,
): IRExpression {
  const tempName = ctx.bindings.create("tmp");
  ctx.pendingStatements.push(IR.varDecl(tempName, null));
  const tempRef = IR.id(tempName);

  // (__tmp = expr) == null || __tmp == undefined
  const assignExpr = IR.assign("=", IR.id(tempName), expr);
  const nullCheck = IR.binary("==", IR.grouping(assignExpr), IR.null());
  const undefinedCheck = IR.binary("==", tempRef, IR.id("undefined"));
  const test = IR.logical("||", nullCheck, undefinedCheck);

  const alternate = buildAlternate(tempRef);
  return IR.conditional(test, IR.id("undefined"), alternate, loc);
}
```

### Почему `==` (нестрогое), а не `===` (строгое)?

Для сравнения `null` и `undefined`:

- `x == null` true, если `x` — `null` ИЛИ `undefined` (приведение типов)
- `x === null` true ТОЛЬКО если `x` — точно `null`

**Одного `==` было бы достаточно:**

```javascript
if (x == null) {
  /* покрывает null и undefined */
}
```

**Но мы используем `== null || == undefined` для ясности:**

- Явное намерение (проверка обоих значений)
- Нет зависимости от знания неявного приведения
- Читаемо для разработчиков, незнакомых с семантикой `==`

**Влияние на производительность:** Незначительно - runtime BorisScript не критичен к производительности

## Последствия

### Положительные

✅ **Корректная семантика**

- Точно соответствует поведению TypeScript `?.`
- Не прекращает выполнение на falsy значениях (`0`, `false`, `""`)

✅ **Явно и читаемо**

- Понятно, что проверяется
- Нет "магического" знания приведения типов

✅ **Тестируемо**

- Полное покрытие в `tests/src/propSemantic/`:
  - `falseValue.test.ts` - `?.` возвращает `false`, не `undefined`
  - `zeroValue.test.ts` - `?.` возвращает `0`, не `undefined`
  - `emptyString.test.ts` - `?.` возвращает `""`, не `undefined`
  - `nullValue.test.ts` - `?.` возвращает `undefined` для `null`
  - `optionalChainingUndefined.test.ts` - `?.` возвращает `undefined` для отсутствующего свойства

### Негативные

❌ **Немного многословно**

- Можно было бы использовать только `x == null` (1 проверка вместо 2)
- Генерируемый код длиннее

### Trade-offs

**Многословность против ясности:**

- Выбрана ясность ради краткости
- bt-ir генерирует **исходный код**, не байткод - читаемость важна

**Производительность runtime:**

- Две проверки вместо одной
- Влияние незначительно (optional chaining не в горячих циклах)

## Alternatives Considered

### 1. Loose Equality Alone (`x == null`)

**Idea:** Use type coercion to check both `null` and `undefined`

```javascript
var result = (__tmp = obj) == null ? undefined : bt.getProperty(__tmp, "prop");
```

**Rejected because:**

- Relies on implicit coercion knowledge
- Less explicit intent
- Developer confusion ("why `==` not `===`?")

**Note:** This is semantically correct, just less clear.

### 2. Strict Equality Double Check (`x === null || x === undefined`)

**Idea:** Use strict equality to avoid any coercion

```javascript
var __tmp;
var result = (__tmp = obj) === null || __tmp === undefined ? undefined : bt.getProperty(__tmp, "prop");
```

**Rejected because:**

- No benefit over `==` in this specific case
- Longer code for same result
- `===` is stricter than necessary (coercion doesn't affect null/undefined comparison)

**Note:** This would also work correctly.

### 3. Nullish Coalescing Operator (`??`)

**Idea:** Use `??` instead of conditional

```javascript
var result = (obj ?? undefined).prop;
```

**Rejected because:**

- BorisScript doesn't support `??` operator
- Would still need to transpile `??` to same conditional
- Doesn't solve the problem, just shifts it

### 4. Runtime Helper Function

**Idea:** Create `bt.isNullish(x)` helper

```javascript
var result = bt.isNullish(obj) ? undefined : bt.getProperty(obj, "prop");
```

**Rejected because:**

- Adds runtime function call overhead
- Inline check is clearer in generated code
- Another symbol to polyfill/document

### 5. Truthiness Check (`!x`)

**Idea:** Use JavaScript truthiness

```javascript
var result = !obj ? undefined : bt.getProperty(obj, "prop");
```

**Rejected because:**

- **Wrong semantics** (`0`, `false`, `""` are falsy but not nullish)
- Breaks tests (`falseValue.test.ts`, `zeroValue.test.ts`)
- Not compatible with TypeScript `?.` behavior

## Статус

**Реализовано:** IR pipeline (v0.2.0, ноябрь 2024)

**Покрытие тестами:**

- 20+ тестов в `tests/src/propSemantic/`
- Edge cases: `0`, `false`, `""`, `null`, `undefined`, вложенные цепочки, вызовы методов

**Производительность:**

- Нет измеримого влияния (optional chaining на уровне пользовательского кода, не в hot path)

## Ссылки

- [Реализация Optional Chaining](../../bt-ir/src/lowering/expressions.ts#L91) (createOptionalCheck)
- [Test Suite](../../tests/src/propSemantic/)
- [TypeScript Handbook: Optional Chaining](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-7.html#optional-chaining)
- [Mozilla DN: Optional Chaining](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Optional_chaining)

## Лица, принимающие решения

Главное: Основная команда (архитектурное решение в проектировании IR pipeline)

## Вынесенные уроки

1. **Семантика важна** — truthiness и nullish это разные концепции
2. **Явность помогает** — `== null || == undefined` яснее, чем полагаться на `==` приведение
3. **Тестировать edge cases** — falsy значения (`0`, `false`, `""`) должны тестироваться отдельно
4. **Читаемость кода > краткость** — генерируемый код будет читаться при отладке

---

**Связанные ADR:**

- [ADR 001: IR вместо трансформеров](001-ir-over-transformers.md) — IR позволяет чисто преобразовать `?.`
