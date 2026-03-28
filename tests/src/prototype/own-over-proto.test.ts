// Тест: Собственное свойство перекрывает свойство прототипа
const proto: any = {
  value: "from-proto",
  getName(): string {
    return this.name;
  },
};

const instance: any = {
  __proto: proto,
  value: "from-instance",
  name: "Override",
};

// Собственное свойство перекрывает прототипное
botest.assertValueEquals(instance.value, "from-instance", "own property shadows proto property");

// Метод из прототипа доступен и правильно привязывается
botest.assertValueEquals(instance.getName(), "Override", "proto method still works with own properties");

botest.assertOk();

export {};
