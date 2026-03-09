/**
 * Утилиты для примера
 */

/**
 * Приветствие пользователя
 * @param name Имя пользователя
 */
export function greet(name: string): void {
  alert(`Hello, ${name}!`);
  alert(`Welcome to BorisScript Application`);
}

/**
 * Вычисляет сумму чисел в массиве
 * @param numbers Массив чисел
 * @returns Сумма всех чисел
 */
export function calculate(numbers: number[]): number {
  let sum = 0;

  for (const num of numbers) {
    sum += num;
  }

  return sum;
}

/**
 * Форматирует массив в строку
 * @param items Массив элементов
 * @returns Отформатированная строка
 */
export function formatArray<T>(items: T[]): string {
  return `[${items.join(", ")}]`;
}
