// Тест: Метод из прототипа биндится к реальному экземпляру
const proto: any = {
  getName(): string {
    return this.name;
  },
  greet(): string {
    return "Hello, " + this.name + "!";
  },
};

const dog: any = {
  __proto: proto,
  name: "Rex",
};

const cat: any = {
  __proto: proto,
  name: "Whiskers",
};

// Вызов метода из прототипа — this должен быть экземпляром, а не прототипом
botest.assertValueEquals(dog.getName(), "Rex", "dog.getName() should return Rex");
botest.assertValueEquals(cat.getName(), "Whiskers", "cat.getName() should return Whiskers");

botest.assertValueEquals(dog.greet(), "Hello, Rex!", "dog.greet() should greet Rex");
botest.assertValueEquals(cat.greet(), "Hello, Whiskers!", "cat.greet() should greet Whiskers");

botest.assertOk();

export {};
