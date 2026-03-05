/**
 * Тест __codelibrary resolution через per-call env цепочку.
 *
 * Импортирует функции из codelibrary-module (module mode),
 * где вложенные дескрипторы должны корректно разрешать __codelibrary
 * через __parent цепочку.
 *
 * Если __codelibrary разрешается неверно (lib: undefined),
 * bt.callFunction выбросит ошибку при попытке вызова метода.
 */
import { createCounter, createBlockFactory } from "./codelibrary-module";

// === 1. Per-call env: фабрика счётчиков ===
var c1 = createCounter(0);
var c2 = createCounter(100);

c1.increment();
c1.increment();
c1.increment();

botest.assertValueEquals(c1.getCount(), 3, "c1 should be 3 after 3 increments");
botest.assertValueEquals(c2.getCount(), 100, "c2 should still be 100");

c2.increment();
botest.assertValueEquals(c2.getCount(), 101, "c2 should be 101 after 1 increment");

// === 2. Per-call env + block scope: двойная env вложенность ===
var factory1 = createBlockFactory("hello");
factory1.append("-world");
botest.assertValueEquals(factory1.getState(), "hello-world!", "factory1 state");

var factory2 = createBlockFactory("foo");
factory2.append("bar");
botest.assertValueEquals(factory2.getState(), "foobar!", "factory2 state");

// Проверяем изоляцию
botest.assertValueEquals(factory1.getState(), "hello-world!", "factory1 still isolated");

botest.assertOk();

export {};
