// Тест: Поиск data-свойства через __proto
const proto = {
  kind: "animal",
  legs: 4,
};

const instance: any = {
  __proto: proto,
  name: "Rex",
};

// Собственное свойство — находится напрямую
botest.assertValueEquals(instance.name, "Rex", "own property 'name' should be Rex");

// Свойства из прототипа — находятся через __proto chain
botest.assertValueEquals(instance.kind, "animal", "proto property 'kind' should be animal");
botest.assertValueEquals(instance.legs, 4, "proto property 'legs' should be 4");

botest.assertOk();

export {};
