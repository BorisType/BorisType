# 003: Классы и прототипы — реализация OOP в BorisScript

**Дата:** 2026-02-28  
**Статус:** Реализовано (базовая версия)  
**Связанные компоненты:** bt-ir (lowering, scope-analyzer), builtin-runtime (semantic.ts), botest (тесты)

---

## Контекст

BorisScript не имеет встроенной поддержки классов, `new`, `extends`, `super`, `prototype` и других ООП-конструкций. Язык оперирует плоскими объектами (`JsObject`), массивами (`JsArray`) и функциями (`JsFuncObject`). Прямой аналог JS prototype chain отсутствует.

Цель — реализовать транспиляцию TypeScript-классов в низкоуровневые конструкции BorisScript, сохраняя семантику:

- Конструкторы, методы, свойства экземпляра
- Наследование (`extends`)
- Вызов родительского конструктора и методов (`super()`, `super.method()`)
- Множественные экземпляры с общим прототипом
- Переопределение методов в дочерних классах

---

## Архитектура решения

### Принцип: «Всё через `__env`»

Классы следуют тому же паттерну, что и обычные функции. Имя класса регистрируется в `__env` как дескриптор конструктора. Доступ к классу из любого контекста идёт через цепочку `__env` / `__env.__parent`.

Это означает:

- Scope analyzer регистрирует класс с `kind: "function"` (не `"const"`)
- `resolveCallableRef()` — общий хелпер для резолва и функций, и классов через `__env`
- Отдельная переменная `var ClassName = ctor_desc` **не создаётся** (убрана как избыточная)
- Конструктор **не создаёт собственный `_env`**, а использует `ctx.currentEnvRef` (обычно `__env`)

### Ключевые runtime-функции

| Функция                                | Назначение                                                          |
| -------------------------------------- | ------------------------------------------------------------------- |
| `bt.getProperty(obj, key)`             | Доступ к свойствам + поиск по proto chain + binding методов         |
| `bt.setProperty(obj, key, value)`      | Установка свойства на объекте                                       |
| `bt.callFunction(desc, args)`          | Вызов функции через дескриптор                                      |
| `bt.createInstance(ctorDesc, args)`    | Создание экземпляра: `{ __proto: ctor.proto }` + вызов конструктора |
| `bt.callWithThis(desc, thisArg, args)` | Вызов дескриптора с подменённым `__this` (для `super`)              |
| `bt.isFunction(value)`                 | Проверка, является ли значение дескриптором функции                 |

---

## Алгоритмы

### 1. Транспиляция объявления класса (`visitClassDeclaration`)

**Вход** (TypeScript):

```typescript
class Animal {
  name: string;
  constructor(name: string) {
    this.name = name;
  }
  speak(): string {
    return this.name + " speaks";
  }
}
```

**Шаги транспиляции:**

1. **Парсинг членов класса:**
   - `ConstructorDeclaration` → конструктор
   - `MethodDeclaration` → методы (добавляются в прототип)
   - `PropertyDeclaration` с initializer → property initializers (вставляются в начало конструктора)

2. **Генерация методов:**
   Каждый метод → отдельная hoisted функция + дескриптор:

   ```javascript
   function Animal_speak(__env, __this, __args) {
     return bt.getProperty(__this, "name") + " speaks";
   }

   Animal_speak_desc = {
     "@descriptor": "function",
     obj: undefined,
     env: __env,
     callable: Animal_speak,
   };
   ```

3. **Создание объекта-прототипа:**

   ```javascript
   Animal_proto = {
     speak: Animal_speak_desc,
   };
   ```

4. **Генерация конструктора:**
   Конструктор — обычная функция. Property initializers вставляются **перед** телом конструктора:

   ```javascript
   function Animal_ctor(__env, __this, __args) {
     var name = __args.length > 0 ? __args[0] : undefined;
     bt.setProperty(__this, "name", name);
   }
   ```

5. **Регистрация конструктора в `__env`:**

   ```javascript
   Animal_ctor_desc = {
     "@descriptor": "function",
     obj: undefined,
     env: __env,
     callable: Animal_ctor,
   };
   __env.Animal = Animal_ctor_desc;
   ```

6. **Привязка прототипа к дескриптору конструктора:**
   ```javascript
   Animal_ctor_desc.proto = Animal_proto;
   ```

**Итоговая структура:**

```
__env.Animal = {
    @descriptor: "function",
    obj: undefined,
    env: __env,
    callable: Animal_ctor,
    proto: {
        speak: Animal_speak_desc
    }
}
```

### 2. Инстанцирование (`new ClassName(args)`)

**Вход:** `new Animal("Rex")`  
**Выход:** `bt.createInstance(__env.Animal, ["Rex"])`

**Алгоритм `bt.createInstance`:**

1. Извлечь `proto` из дескриптора конструктора
2. Создать новый объект: `{ __proto: proto }`
3. Вызвать конструктор с `instance` как `__this`
4. Вернуть `instance`

```typescript
function createInstance(ctorDesc, args) {
  const proto = ctorDesc.proto;
  const instance = { __proto: proto };
  // Вызов конструктора: callable(env, instance, args)
  ctorDesc.callable(ctorDesc.env, instance, args);
  return instance;
}
```

### 3. Поиск по цепочке прототипов (`lookupPrototypeChain`)

При вызове `bt.getProperty(obj, key)`:

1. Сначала ищем свойство на самом объекте (`GetOptObjectProperty`)
2. Если не найдено и объект — `JsObject`, запускаем `lookupPrototypeChain`
3. Проходим по цепочке `__proto` → `__proto.__proto` → ... пока не найдём или не дойдём до `undefined`

**Обработка найденных значений:**

- Обычное значение → возвращаем как есть
- Дескриптор функции → **биндим к исходному объекту** (method binding)
- `JsFuncObject` → возвращаем как есть

### 4. Привязка методов к экземпляру (Method Binding — Variant A)

Когда метод найден в прототипе, нужно привязать его к конкретному экземпляру (чтобы `__this` указывал на экземпляр, а не на прототип).

**Variant A — копия дескриптора** (текущая реализация):

```typescript
function bindMethodToObject(descriptor, targetObject) {
  const newDesc = { "@descriptor": "function" };
  newDesc.obj = targetObject; // ← привязываем к экземпляру
  newDesc.env = descriptor.env;
  newDesc.callable = descriptor.callable; // или lib+ref
  return newDesc;
}
```

При вызове `bt.callFunction(desc, args)` — `desc.obj` передаётся как `__this`.

### 5. Наследование (`extends`)

**Вход:**

```typescript
class Dog extends Animal {
  constructor(name: string) {
    super(name);
  }
  bark(): string {
    return this.name + " barks";
  }
}
```

**Транспиляция наследования:**

1. **Парсинг heritage clause:**
   Из `extends Animal` извлекаем AST-узел `Animal` как `baseClassExpr`.

2. **Цепочка прототипов:**
   После создания `Dog_proto` добавляется:

   ```javascript
   Dog_proto.__proto = __env.Animal.proto;
   ```

   Это связывает прототипы: при поиске метода на `Dog_proto` — если не найден, `lookupPrototypeChain` пойдёт в `Animal_proto`.

3. **Резолв базового класса:**
   Используется `resolveCallableRef(baseClassName, ctx)`, который резолвит через `__env` — так же, как обычные функции. Это корректно работает на любом уровне вложенности.

**Результат:**

```javascript
Dog_proto = { bark: Dog_bark_desc };
Dog_proto.__proto = __env.Animal.proto;
```

### 6. Вызов `super(args)` в конструкторе

**Вход:** `super(name)` внутри `Dog.constructor`  
**Выход:** `bt.callWithThis(__env.Animal, __this, [name])`

**Алгоритм:**

1. В `VisitorContext` устанавливается `superContext: { baseClassExpr }` при обработке конструктора класса с `extends`
2. При встрече `super(args)` в `visitCallExpression`:
   - Резолвим базовый класс: `resolveCallableRef(baseClassExpr.text, ctx)` → `__env.Animal`
   - Генерируем: `bt.callWithThis(__env.Animal, __this, [args])`
3. `bt.callWithThis` вызывает конструктор родителя с `__this` текущего экземпляра

**Почему `callWithThis`, а не `callFunction`?**  
`callFunction` берёт `__this` из `desc.obj`, а нам нужно передать конкретный `__this` — текущий создаваемый экземпляр. `callWithThis` позволяет явно указать `thisArg`.

### 7. Вызов `super.method(args)`

**Вход:** `super.describe()` внутри метода `Dog.describe()`  
**Выход:** `bt.callWithThis(bt.getProperty(__env.Animal.proto, "describe"), __this, [])`

**Алгоритм:**

1. При встрече `super.method(args)` в `visitCallExpression`:
   - Резолвим базовый класс → `__env.Animal`
   - Получаем метод из proto родителя: `bt.getProperty(__env.Animal.proto, "method")`
   - Вызываем с текущим `__this`: `bt.callWithThis(method, __this, [args])`

**Пример полного вывода:**

```javascript
function Dog_describe(__env, __this, __args) {
  return bt.callWithThis(bt.getProperty(__env.Animal.proto, "describe"), __this, []) + ", a " + bt.getProperty(__this, "breed");
}
```

---

## Scope Analysis

Класс регистрируется в scope analyzer как `kind: "function"`:

```typescript
// scope-analyzer.ts
if (ts.isClassDeclaration(node) && node.name) {
  const targetScope = findFunctionOrModuleScope(currentScope);
  registerVariable(targetScope, node.name.text, "function", allVariables);
}
```

Это обеспечивает:

- Регистрацию имени класса в `__env` (как `__env.Animal`)
- Корректный captured-доступ из вложенных функций через `__env.__parent` цепочку
- Единообразное поведение с функциями через `resolveCallableRef`

---

## Хелпер `resolveCallableRef`

Общий хелпер для резолва функций и классов через `__env`:

```typescript
function resolveCallableRef(name, ctx, loc?) {
  const varInfo = resolveVariableInScope(name, ctx.currentScope);
  const actualName = varInfo?.renamedTo ?? name;

  // Captured → резолв через __env.__parent цепочку
  if (varInfo?.isCaptured) {
    const capturedName = varInfo.kind === "function" ? name : actualName;
    return resolveEnvAccess(varInfo.declarationScope, capturedName, ctx, loc);
  }

  // Function kind → всегда через __env
  if (varInfo?.kind === "function") {
    return IR.dot(IR.id(ctx.currentEnvRef), name, loc);
  }

  // Остальное → напрямую по имени
  return IR.id(actualName, loc);
}
```

Используется в:

- `visitCallExpression` — резолв `func()` вызовов
- `visitNewExpression` — резолв `new Class()`
- `super()` / `super.method()` — резолв базового класса
- `visitClassDeclaration` — резолв базового класса для `__proto` chain

---

## Тестовое покрытие

### Прототипы (низкоуровневые тесты)

| Тест                      | Описание                                      |
| ------------------------- | --------------------------------------------- |
| `data-property.test.ts`   | Поиск data-свойства через `__proto`           |
| `method-bind.test.ts`     | Привязка метода из прототипа к экземпляру     |
| `chain.test.ts`           | Многоуровневая цепочка прототипов (3 уровня)  |
| `own-over-proto.test.ts`  | Собственное свойство перекрывает прототипное  |
| `proto-undefined.test.ts` | Отсутствующее свойство возвращает `undefined` |

### Классы (базовые)

| Тест                           | Описание                                              |
| ------------------------------ | ----------------------------------------------------- |
| `class-basic.test.ts`          | Конструктор + методы + несколько экземпляров          |
| `class-no-ctor.test.ts`        | Класс без явного конструктора (property initializers) |
| `class-multi-instance.test.ts` | Мутация одного экземпляра не влияет на другой         |
| `class-prop-init.test.ts`      | Property initializers + перезапись в конструкторе     |

### Наследование и super

| Тест                             | Описание                                                             |
| -------------------------------- | -------------------------------------------------------------------- |
| `class-inherit.test.ts`          | `Dog extends Animal` + `super(name)` + унаследованный метод          |
| `class-inherit-override.test.ts` | Переопределение метода + сохранение унаследованных                   |
| `class-inherit-chain.test.ts`    | 3-уровневая цепочка: `Base → Middle → Leaf`                          |
| `class-super-method.test.ts`     | `super.describe()` — вызов родительского метода из переопределённого |

**Всего:** 13 тестов, все проходят.

---

## Ограничения и известные проблемы

### Не реализовано

- **`instanceof`** — нет проверки принадлежности к классу
- **Статические методы/свойства** — `static method()` не поддерживается
- **Геттеры/сеттеры** — `get x()` / `set x()` не поддерживаются
- **Абстрактные классы** — `abstract class` не обрабатывается
- **Private/protected** — модификаторы доступа игнорируются
- **Computed property names** — `[Symbol.iterator]()` и подобное
- **Множественное наследование** — не применимо (TypeScript тоже не поддерживает)

### Известные баги

- **`@ts-nocheck` + `declare const`:** при использовании `// @ts-nocheck` компилятор не видит `declare const bt` и эмитит `var bt = undefined;`, что ломает runtime. Текущий workaround — не использовать `declare const` в test-файлах (типы берутся из type roots).

### Потенциальные оптимизации

- **Убрать создание `_env` для обычных функций без captures:** сейчас каждая функция с `hasCaptured` создаёт `{ "__parent": __env }`, но для конструкторов классов мы уже отказались от этого (используем `ctx.currentEnvRef` напрямую). Та же оптимизация применима к обычным функциям.
- **Method binding кеш (Variant B):** текущий Variant A создаёт копию дескриптора при каждом доступе к методу. Variant B мог бы кешировать привязанные дескрипторы на экземпляре, но усложняет реализацию.

---

## Диаграмма структур данных

### Экземпляр после `new Dog("Rex")`

```
dog = {
    __proto: Dog_proto,
    name: "Rex"           ← установлено конструктором через super()
}

Dog_proto = {
    bark: Dog_bark_desc,
    __proto: Animal_proto  ← связь наследования
}

Animal_proto = {
    speak: Animal_speak_desc
}
```

### Резолв `dog.speak()`

```
1. bt.getProperty(dog, "speak")
2. dog.speak → undefined (нет собственного)
3. lookupPrototypeChain(dog, "speak")
4. dog.__proto → Dog_proto
5. Dog_proto.speak → undefined (нет)
6. Dog_proto.__proto → Animal_proto
7. Animal_proto.speak → Animal_speak_desc ✓
8. bindMethodToObject(Animal_speak_desc, dog) → { ...desc, obj: dog }
9. bt.callFunction(boundDesc, []) → Animal_speak(__env, dog, [])
10. → dog.name + " speaks" → "Rex speaks"
```

---

## Связанные решения

- [ADR-006: Unified Env Resolution](../decisions/006-unified-env-resolution.md) — единообразное разрешение переменных через `__env`
- [Proposal 001: Object Methods Optimization](001-borisscript-object-methods-optimization.md) — обработка встроенных методов объектов
