# TODO: Ревью тестов bsParserSafety

Отчёт по ревью от 2026-03-24. Анализ основан на исходниках тестов **и** скомпилированном output.

---

## Критические проблемы

### 1. `literal-extract.test.ts` — НЕ тестирует literal-extract pass вообще

В module mode **все** property access (`"hello".length`, `[1,2,3].length`, `arr[1]`) lowering конвертирует в `BTGetProperty` → `bt.getProperty("hello", "length")`. Literal-extract ищет `Literal`/`ArrayExpression` в `MemberExpression.object`, но **MemberExpression тут нет** — есть `BTGetProperty`.

Доказательство — скомпилированный output:
```js
r1 = bt.getProperty("hello", "length");   // нет __lit0!
r6 = bt.getProperty([1, 2, 3], "length"); // нет __lit1!
r15 = bt.getProperty([10, 20, 30], 1);    // нет __lit2!
```

**Ни одной переменной `__lit`** в output. Pass не затронул ни одну строку. Файл тестирует `bt.getProperty`, а не literal-extract.

**Решение**: нужно тестировать в bare mode, либо написать unit-тесты на уровне IR (compile строки → проверить IR output).

### 2. `combined.test.ts` строки 60-64 — ложная секция "Literal-extract + cleanup-grouping"

```typescript
const arr = [1, 2, 3, 4, 5];
const r7 = (arr).length;
```

`arr` — это **Identifier**, не Literal. Literal-extract **никогда** не трогает идентификаторы. Тут работает **только** cleanup-grouping (убирает скобки вокруг `arr`). Заголовок врёт.

### 3. `combined.test.ts` — секции "Precedence + literal-extract", "All passes", "Nested literal extractions" — все ложные

Output:
```js
r2 = (bt.getProperty("hello", "length") * 2) + 1;  // нет __lit
r10 = bt.callFunction(__env.compute, [((bt.getProperty("abc", "length") * 2) + 1), ...]);  // нет __lit
r11 = (bt.getProperty("ab", "length") + bt.getProperty("cde", "length")) + ...;  // нет __lit
```

Literal-extract **не участвует**. Тесты проверяют parenthesize + comma-safety + bt.getProperty.

---

## Средние проблемы

### 4. `precedence.test.ts` r13-r14 — тестируют явные скобки, а не pass

```typescript
const r13 = (x & y) === 3;   // скобки написаны РУКАМИ в исходнике
const r14 = (1 | 2) === 3;   // скобки написаны РУКАМИ в исходнике
```

Комментарий говорит "Parenthesize pass should handle this", но скобки уже в исходнике. Pass тут ничего не добавляет. Чтобы реально проверить bitwise vs comparison, нужен `x & y === 3` **без** скобок (в JS = `x & (y === 3)` = `3 & true` = `1`).

### 5. `precedence.test.ts` r9-r10 — logical operators lowered до parenthesize

```typescript
const r9 = false && true || true;
const r10 = true || false && false;
```

`&&` и `||` lowered в `bt.isTrue` + conditional **до** parenthesize pass. Parenthesize pass не видит `&&`/`||` — видит conditional expressions и assignment. Тесты проверяют правильность lowering, а не parenthesize.

### 6. `comma-safety.test.ts` r7 — single ternary ложно safe

```typescript
const r7 = first(flag ? 10 : 20);  // описание: "single arg, no wrapping"
```

Output: `r7 = bt.callFunction(__env.first, [__oc2]);` — ternary **извлечён в `__oc2`** перед вызовом. Lowering уже извлекает ternary. Тест утверждает "no wrapping", но extraction есть (из lowering, не из comma-safety).

Аналогично `arr4 = [__oc4]` — single element, но ternary извлечён lowering.

---

## Мелкие проблемы

### 7. `comma-safety.test.ts` — `third` никогда не используется

Функция объявлена, зарегистрирована в `__env`, но ни один assert её не вызывает. Мёртвый код.

### 8. `combined.test.ts` — `first`/`second` (string версии) мёртвый код

Объявлены на строках 32-39, но используются только в закомментированных `.join()` тестах.

### 9. `cleanup-grouping.test.ts` r2 — закомментирован без FIXME

```typescript
// // (someVar).toString() — call на сгруппированном идентификаторе
// const num: any = 42;
// const r2 = (num).toString();
```

Нет объяснения почему закомментирован.

---

## Сводная таблица

| Файл | Что заявлено | Что на самом деле тестирует |
|---|---|---|
| `precedence.test.ts` r1-r7, r15-r16 | parenthesize | **parenthesize** ✅ |
| `precedence.test.ts` r8-r10 | parenthesize (logical) | **lowering** логических операторов ❌ |
| `precedence.test.ts` r13-r14 | parenthesize (bitwise) | **explicit user parens** (pass не задействован) ❌ |
| `comma-safety.test.ts` Groups 1-2,4-7 | comma-safety | **comma-safety** ✅ |
| `comma-safety.test.ts` Group 3 | comma-safety (не оборачивает) | **lowering** (ternary извлекается раньше) ⚠️ |
| `literal-extract.test.ts` всё | literal-extract | **bt.getProperty** (pass не задействован) ❌ |
| `cleanup-grouping.test.ts` | cleanup-grouping | **cleanup-grouping** ✅ |
| `combined.test.ts` r1 | precedence+comma | **precedence+comma** ✅ |
| `combined.test.ts` r2-r3,r10-r13 | literal-extract+X | **precedence+bt.getProperty** ❌ |
| `combined.test.ts` r7 | literal-extract+cleanup | **только cleanup-grouping** ❌ |
