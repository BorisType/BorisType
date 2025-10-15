Проект поддержки компиляции TypeScript в валидный код на BorisScript.

Пример использования:
```ts
const groupId = OptInt(Param["group_id"]);
const groupDoc = tools.open_doc<GroupDocument>(groupId);
if (groupDoc === undefined) {
    Cancel();
}

const members = ArraySelectAll(groupDoc.TopElem.collaborators);
members
    .map((member) => tools.open_doc<CollaboratorDocument>(member.collaborator_id.Value))
    .filter(Boolean)
    .forEach((collaborator) => tools.create_notification("notification", collaborator.DocID, null, null, collaborator.TopElem));
```

НЕ ГОТОВО ДЛЯ ИСПОЛЬЗОВАНИЯ!!!


Возможности
- объявление переменных внутри цикла
- поддержка **Spread syntax**
- поддержка **Destructuring**
- поддержка базовых математических операций с `Math`
- поддержка функциональных итераций по массиву (forEach, map, ...) (не до конца)
- и другое

# Примеры компиляции
Исход файл:
```ts
const arr1 = [1, 2, 3];
const arr2 = [4, 5, 6];
const result = [];



for (const v1 of arr1) {
	const test = v1 * 2;
	if (v1 > 2) {
		for (const v2 of arr2) {
			const doubled = (test + v2) * 2;
			result.push(doubled);
		}
	}
}
```
Результат компиляции:
```js
var arr1 = [1, 2, 3];
var arr2 = [4, 5, 6];
var result = [];
var v1_loop3 = null;
var test_loop3 = undefined;
var v2_loop3 = null;
var doubled_loop3 = undefined;
for (v1_loop3 in arr1) {
	test_loop3 = v1_loop3 * 2;
	if (v1_loop3 > 2) {
	  for (v2_loop3 in arr2) {
		doubled_loop3 = (test_loop3 + v2_loop3) * 2;
		result.push(doubled_loop3);
	  }
	}
}
```

Исход файл:
```ts
const arr = [1, 2, 3];
let result = arr.map((x) => x * 2);
```
Результат компиляции:
```js
var arr = [1, 2, 3];
var result;
var temp_result_1_2 = [];
var i_1_2_loop2 = undefined;
var x_loop2 = undefined;
var result_1_2_loop2 = undefined;
for (i_1_2_loop2 = 0; i_1_2_loop2 < ArrayCount(arr); i_1_2_loop2++) {
	x_loop2 = arr[i_1_2_loop2];
	result_1_2_loop2 = x_loop2 * 2;
	temp_result_1_2.push(result_1_2_loop2);
}
result = temp_result_1_2;
```
# Тестирование
```sh
npm run initialize
npm run build
npm run test
```