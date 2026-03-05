/**
 * Пример для тестирования IR компилятора
 *
 * Этот файл содержит различные конструкции TypeScript
 * для проверки корректности преобразования в IR и генерации кода.
 */

// 1. Простые переменные
const message = "Hello, World!";
let count = 42;
var total = 100;

// 2. Функция
function add(a: number, b: number): number {
  return a + b;
}

// 3. Arrow function
const multiply = (x: number, y: number) => x * y;

// 4. Объект с методом
const calculator = {
  value: 0,
  add(n: number) {
    this.value += n;
    return this.value;
  },
};

// 5. Template literal
const greeting = `Count is ${count}`;

// 6. If/else
function isPositive(n: number): boolean {
  if (n > 0) {
    return true;
  } else {
    return false;
  }
}

// 7. For loop
function sum(arr: number[]): number {
  let result = 0;
  for (let i = 0; i < arr.length; i++) {
    result += arr[i];
  }
  return result;
}

// 8. For-of loop (должен преобразоваться в for-in)
function sumOf(arr: number[]): number {
  let result = 0;
  for (const item of arr) {
    result += item;
  }
  return result;
}

// 9. While loop
function countDown(n: number): void {
  while (n > 0) {
    n--;
  }
}

// 10. Array methods (polyfill)
function doubled(arr: number[]): number[] {
  return arr.map((x) => x * 2);
}

// 11. Number methods (polyfill)
function formatPrice(price: number): string {
  return price.toFixed(2);
}

// 12. Switch
function getDay(n: number): string {
  switch (n) {
    case 0:
      return "Sunday";
    case 1:
      return "Monday";
    default:
      return "Unknown";
  }
}

// 13. Try/catch
function safeParse(json: string): any {
  try {
    return JSON.parse(json);
  } catch (e) {
    return null;
  }
}

// 14. Conditional expression
const max = (a: number, b: number) => (a > b ? a : b);

// 15. Logical expressions
function validate(x: any): boolean {
  return x !== null && x !== undefined;
}
