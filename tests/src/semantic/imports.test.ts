// Test import logic — live binding via moduleVar.exportedName
import { getInstance } from "./moduleA";

var instance = getInstance();
alert(instance.counter); // Should be 0
botest.assertValueEquals(instance.counter, 0, "initial counter");

instance.increment();
alert(instance.counter); // Should be 1
botest.assertValueEquals(instance.counter, 1, "after increment");

instance.decrement();
alert(instance.counter); // Should be back to 0
botest.assertValueEquals(instance.counter, 0, "after decrement");

botest.assertOk();

export {}