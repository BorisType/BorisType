// Тест: Несколько экземпляров одного класса
class Counter {
  count: number;

  constructor(initial: number) {
    this.count = initial;
  }

  increment(): void {
    this.count = this.count + 1;
  }

  getCount(): number {
    return this.count;
  }
}

const a = new Counter(0);
const b = new Counter(10);

// Начальное состояние
botest.assertValueEquals(a.getCount(), 0, "a starts at 0");
botest.assertValueEquals(b.getCount(), 10, "b starts at 10");

// Мутации не влияют друг на друга
a.increment();
a.increment();
a.increment();

botest.assertValueEquals(a.getCount(), 3, "a after 3 increments");
botest.assertValueEquals(b.getCount(), 10, "b unchanged after a.increment");

b.increment();
botest.assertValueEquals(b.getCount(), 11, "b after 1 increment");
botest.assertValueEquals(a.getCount(), 3, "a unchanged after b.increment");

botest.assertOk();

export {};
