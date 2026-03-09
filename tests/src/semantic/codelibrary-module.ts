/**
 * Модуль для тестирования корректного доступа к __codelibrary
 * через per-call env цепочку.
 *
 * Компилируется в module mode (имеет export), поэтому генерирует
 * __init(__codelibrary, __module) обёртку с дескрипторами.
 *
 * Ключевые сценарии:
 * 1. Функция с captured vars (per-call env) создаёт вложенные замыкания —
 *    дескрипторы должны иметь lib: __fn0_env.__parent.__codelibrary
 * 2. Вложенный block scope внутри per-call env —
 *    дескрипторы должны считать depth через все env-creating scopes
 */

/**
 * Фабрика счётчиков — создаёт объект с методами increment/getCount.
 * basePath captured → per-call env.
 * Методы => дескрипторы с lib, которые должны корректно ссылаться на __codelibrary.
 */
export function createCounter(initial: number) {
  let count = initial;

  return {
    increment() {
      count = count + 1;
    },
    getCount(): number {
      return count;
    },
  };
}

/**
 * Фабрика с block scope: captured vars в if-блоке внутри per-call env.
 * Двойная вложенность env: __fn_env → __block_env → дескриптор.
 */
export function createBlockFactory(prefix: string) {
  let state = prefix;

  if (true) {
    let blockLocal = "!";

    return {
      append(suffix: string) {
        state = state + suffix + blockLocal;
      },
      getState(): string {
        return state;
      },
    };
  }

  // fallback (недоступен)
  return {
    append(_suffix: string) {},
    getState(): string {
      return "";
    },
  };
}
