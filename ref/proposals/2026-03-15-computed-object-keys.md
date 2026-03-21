# Proposal: Computed Object Keys

**Статус:** Не реализовано (diagnostic error)
**Блокируется задачей:** 2gen/A1

## Проблема

Computed property keys `{ [expr]: value }` молча отбрасываются при компиляции.
BorisScript не поддерживает computed keys напрямую.

## Текущее поведение

Diagnostic error: `Computed property keys are not supported: <expr>`

Код: 90010 (`BtDiagnosticCode.ComputedPropertyKey`)

## Возможная реализация

Lowering computed keys в явное присваивание:

```typescript
// Вход
const obj = { [key]: value, other: 1 };

// Выход (BS)
var obj = { other: 1 };
obj[key] = value;
```

Сложности:

- Нужно создать временную переменную для объекта
- Порядок property initialization должен сохраняться
- Spread properties комбинация с computed keys
