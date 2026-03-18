# Proposal: break/continue в try-finally

**Статус:** Не реализовано (diagnostic error)
**Блокируется задачей:** 2gen/S2-A
**Связано с:** ADR-010 (try-finally desugaring), типы 3/4

## Проблема

`break`/`continue` внутри `try` блока с `finally` не обрабатываются
pass'ом `try-finally-desugar`. Finally dispatch не перехватывает эти
control flow типы, потенциально некорректный runtime.

## Текущее поведение

Diagnostic error: `Pass "try-finally-desugar" failed: break inside try-finally is not supported`

Детекция реализована в `detectBreakContinueInTry()` — рекурсивный обход
тела try, пропускает функции/циклы/switch (break/continue внутри них валидны).

## Возможная реализация

Расширение state machine из ADR-010:

```
Текущие типы: 0=normal, 1=return, 2=throw
Новые типы: 3=break, 4=continue
```

```typescript
// Вход
for (var i = 0; i < 10; i++) {
  try {
    if (i === 5) break;
  } finally {
    cleanup();
  }
}

// Выход (BS) — расширенный dispatch
for (var i = 0; i < 10; i++) {
  var __fType = 0;
  try {
    if (i === 5) { __fType = 3; /* break */ }
  } finally {
    cleanup();
  }
  if (__fType === 3) break;
}
```

Сложности:
- `continue` с label — нужно хранить target label
- Nested try-finally с break — правильный порядок dispatch
- Взаимодействие с `return` в том же try-finally
