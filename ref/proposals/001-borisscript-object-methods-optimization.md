# Proposal 001: Обработка встроенных методов объектов BorisScript

**Дата:** 2026-02-26  
**Статус:** Proposal (к обсуждению)  
**Связанные компоненты:** bt-ir (lowering), runtime

## Проблема

BorisScript предоставляет встроенные методы для работы со свойствами объектов:
- `GetProperty(key)` — получить свойство
- `GetOptProperty(key)` — получить свойство с fallback на undefined  
- `SetProperty(key, value)` — установить свойство
- `AddProperty(key, value)` — добавить свойство
- `HasProperty(key)` — проверить наличие свойства

**Вопрос:** как обрабатывать эти методы, если пользователь явно вызывает их в TypeScript коде?

```typescript
// Что делать с таким кодом?
const value = obj.GetProperty("name");
obj.SetProperty("age", 25);
```

## Текущая реализация

Сейчас эти вызовы обрабатываются **как обычные методы** через `bt.callFunction` + `bt.getProperty`:

```typescript
// Исходный код:
const value = obj.GetProperty("name");

// Транспилируется в:
var value = bt.callFunction(bt.getProperty(obj, "GetProperty"), ["name"]);
```

## Варианты решения

### 1. Оставить как есть
Не делать специальной обработки, обрабатывать как обычные вызовы методов.

**Плюсы:**
- Нет изменений, нет рисков
- Универсальный подход

**Минусы:**
- Избыточная обёртка (двойной вызов)
- Несогласованность: spread использует нативный `obj.GetProperty()`, а явные вызовы — через bt.callFunction

### 2. Заменять на bt.getProperty()
Распознавать вызовы встроенных методов и заменять на runtime helpers.

```typescript
// Исходный код:
const value = obj.GetProperty("name");

// Транспилируется в:
var value = bt.getProperty(obj, "name");
```

**Плюсы:**
- Единообразие с автоматической генерацией доступа к свойствам
- Использование проверенных runtime helpers
- Поддержка всех режимов компиляции

**Минусы:**
- Меняет семантику (если GetProperty имеет специфичное поведение)
- Нужно распознавать эти методы в lowering

### 3. Оставить нативные вызовы
Транслировать напрямую без обёрток.

```typescript
// Исходный код:
const value = obj.GetProperty("name");

// Транспилируется в:
var value = obj.GetProperty("name");
```

**Плюсы:**
- Прямое соответствие, нет overhead
- Согласованность со spread-генерацией

**Минусы:**
- Не работает с null/undefined объектами
- Требует понимания семантики BS методов

### 4. Гибридный подход
Разная обработка для разных методов:
- `GetOptProperty` → заменять на `bt.getProperty` (с null-check)
- `SetProperty` → заменять на `bt.setProperty` (runtime helper для установки свойства)
- `GetProperty` → оставить как есть (или создать специальную функцию `bt.getRequiredProperty` с выбросом ошибки при отсутствии)
- `HasProperty` → заменять на runtime helper для `in` оператора (у нас такого еще нет, нужно создать)
- `AddProperty` → требует исследования

## Открытые вопросы

1. **Семантика методов**
   - Чем `obj.GetProperty("key")` отличается от `bt.getProperty(obj, "key")`?
   - Что делает `GetOptProperty` при отсутствии ключа?
   - Когда использовать `AddProperty` vs `SetProperty`?

2. **Распространённость**
   - Как часто эти методы используются в реальном коде?
   - Есть ли legacy код, зависящий от текущего поведения?

3. **Совместимость**
   - Поддержка в botest эмуляторе
   - Работа в bare режиме
   - XML типы (XmlDocument, XmlElem)

## Следующие шаги

1. Исследовать семантику всех методов в реальном BorisScript
2. Проанализировать использование в существующих проектах
3. Выбрать один из вариантов на основе данных
4. Создать прототип и протестировать

## Ссылки

- [lowering/expressions.ts](../../packages/bt-ir/src/lowering/expressions.ts#L808) — текущая реализация вызовов методов
- [lowering/spread-helpers.ts](../../packages/bt-ir/src/lowering/spread-helpers.ts#L23) — использование GetProperty/SetProperty
- [ir/nodes.ts](../../packages/bt-ir/src/ir/nodes.ts#L686) — определение IRBTGetProperty
- [docs/reference/borisscript-constraints.md](../../docs/reference/borisscript-constraints.md) — ограничения BS

