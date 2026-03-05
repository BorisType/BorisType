const arr = [1, 2, 3, 4, 1_0];
const obj = { a: 1, b: 2, c: 3 };
const __item = "shadowed";
const __item0 = "also shadowed"; // edge case

// Цикл 1: item captured в замыкании — должен быть __env.item
for (const item of arr) {
    function inner() {
        __item;
        alert(__item0);
        item; // item используется в замыкании
    }
    alert(item);
}

// Цикл 2: item НЕ captured — НЕ должно быть __env.item
for (const govno of arr) {
    alert(govno);
}

// Цикл 3: dummy captured, но не item — НЕ должно быть __env.item
for (const item of arr) {
    let dummy = __item;
    function inner() {
        dummy; // dummy captured, item — нет
    }
    alert(item);
}