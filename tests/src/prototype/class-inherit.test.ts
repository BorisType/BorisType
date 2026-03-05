/**
 * Test: basic class inheritance — child inherits parent methods via __proto chain
 * super() вызывает конструктор родителя с текущим __this
 */

class Animal {
    name: string;
    constructor(name: string) {
        this.name = name;
    }
    speak(): string {
        return this.name + " speaks";
    }
}

class Dog extends Animal {
    constructor(name: string) {
        super(name);
    }
    bark(): string {
        return this.name + " barks";
    }
}

const dog: any = new Dog("Rex");

// Собственный метод дочернего класса
botest.assertValueEquals(dog.bark(), "Rex barks", "dog.bark() from own proto");

// Унаследованный метод родительского класса
botest.assertValueEquals(dog.speak(), "Rex speaks", "dog.speak() from parent proto");

// Свойство установлено конструктором через super()
botest.assertValueEquals(dog.name, "Rex", "dog.name set by super(name)");

botest.assertOk();
export {};
