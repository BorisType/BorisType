# no-generators

Запрещает использование генераторов (`function*`) и выражений `yield`.

## Причина

BorisScript не поддерживает генераторы. Платформа не имеет итераторного протокола и не может работать с `function*` / `yield`.

Это правило помогает выявить использование генераторов на этапе разработки.

## Что проверяется

- `function*` декларации
- `function*` выражения
- `*method()` в объектах
- `yield` выражения
- `yield*` делегирование

## Примеры

### ❌ Неправильно

```js
// Generator function declaration
function* generateIds() {
  var id = 0;
  while (true) {
    yield id++;
  }
}

// Generator function expression
var gen = function* () {
  yield 1;
  yield 2;
};

// Generator method
var obj = {
  *items() {
    yield "a";
    yield "b";
  },
};

// yield* delegation
function* combined() {
  yield* generateIds();
}
```

### ✅ Правильно

```js
// Return an array
function getItems() {
  return [1, 2, 3];
}

// Callback-based iteration
function processItems(items, callback) {
  for (var i = 0; i < items.length; i++) {
    callback(items[i], i);
  }
}

// Counter via closure
function createCounter() {
  var id = 0;
  return {
    next: function () {
      return id++;
    },
  };
}
```

## Альтернативы

### Массивы вместо генераторов

```js
// Вместо генератора — вернуть массив
function range(start, end) {
  var result = [];
  for (var i = start; i < end; i++) {
    result.push(i);
  }
  return result;
}
```

### Итераторы через замыкания

```js
function createIterator(items) {
  var index = 0;
  return {
    next: function () {
      if (index < items.length) {
        return { value: items[index++], done: false };
      }
      return { value: undefined, done: true };
    },
  };
}
```

## Когда отключать

**Никогда** для кода, предназначенного для BorisScript.

## Связанные правила

- `no-async-await` — запрет async/await
