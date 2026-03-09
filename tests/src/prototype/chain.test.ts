// Тест: Многоуровневая цепочка прототипов
const base: any = {
  type: "base",
  getType(): string {
    return this.type;
  },
};

const middle: any = {
  __proto: base,
  level: "middle",
  getLevel(): string {
    return this.level;
  },
};

const leaf: any = {
  __proto: middle,
  name: "leaf-node",
};

// Собственное свойство
botest.assertValueEquals(leaf.name, "leaf-node", "own property 'name'");

// Свойство из middle (1 уровень вверх)
botest.assertValueEquals(leaf.level, "middle", "property from middle proto");

// Свойство из base (2 уровня вверх)
botest.assertValueEquals(leaf.type, "base", "property from base proto");

// Метод из middle — this === leaf
botest.assertValueEquals(leaf.getLevel(), "middle", "getLevel() resolves leaf.level via proto");

// Метод из base — this === leaf, но leaf.type не определён, идёт по цепочке
// leaf.type → middle.__proto.type → base.type
botest.assertValueEquals(leaf.getType(), "base", "getType() resolves leaf.type via proto chain");

botest.assertOk();

export {};
