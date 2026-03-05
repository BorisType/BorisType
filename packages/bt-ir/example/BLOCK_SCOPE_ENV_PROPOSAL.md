# Block Scope Env: анализ предложения

## Проблема (5.ts)

```javascript
function createFunctions() {
    let x = 10;
    const y = 20;
    funcs.push(() => console.log(x, y));  // closure 1
    x = 100;
    funcs.push(() => console.log(x, y));  // closure 2
    return funcs;
}
// f1() → 100 20, f2() → 100 20  (JS: оба видят одну и ту же x)
```

**Текущее поведение BS:** копируем значения в env замыкания при создании:
- arrow0_env = { x: 10, y: 20 } → f1() → **10 20**
- arrow1_env = { x: 100, y: 20 } → f2() → **100 20**

**Ожидаемое (как в JS):** оба замыкания разделяют один block scope, x мутируется → оба видят **100 20**.

---

## Корневая причина

В JS `let`/`const` в блоке создают **block scope**. Замыкания захватывают **ссылку на этот scope**, а не копию значений. При `x = 100` меняется одна и та же переменная, которую видят оба замыкания.

Сейчас мы опираемся только на **function scope** и копируем значения в env замыкания. Для `let` это неверно: нужна ссылка на общий block scope.

---

## Предложенное решение: Block Scope Env

### Идея

1. Для блоков с captured `let`/`const` создавать **block env**: `__blockN_env = { __parent: __env }`.
2. Переменные блока хранить в block env: `__blockN_env.x = 10`, `__blockN_env.y = 20`.
3. Замыкания не копируют переменные, а используют block env как `__parent`.
4. В циклах — **новый block env на каждую итерацию** (как сейчас для loop variable).

### Семантика

| Сценарий | Block env | Поведение |
|----------|-----------|-----------|
| Обычный блок (if, `{}`) | Один на блок | Общий scope, мутации видны всем замыканиям |
| Тело for-of/for-in | Новый на каждую итерацию | Per-iteration scope, как в JS |

---

## Схема для 5.ts

**Текущее (ошибочное):**
```
createFunctions_env = { __parent: __env }
__env.x = 10, __env.y = 20
arrow0_env = { __parent: createFunctions_env, x: 10, y: 20 }  // копия
arrow1_env = { __parent: createFunctions_env, x: 100, y: 20 }   // копия
```

**Предлагаемое:**
```
__block0_env = { __parent: createFunctions_env }
__block0_env.x = 10
__block0_env.y = 20

arrow0_env = { __parent: __block0_env }   // без копии
arrow1_env = { __parent: __block0_env }   // без копии

__block0_env.x = 100  // мутация

// При вызове: __env.__parent.x → __block0_env.x → 100
```

---

## Упрощение: убрать лишний уровень env

Сейчас: `arrow_env = { __parent: __env, x: ..., y: ... }` — у замыкания свой env с копиями.

С block env: `arrow_env = __block0_env` — замыкание получает block env напрямую.

Тогда:
- доступ к block vars: `__env.x` (depth=0)
- доступ к function vars: `__env.__parent.x` (depth=1)
- доступ к module vars: `__env.__parent.__parent.x` (depth=2)

Один уровень `__parent` убирается, т.к. не создаём промежуточный env замыкания.

---

## Что нужно для внедрения

### 1. Scope Analyzer

- [ ] Помечать block scopes с captured переменными (аналог `hasCaptured` для блоков).
- [ ] Различать «shared block» (if, `{}`) и «per-iteration block» (тело for-of/for-in).
- [ ] Добавить `blockHasCaptured` или `needsBlockEnv` для block scope.

### 2. IR / Lowering

- [ ] **Block env declaration**: новая IR-нода или расширение для `var __blockN_env = { __parent: __env }`.
- [ ] **Присваивания в block env**: для `let`/`const` в блоке с captured — писать в `__blockN_env.x`, а не в `__env.x` или локальную var.
- [ ] **buildFunction**: не копировать `const`/`let` из block scope; использовать `__parent: blockEnv`.
- [ ] **visitBlock**: при входе в блок с captured — создавать block env и передавать его в контекст.
- [ ] **visitForOfStatement**: создавать block env на каждую итерацию (уже частично есть для loop var).

### 3. Variable resolution

- [ ] **visitIdentifier** (captured): считать depth через `getEnvDepth` с учётом block scopes.
- [ ] **collectCapturedVarsForArrow**: разделять переменные из block scope и function scope; для block scope возвращать ссылку на block env, а не копию.

### 4. Emitter

- [ ] Генерация `var __blockN_env = { __parent: __env }`.
- [ ] Присваивания в block env: `__blockN_env.x = value`.

---

## Подводные камни

### 1. Вложенные блоки

```javascript
{
  let x = 1;
  {
    let y = 2;
    () => { x; y; }
  }
}
```

Нужна цепочка: `__block1_env = { __parent: __block0_env, y: 2 }`, `__block0_env = { __parent: __env, x: 1 }`. Замыкание получает `__block1_env`. Доступ к `x`: `__env.__parent.x`, к `y`: `__env.y`.

### 2. Блоки без captured

Блок env создаём только если в блоке есть captured `let`/`const`. Иначе — лишние объекты.

### 3. `const` и оптимизация

Для `const` можно было бы копировать (значение не меняется), но:
- единый механизм проще;
- в циклах block env всё равно per-iteration;
- в обычном блоке `const` не мутируется, но ссылка на block env не дороже копирования примитива.

Рекомендация: не выделять отдельную оптимизацию для `const`, использовать общий механизм.

### 4. Порядок инициализации

Block env должен создаваться при входе в блок, до любых объявлений. Для `if` — в начале then/else. Для цикла — в начале тела на каждой итерации.

### 5. `var` в блоке

`var` hoist’ится в function scope, block env для него не нужен. Текущая логика (доступ через `__parent`) остаётся.

### 6. Loop variable + другие let/const в теле

```javascript
for (const i of arr) {
  let x = i;
  () => { alert(x); }
}
```

Один block env на итерацию: `__iter_env = { __parent: __env, i: ..., x: ... }`. Loop var и `x` в одном env. Корректно.

---

## Альтернативы

### A. Копировать только при мутации

Анализировать, мутируется ли `let` после создания замыкания. Если нет — копировать; если да — использовать block env. Сложнее в анализе и поддержке.

### B. Всегда использовать block env для let/const

Не копировать никогда. Проще, единообразно, возможна небольшая избыточность для `const` в не-циклах.

### C. Только для блоков с замыканиями

Создавать block env только если в блоке есть замыкание, захватывающее локальные переменные. Уже заложено в «block with captured».

---

## Рекомендация

Решение с block scope env корректно и хорошо ложится на модель BS. Основные шаги:

1. Ввести block env только для блоков с captured `let`/`const`.
2. Не копировать `const`/`let` из block scope в env замыкания; использовать block env как `__parent`.
3. В циклах создавать новый block env на каждую итерацию.
4. Упростить env замыкания до `{ __parent: blockEnv }` или `blockEnv` напрямую.
5. Обновить `getEnvDepth` для учёта block scopes.

---

## План внедрения (порядок)

1. **Scope analyzer**: `blockHasCaptured`, различение shared/per-iteration block.
2. **IR**: нода для block env (или расширение существующей).
3. **visitBlock**: создание block env при входе в блок с captured.
4. **visitVariableStatement** (в блоке): присваивание в block env вместо `__env` или var.
5. **visitForOfStatement**: объединить loop var и остальные let/const в одном block env на итерацию.
6. **buildFunction / collectCapturedVarsForArrow**: для block-scope переменных — `__parent: blockEnv`, без копирования.
7. **visitIdentifier**: depth с учётом block scopes.
8. **Emitter**: генерация block env и присваиваний в него.
