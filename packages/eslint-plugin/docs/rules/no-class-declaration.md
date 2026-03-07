# no-class-declaration

Запрещает объявление классов (`class` declarations и expressions).

## Причина

BorisScript не поддерживает ES6 классы. Это правило помогает выявить использование классов на этапе разработки, до транспиляции.

> **Примечание:** `prototype` также не поддерживается в BorisScript. В будущем планируется добавить поддержку классов и prototype в транспилятор.

## Примеры

### ❌ Неправильно

```js
// Class declaration
class Foo {
  constructor(name) {
    this.name = name;
  }

  greet() {
    return "Hello, " + this.name;
  }
}

// Class expression
const Bar = class {
  method() {}
};

// Class with inheritance
class Child extends Parent {
  constructor() {
    super();
  }
}
```

### ✅ Правильно

```js
// Object literal
var Bar = {
  method: function () {},
};

// Factory function (рекомендуемый подход)
function createFoo(name) {
  return {
    name: name,
    greet: function () {
      return "Hello, " + this.name;
    },
  };
}
```

## Альтернативы классам

### Паттерн Factory Function (рекомендуется)

```js
function createPerson(name, age) {
  return {
    name: name,
    age: age,
    introduce: function () {
      return "I am " + this.name + ", " + this.age + " years old";
    },
  };
}

// Использование
var person = createPerson("John", 30);
```

### Композиция объектов

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

// Использование
var dog = createDog("Rex");
```

### Объекты с методами

```js
var Calculator = {
  add: function (a, b) {
    return a + b;
  },
  subtract: function (a, b) {
    return a - b;
  },
};

// Использование
var result = Calculator.add(2, 3);
```

## Когда отключать

Это правило не следует отключать для кода, предназначенного для транспиляции в BorisScript.

Если файл не будет транспилироваться (например, конфигурационные файлы Node.js), можно отключить правило:

```js
/* eslint-disable @boristype/no-class-declaration */
class Config {
  // ...
}
```
