const arr = [1, 2, 3, 4, 1_0];
const obj = { a: 1, b: 2, c: 3 };
const __item = "shadowed";
const __item0 = "also shadowed"; // edge case
for (const item of arr) {
  let dummy = __item; // Проверяем, что __item не затенён
  let dummy0 = __item0; // Проверяем, что __item0 тоже не затенён
  function inner() {
    dummy; // Проверяем, что __item не затенён в замыкании
  }
  alert(item);
  alert(obj.a);
}

for (const item of arr) {
  var dummy = __item; // Проверяем, что __item не затенён
  alert(item);
  alert(obj.b);
}

for (const item of arr) {
  let dummy = __item; // Проверяем, что __item не затенён
  alert(item);
  alert(obj.b);
}

for (const item of arr) {
  let someValue = __item; // Проверяем, что __item не затенён
  alert(item);
  alert(obj.b);
}

for (const item of arr) {
  var someValue = __item; // Проверяем, что __item не затенён
  alert(item);
  alert(obj.b);
}

export {};
