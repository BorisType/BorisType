/**
 * Single package example
 * Демонстрирует работу с одним пакетом в legacy режиме
 */

import { greet, calculate } from './utils';

/**
 * Точка входа приложения
 */
export function main(): void {
  alert('=== Single Package Example ===');
  
  greet('BorisScript Developer');
  
  const numbers = [1, 2, 3, 4, 5];
  const sum = calculate(numbers);
  
  alert(`Sum of ${numbers.join(', ')} = ${sum}`);
  alert('Application completed successfully!');
}

// Автоматический запуск
main();
