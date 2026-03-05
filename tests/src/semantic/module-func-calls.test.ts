/**
 * Тест вызовов module-level функций из per-call env и вложенных замыканий.
 *
 * Проверяет что bt.callFunction корректно разрешает дескрипторы
 * module-level функций через __parent цепочку.
 */
import { createProcessor } from "./module-func-calls";

var p1 = createProcessor("p1");
var p2 = createProcessor("p2");

p1.add(5);
p1.add(3);

p2.add(10);

botest.assertValueEquals(p1.getTotal(), 16, "p1 total: helper(5)+helper(3) = 10+6 = 16");
botest.assertValueEquals(p2.getTotal(), 20, "p2 total: helper(10) = 20");
botest.assertValueEquals(p1.describe(), "p1: 16", "p1 describe");
botest.assertValueEquals(p2.describe(), "p2: 20", "p2 describe");

botest.assertOk();

export {};
