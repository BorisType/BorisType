/**
 * Test: child class overrides parent method
 */

class Animal {
  name: string;
  constructor(name: string) {
    this.name = name;
  }
  speak(): string {
    return this.name + " speaks";
  }
  getType(): string {
    return "animal";
  }
}

class Cat extends Animal {
  constructor(name: string) {
    super(name);
  }
  // Переопределяем speak
  speak(): string {
    return this.name + " meows";
  }
}

const animal: any = new Animal("Generic");
const cat: any = new Cat("Whiskers");

// Родительский класс — оригинальный метод
botest.assertValueEquals(animal.speak(), "Generic speaks", "animal.speak() original");
botest.assertValueEquals(animal.getType(), "animal", "animal.getType()");

// Дочерний класс — переопределённый метод
botest.assertValueEquals(cat.speak(), "Whiskers meows", "cat.speak() overridden");

// Дочерний класс — унаследованный метод (не переопределён)
botest.assertValueEquals(cat.getType(), "animal", "cat.getType() inherited from parent");

// Свойства установлены через super()
botest.assertValueEquals(cat.name, "Whiskers", "cat.name");

botest.assertOk();
export {};
