/**
 * Тест per-call env для функций с captured локальными переменными.
 *
 * Проверяет что:
 * 1. Каждый вызов функции создаёт отдельное окружение
 * 2. Повторные вызовы не расшаривают state (shared-state баг)
 * 3. Вложенные замыкания корректно видят per-call данные
 * 4. Доступ к parent-scope переменным работает через __parent цепочку
 */

// === 1. Shared-state: два вызова одной функции не расшаривают state ===

function createCounter(initial: number) {
    let count = initial;

    return {
        increment() {
            count = count + 1;
        },
        getCount(): number {
            return count;
        }
    };
}

const counter1 = createCounter(0);
const counter2 = createCounter(100);

counter1.increment();
counter1.increment();
counter2.increment();

botest.assertValueEquals(counter1.getCount(), 2, "counter1 should be 2 after two increments");
botest.assertValueEquals(counter2.getCount(), 101, "counter2 should be 101 after one increment");

// === 2. Captured param + captured local variable ===

function makeGreeter(prefix: string) {
    const suffix = "!";

    return (name: string): string => {
        return prefix + " " + name + suffix;
    };
}

const greetHello = makeGreeter("Hello");
const greetBye = makeGreeter("Bye");

botest.assertValueEquals(greetHello("World"), "Hello World!", "greetHello('World') should be 'Hello World!'");
botest.assertValueEquals(greetBye("World"), "Bye World!", "greetBye('World') should be 'Bye World!'");

// === 3. Per-call env с доступом к parent scope ===

const globalMultiplier = 10;

function createMultiplier(base: number) {
    const fn = (x: number): number => {
        return base * x * globalMultiplier;
    };
    return fn;
}

const mul2 = createMultiplier(2);
const mul3 = createMultiplier(3);

botest.assertValueEquals(mul2(5), 100, "mul2(5) should be 2*5*10=100");
botest.assertValueEquals(mul3(5), 150, "mul3(5) should be 3*5*10=150");

// === 4. Nested function declarations with per-call env ===

function outer(x: number) {
    function inner(y: number): number {
        return x + y;
    }
    return inner(10);
}

botest.assertValueEquals(outer(5), 15, "outer(5) should return 5+10=15");
botest.assertValueEquals(outer(20), 30, "outer(20) should return 20+10=30");


botest.assertOk();

export {};
