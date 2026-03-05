const test1 = 52;
const test2 = 'Hello, World!';

const arrayExample = [1, 2, 3, 4, 5];
const callableArray: Array<() => void> = [];

function someFunction(num: number): void {
  const innerVariable1 = 123;
  alert(innerVariable1);
  const innerVariable2 = 'Inner Hello!';
  alert(innerVariable2);

  for (var item of arrayExample) {
    alert(item);

    const resultValue = item * 2 + num;

    callableArray.push(() => {
      alert(item)
      alert(resultValue);
    });
  }
}

someFunction(10);