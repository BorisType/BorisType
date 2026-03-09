// Простая цепочка только из .map()
const arr1 = [1, 2, 3];
const result1 = arr1.map((x) => x * 2).map((x) => x + 1);
botest.assertJsArrayEquals(result1, [3, 5, 7], "Array should be doubled");

// Цепочка из разных методов
const arr3 = [1, 2, 3];
const result3 = arr3
  .map((x) => x + 1)
  .filter((x) => x > 2)
  .map((x) => x * 1);
botest.assertJsArrayEquals(result3, [3, 4], undefined);

// Цепочка оканчивающаяся на свойство .length (заканчиваем цепочку не функциональным методом массива)
const arr2 = [1, 2, 3];
const result2 = arr2.map((x) => x * 2).map((x) => x + 1).length;
botest.assertValueEquals(result2, 3, "Length must be 3");

// Цепочка получаящая массив по свойству объекта (начинаем цепочку не с массива)
const arr4 = [1, 2, 3];
const obj4 = {
  array: arr4,
};
const result4 = obj4.array.map((x) => x + 1);
botest.assertJsArrayEquals(result4, [2, 3, 4], undefined);

// Цепочка с методом .toReversed() (встраиваем )
const arr5 = [1, 2, 3];
const result5 = arr5.toReversed().map((x) => x * 2);
botest.assertJsArrayEquals(result5, [6, 4, 2], undefined);

botest.assertOk();

export {};
