
## Static methods

| Метод               | Поддержка | Модуль | Примечание                        |
| ------------------- | --------- | ------ | --------------------------------- |
| `Array.from()`      | ✅         |        |                                   |
| `Array.fromAsync()` | ❌         |        | BS не поддерживает ассинхронность |
| `Array.isArray()`   | ✅         |        |                                   |
| `Array.of()`        | ⏳         |        |                                   |

## Instance methods
| Метод                 | Поддержка | Модуль          | Примечание                   |
| --------------------- | --------- | --------------- | ---------------------------- |
| `at()`                | ✅         | `tt::array`     | кастом функция               |
| `concat()`            | ✅         | `tt::array`     | ArrayUnion()                 |
| `copyWithin()`        | ✅         | `tt::array`     | кастом функция               |
| `entries()`           | ⏳         |                 |                              |
| `every()`             | ✅ ~       | `tt::arrayFunc` |                              |
| `fill()`              | ✅         | `tt::array`     | кастом функция               |
| `filter()`            | ✅ ~       | `tt::arrayFunc` |                              |
| `find()`              | ✅ ~       | `tt::arrayFunc` |                              |
| `findIndex()`         | ✅ ~       | `tt::arrayFunc` |                              |
| `findLast()`          | ✅ ~       | `tt::arrayFunc` |                              |
| `findLastIndex()`     | ✅ ~       | `tt::arrayFunc` |                              |
| `flat()`              | ⏳         |                 |                              |
| `flatMap()`           | ✅ ~       | `tt::arrayFunc` |                              |
| `forEach()`           | ✅ ~       | `tt::arrayFunc` |                              |
| `includes()`          | ✅ ~       | `tt::arrayFunc` |                              |
| `indexOf()`           | ✅         | `builtin`       | Поддерживается коробкой      |
| `join()`              | ✅         | `builtin`       | Поддерживается коробкой      |
| `keys()`              | ⏳         |                 |                              |
| `lastIndexOf()`       | ⏳         |                 | кастом функция               |
| `map()`               | ✅ ~       | `tt::arrayFunc` |                              |
| `pop()`               | ⏳         |                 | кастом функция               |
| `push()`              | ✅         | `builtin`       | Поддерживается коробкой      |
| `reduce()`            | ✅ ~       | `tt::arrayFunc` |                              |
| `reduceRight()`       | ✅ ~       | `tt::arrayFunc` |                              |
| `reverse()`           | ⏳         |                 |                              |
| `shift()`             | ⏳         |                 |                              |
| `slice()`             | ⏳         |                 |                              |
| `some()`              | ✅ ~       | `tt::arrayFunc` |                              |
| `sort()`              | ⏳         |                 |                              |
| `splice()`            | ✅         | `builtin`       | Поддерживается коробкой      |
| `toLocaleString()`    | ❌         |                 | BS не поддерживает locale    |
| `toReversed()`        | ⏳         |                 |                              |
| `toSorted()`          | ⏳         |                 |                              |
| `toSpliced()`         | ⏳         |                 |                              |
| `toString()`          | ❌         |                 |                              |
| `unshift()`           | ⏳         |                 |                              |
| `values()`            | ⏳         |                 |                              |
| `with()`              | ⏳         |                 |                              |
| `[Symbol.iterator]()` | ❌         |                 | BS не поддерживает итераторы |
`*` BS не поддерживает итераторы, а текущий дизайн BT, не предполагает реализовывать итераторы на платформе, поэтому вместо итераторов используются простые массивы.
## Instance properties

length