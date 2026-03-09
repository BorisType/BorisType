// Тест: Базовый класс с конструктором и методом
class Animal {
  name: string;

  constructor(name: string) {
    this.name = name;
  }

  speak(): string {
    return this.name + " speaks";
  }

  getName(): string {
    return this.name;
  }
}

const dog = new Animal("Rex");
const cat = new Animal("Whiskers");

// Свойства экземпляра
botest.assertValueEquals(dog.name, "Rex", "dog.name should be Rex");
botest.assertValueEquals(cat.name, "Whiskers", "cat.name should be Whiskers");

// Методы из прототипа (биндятся к экземпляру)
botest.assertValueEquals(dog.speak(), "Rex speaks", "dog.speak()");
botest.assertValueEquals(cat.speak(), "Whiskers speaks", "cat.speak()");

botest.assertValueEquals(dog.getName(), "Rex", "dog.getName()");
botest.assertValueEquals(cat.getName(), "Whiskers", "cat.getName()");

botest.assertOk();

export {};
