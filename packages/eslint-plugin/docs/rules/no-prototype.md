# no-prototype

Запрещает использование prototype в любом виде.

## Причина

BorisScript не поддерживает цепочки прототипов. Доступ к `.prototype`, `.__proto__`, а также вызовы `Object.create`, `Object.getPrototypeOf` и `Object.setPrototypeOf` не будут работать на платформе.

Это правило помогает выявить использование прототипов на этапе разработки.

## Что проверяется

- Доступ к `.prototype` (включая `["prototype"]`)
- Доступ к `.__proto__` (включая `["__proto__"]`)
- Вызовы `Object.create()`
- Вызовы `Object.getPrototypeOf()`
- Вызовы `Object.setPrototypeOf()`

## Примеры

### ❌ Неправильно

```js
// Prototype property access
Foo.prototype.bar = function () {};

// Reading prototype
var proto = Foo.prototype;

// __proto__ access
obj.__proto__ = other;

// Computed access
Foo["prototype"].method = function () {};

// Object.create
var child = Object.create(parent);

// Object.getPrototypeOf
var proto = Object.getPrototypeOf(obj);

// Object.setPrototypeOf
Object.setPrototypeOf(child, parent);
```

### ✅ Правильно

```js
// Factory function (рекомендуемый подход)
function createFoo() {
  return {
    bar: function () {},
  };
}

// Plain objects
var obj = {
  method: function () {},
};
```

## Альтернативы

### Паттерн Factory Function (рекомендуется)

```js
function createAnimal(name) {
  return {
    name: name,
    speak: function () {
      return this.name + " makes a sound";
    },
  };
}

function createDog(name) {
  var animal = createAnimal(name);
  return {
    name: animal.name,
    speak: function () {
      return this.name + " barks";
    },
  };
}
```

### Композиция через Object.assign-подобный паттерн

```js
function extend(target, source) {
  for (var key in source) {
    target[key] = source[key];
  }
  return target;
}

function createDog(name) {
  return extend(createAnimal(name), {
    speak: function () {
      return this.name + " barks";
    },
  });
}
```

## Когда отключать

Если файл содержит тесты транспилятора, который преобразует классы в прототипы:

```js
/* eslint-disable @boristype/no-prototype */
```
