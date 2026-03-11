# no-break-in-try-finally

Предупреждает об использовании `break`/`continue` внутри `try`/`catch` блока при наличии `finally`.

## Причина

BorisType десахаризует `try-catch-finally` в конструкции без `finally` (нативный finally в BorisScript работает некорректно). Инлайн-finally **всегда выполняется** после try-catch блока.

Однако `break`/`continue`, которые целят в цикл **снаружи** try, прервут выполнение и **пропустят** инлайн-finally. Эта ситуация пока не обрабатывается транспилятором.

Правило **не срабатывает** на `break`/`continue` внутри вложенных циклов/switch — они безопасны, так как не покидают try-блок.

Подробнее: [ADR 010 — try-finally desugaring](../../../ref/decisions/010-try-finally-desugaring.md).

## Что проверяется

- `break` внутри `try` блока с `finally`, целящий в цикл/switch снаружи try
- `break` внутри `catch` блока с `finally`, целящий в цикл/switch снаружи try
- `continue` внутри `try` блока с `finally`, целящий в цикл снаружи try
- `continue` внутри `catch` блока с `finally`, целящий в цикл снаружи try

## Примеры

### ❌ Неправильно

```js
for (let i = 0; i < 10; i++) {
  try {
    if (i === 5) break; // break целит в for снаружи try
  } finally {
    cleanup();
  }
}

while (condition) {
  try {
    doSomething();
  } catch (e) {
    continue; // continue целит в while снаружи try
  } finally {
    cleanup();
  }
}
```

### ✅ Правильно

```js
// break внутри вложенного цикла — безопасно
try {
  for (let i = 0; i < 10; i++) {
    break; // целит во внутренний for, не покидает try
  }
} finally {
  cleanup();
}

// break в try без finally — нет проблемы
for (let i = 0; i < 10; i++) {
  try {
    break;
  } catch (e) {}
}

// return в try с finally — обрабатывается транспилятором
function foo() {
  try {
    return 1;
  } finally {
    cleanup();
  }
}

// break/continue в finally — безопасно (finally инлайнится)
for (let i = 0; i < 10; i++) {
  try {
    doSomething();
  } finally {
    break;
  }
}
```

## Как исправить

Вынесите цикл внутрь try или уберите finally:

```js
// До (проблема):
for (let i = 0; i < 10; i++) {
  try {
    if (done) break;
  } finally {
    cleanup();
  }
}

// После (вариант 1: цикл внутри try):
try {
  for (let i = 0; i < 10; i++) {
    if (done) break;
  }
} finally {
  cleanup();
}

// После (вариант 2: ручной cleanup):
for (let i = 0; i < 10; i++) {
  try {
    if (done) {
      cleanup();
      break;
    }
  } catch (e) {
    cleanup();
    throw e;
  }
  cleanup();
}
```
