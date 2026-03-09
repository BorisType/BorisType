/**
 * Example backend application
 * Демонстрирует работу с backend в multi-package режиме
 */

import { greet, calculate } from "./utils";

/**
 * Точка входа backend приложения
 */
export function main(): void {
  alert("=== Backend (Multi-package Example) ===");

  greet("BorisScript Developer");

  const numbers = [1, 2, 3, 4, 5];
  const sum = calculate(numbers);

  alert(`Sum of ${numbers.join(", ")} = ${sum}`);
  alert("Backend completed successfully!");
}

// Автоматический запуск
main();
