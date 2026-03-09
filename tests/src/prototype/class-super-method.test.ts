/**
 * Test: super.method() — вызов метода родительского класса из переопределённого метода
 */

class Animal {
  name: string;
  constructor(name: string) {
    this.name = name;
  }
  describe(): string {
    return "I am " + this.name;
  }
}

class Dog extends Animal {
  breed: string;
  constructor(name: string, breed: string) {
    super(name);
    this.breed = breed;
  }
  // Вызываем родительский describe() и дополняем
  describe(): string {
    return super.describe() + ", a " + this.breed;
  }
}

const dog: any = new Dog("Rex", "Labrador");

// super.describe() вызвал Animal.describe() с __this = dog
botest.assertValueEquals(
  dog.describe(),
  "I am Rex, a Labrador",
  "dog.describe() uses super.describe()",
);

// Свойства установлены через super() и собственный конструктор
botest.assertValueEquals(dog.name, "Rex", "dog.name from super(name)");
botest.assertValueEquals(dog.breed, "Labrador", "dog.breed from own ctor");

botest.assertOk();
export {};
