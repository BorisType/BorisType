# Proposal: Destructured Parameters

**Статус:** Не реализовано (diagnostic error)
**Блокируется задачей:** 2gen/A2

## Проблема

Деструктуризация параметров `function f({a, b})` молча пропускается —
параметр не регистрируется, обращения к `a`/`b` внутри функции не работают.

## Текущее поведение

Diagnostic error: `Destructured parameters are not supported: {a, b}`

Код: 90011 (`BtDiagnosticCode.DestructuredParameter`)

## Возможная реализация

Lowering в явные var + property access:

```typescript
// Вход
function f({ a, b, c = 10 }) {
  return a + b + c;
}

// Выход (BS)
function f(__p0) {
  var a = __p0.a;
  var b = __p0.b;
  var c = __p0.c !== undefined ? __p0.c : 10;
  return a + b + c;
}
```

Затронутые компоненты:
- `analyzer/scope-analyzer.ts` — регистрация деструктурированных имён в scope
- `lowering/function-helpers.ts` — извлечение параметров в IR
- Поддержка nested destructuring `{ a: { b } }` — отдельный этап
- Array destructuring `function f([a, b])` — отдельный этап
