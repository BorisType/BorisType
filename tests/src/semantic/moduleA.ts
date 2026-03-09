export function getInstance() {
  alert(AbsoluteUrl("test"));

  return {
    file: "test",
    counter: 0,
    increment() {
      this.counter = this.counter + 1;
    },
    decrement() {
      this.counter = this.counter - 1;
    },
  };
}
