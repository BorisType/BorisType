/**
 * Binding Manager - централизованная генерация уникальных имён
 *
 * Обеспечивает единый механизм для:
 * - Генерации имён для временных переменных (__tmp0, __arr1, ...)
 * - Генерации имён для анонимных функций (__arrow0, __func1, ...)
 * - Переименования shadowed переменных (a → a__0, a__1, ...)
 * - Защиты от коллизий с именами из исходного кода
 *
 * @module lowering/binding
 */

/**
 * Менеджер генерации уникальных имён
 *
 * Все сгенерированные имена гарантированно уникальны в пределах
 * одного экземпляра менеджера и не конфликтуют с именами из исходного кода.
 *
 * @example
 * ```typescript
 * const bindings = new BindingManager();
 * bindings.registerSourceNames(["__item", "foo", "bar"]);
 *
 * bindings.create("item");   // "__item0" (если __item0 не занято)
 * bindings.create("arrow");  // "__arrow0"
 * bindings.create("arrow");  // "__arrow1"
 * bindings.temp();           // "__tmp0"
 * bindings.shadow("x");      // "x__0"
 * ```
 */
export class BindingManager {
  /** Счётчики для каждого префикса */
  private counters: Map<string, number> = new Map();

  /** Имена из исходного кода (для проверки коллизий) */
  private sourceNames: Set<string> = new Set();

  /** Все сгенерированные имена (для проверки коллизий) */
  private generatedNames: Set<string> = new Set();

  /**
   * Регистрирует имена из исходного кода для проверки коллизий
   *
   * @param names - Массив имён переменных/функций из исходного файла
   */
  registerSourceNames(names: Iterable<string>): void {
    for (const name of names) {
      this.sourceNames.add(name);
    }
  }

  /**
   * Проверяет, занято ли имя (в исходнике или уже сгенерировано)
   */
  private isNameTaken(name: string): boolean {
    return this.sourceNames.has(name) || this.generatedNames.has(name);
  }

  /**
   * Создаёт уникальное имя с заданным префиксом
   *
   * Гарантирует что имя не конфликтует с:
   * - Именами из исходного кода
   * - Ранее сгенерированными именами
   *
   * @param prefix - Префикс имени (без __)
   * @returns Уникальное имя вида __prefix0, __prefix1, ...
   *
   * @example
   * bindings.create("arrow")  // "__arrow0"
   * bindings.create("obj")    // "__obj0"
   */
  create(prefix: string): string {
    let count = this.counters.get(prefix) ?? 0;
    let name: string;

    // Ищем свободное имя
    do {
      name = `__${prefix}${count}`;
      count++;
    } while (this.isNameTaken(name));

    this.counters.set(prefix, count);
    this.generatedNames.add(name);
    return name;
  }

  /**
   * Создаёт уникальное имя для временной переменной
   *
   * @returns Уникальное имя вида __tmp0, __tmp1, ...
   */
  temp(): string {
    return this.create("tmp");
  }

  /**
   * Создаёт уникальное имя для shadowed переменной
   *
   * Используется когда let/const во вложенном блоке перекрывает
   * переменную из внешнего scope.
   *
   * @param original - Оригинальное имя переменной
   * @returns Уникальное имя вида original__0, original__1, ...
   *
   * @example
   * bindings.shadow("a")  // "a__0"
   * bindings.shadow("a")  // "a__1"
   * bindings.shadow("b")  // "b__0"
   */
  shadow(original: string): string {
    const key = `shadow:${original}`;
    let count = this.counters.get(key) ?? 0;
    let name: string;

    // Ищем свободное имя
    do {
      name = `${original}__${count}`;
      count++;
    } while (this.isNameTaken(name));

    this.counters.set(key, count);
    this.generatedNames.add(name);
    return name;
  }

  /**
   * Создаёт уникальное имя для descriptor функции
   *
   * @param funcName - Имя функции
   * @returns Имя descriptor вида funcName_desc
   */
  descName(funcName: string): string {
    return `${funcName}_desc`;
  }

  /**
   * Создаёт уникальное имя для hoisted вложенной функции (module mode)
   *
   * @param originalName - Оригинальное имя функции
   * @returns Уникальное имя вида __hoisted_originalName_N
   */
  hoistedName(originalName: string): string {
    const key = `hoisted:${originalName}`;
    let count = this.counters.get(key) ?? 0;
    let name: string;
    do {
      name = `__hoisted_${originalName}_${count}`;
      count++;
    } while (this.isNameTaken(name));
    this.counters.set(key, count);
    this.generatedNames.add(name);
    return name;
  }

  /**
   * Сбрасывает все счётчики и имена (для тестирования)
   */
  reset(): void {
    this.counters.clear();
    this.sourceNames.clear();
    this.generatedNames.clear();
  }

  /**
   * Получает текущее значение счётчика (для отладки)
   */
  getCount(prefix: string): number {
    return this.counters.get(prefix) ?? 0;
  }
}

/**
 * Глобальный экземпляр для использования в pipeline
 * Создаётся заново для каждой компиляции
 */
let globalBindings: BindingManager | null = null;

/**
 * Получает текущий BindingManager
 * @throws Если менеджер не инициализирован
 */
export function getBindings(): BindingManager {
  if (!globalBindings) {
    throw new Error("BindingManager not initialized. Call initBindings() first.");
  }
  return globalBindings;
}

/**
 * Инициализирует новый BindingManager для компиляции
 * @returns Созданный менеджер
 */
export function initBindings(): BindingManager {
  globalBindings = new BindingManager();
  return globalBindings;
}

/**
 * Создаёт изолированный BindingManager (для тестов)
 */
export function createBindings(): BindingManager {
  return new BindingManager();
}
