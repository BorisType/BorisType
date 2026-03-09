/**
 * Модуль для теста вызовов module-level функций из per-call env.
 *
 * Проверяет что вызовы функций, объявленных на module level,
 * корректно разрешаются через __parent цепочку внутри per-call env.
 */

function helper(x: number): number {
  return x * 2;
}

function formatter(prefix: string, value: number): string {
  return prefix + ": " + String(value);
}

export function createProcessor(name: string) {
  let total = 0;

  return {
    add(x: number) {
      total = total + helper(x);
    },
    getTotal(): number {
      return total;
    },
    describe(): string {
      return formatter(name, total);
    },
  };
}
