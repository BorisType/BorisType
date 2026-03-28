// Тест: Отсутствующее свойство возвращает undefined даже при наличии __proto
const proto = {
  existing: "yes",
};

const instance = {
  __proto: proto,
  name: "test",
};

// Свойство которого нет ни в экземпляре, ни в прототипе
const missing = (instance as any).nonExistent;
botest.assertValueEquals(missing, undefined, "missing property should be undefined");

// Свойство из прототипа — должно быть доступно
botest.assertValueEquals((instance as any).existing, "yes", "proto property should be accessible");

// Объект без __proto — обычное поведение
const plain = { a: 1 };
const plainMissing = (plain as any).b;
botest.assertValueEquals(plainMissing, undefined, "plain object missing property should be undefined");

botest.assertOk();

export {};
