# botest

**BorisScript Test Runner и Runtime Emulator**

botest — это утилита для запуска тестов BorisScript внутри Node.js путём эмуляции runtime-поведения BorisScript.

## Обзор

- **Эмулирует BorisScript** runtime в JavaScript
- **Запускает тесты**, скомпилированные [BorisType](../README.md)
- **Assert API** для валидации тестов
- **Организация по suite** (наборам тестов)

## Установка

```bash
npm install @boristype/botest
```

## Использование

### Запуск тестов

Из корня проекта:

```bash
# Собрать и запустить все тесты
npm run test

# Запустить конкретный набор тестов
node ./botest/build/index.js tests/build array

# Запустить конкретный тестовый файл
node ./botest/build/index.js tests/build array/map.test.js

# Запустить несколько наборов
node ./botest/build/index.js tests/build array string
```

### Структура тестового файла

Каждый тестовый файл — это отдельный модуль BorisScript:

```typescript
// my-feature.test.ts
import { botest } from "@boristype/botest";

const result = myFunction(42);
botest.assertValueEquals(result, 84, "should double the value");
botest.assertOk(); // ОБЯЗАТЕЛЬНО в конце каждого теста
```

**Ключевые правила:**

- Каждый файл = один тест
- Необходимо вызывать `botest.assertOk()` в конце
- Используйте описательные сообщения для assertion или `undefined`

## Assert API

### botest.assertOk()

Отмечает тест как успешный. **Обязателен** в конце каждого тестового файла.

```typescript
botest.assertOk();
```

### botest.assertValueEquals(actual, expected, message?)

Сравнивает значения на равенство.

```typescript
const result = add(2, 3);
botest.assertValueEquals(result, 5, "add function works");
```

**Параметры:**

- `actual` — фактическое значение
- `expected` — ожидаемое значение
- `message` — опциональное описание (используйте `undefined`, если конкретное сообщение не нужно)

### botest.assertJsArrayEquals(actual, expected, message?)

Сравнивает массивы на равенство.

```typescript
const arr = [1, 2, 3].map((x) => x * 2);
botest.assertJsArrayEquals(arr, [2, 4, 6], "map doubles values");
```

### botest.assertJsObjectEquals(actual, expected, message?)

Сравнивает объекты на равенство.

```typescript
const obj = { a: 1, b: 2 };
botest.assertJsObjectEquals(obj, { a: 1, b: 2 }, "object matches");
```

## Организация тестов

### Наборы тестов

Тесты организованы в наборы (директории):

```
tests/
├── src/
│   ├── array/
│   │   ├── _suite.json       # Конфигурация набора
│   │   ├── map.test.ts
│   │   ├── filter.test.ts
│   │   └── reduce.test.ts
│   └── string/
│       ├── _suite.json
│       ├── split.test.ts
│       └── trim.test.ts
└── build/                     # Скомпилированные тесты
```

### Конфигурация набора (\_suite.json)

```json
{
  "name": "Array Methods",
  "tests": {
    "map.test.js": "Array.map() polyfill",
    "filter.test.js": "Array.filter() polyfill",
    "reduce.test.js": "Array.reduce() polyfill"
  }
}
```

**Примечание:** Имена файлов в JSON используют `.test.js` (скомпилированные), а не `.test.ts`

## Создание тестов

### Новый тест в существующем наборе

1. Добавьте тестовый файл в директорию набора:

   ```typescript
   // tests/src/array/includes.test.ts
   import { botest } from "@boristype/botest";

   const arr = [1, 2, 3];
   botest.assertValueEquals(arr.includes(2), true, "includes finds element");
   botest.assertValueEquals(arr.includes(5), false, "includes returns false for missing");
   botest.assertOk();
   ```

2. Зарегистрируйте в `_suite.json`:

   ```json
   {
     "name": "Array Methods",
     "tests": {
       "includes.test.js": "Array.includes() polyfill"
     }
   }
   ```

3. Соберите и запустите:
   ```bash
   npm run test
   ```

### Новый набор тестов

1. Создайте директорию в `tests/src/`:

   ```
   tests/src/my-feature/
   ```

2. Создайте `_suite.json`:

   ```json
   {
     "name": "My Feature",
     "tests": {
       "basic.test.js": "Basic functionality"
     }
   }
   ```

3. Добавьте тестовые файлы:

   ```typescript
   // tests/src/my-feature/basic.test.ts
   import { botest } from "@boristype/botest";

   // Код теста здесь
   botest.assertOk();
   ```

4. Соберите и запустите:
   ```bash
   npm run test
   npm run test:run my-feature
   ```

## Рекомендации по тестированию

### ✅ Хорошие практики

```typescript
// Уникальные, описательные сообщения
botest.assertValueEquals(result, 42, "computation returns correct value");

// Или undefined для простых случаев
botest.assertJsArrayEquals(arr1, arr2, undefined);

// Всегда завершать через assertOk
botest.assertOk();
```

### ❌ Плохие практики

```typescript
// Пустая строка в сообщении
botest.assertValueEquals(x, y, "");

// Нет assertOk в конце
// (тест провалится)

// Дублирующиеся сообщения в одном файле
botest.assertValueEquals(a, 1, "test");
botest.assertValueEquals(b, 2, "test"); // Одинаковое сообщение!
```

## Как это работает

### Эмуляция Runtime

botest эмулирует BorisScript runtime-функции:

```javascript
// BorisScript код (скомпилированный)
bt.getProperty(obj, "foo");
bt.setProperty(obj, "bar", 42);
bt.callFunction(func, [arg1, arg2]);

// botest реализация
// Предоставляет bt.* функции, которые работают в Node.js
```

### Выполнение тестов

1. Загрузить скомпилированный тестовый файл (`.test.js`)
2. Выполнить в эмулированном BorisScript-окружении
3. Собрать результаты assertion
4. Вывести pass/fail

### Обнаружение наборов

1. Сканировать `tests/build/` на наличие `_suite.json` файлов
2. Загрузить реестр тестов из каждого набора
3. Выполнить тесты в наборе
4. Агрегировать результаты

## Аргументы CLI

```bash
node ./botest/build/index.js <build-dir> [suite1] [suite2/test.js] ...
```

**Аргументы:**

- `build-dir` — путь к скомпилированным тестам (обычно `tests/build`)
- `suite1` — имя набора (имя директории)
- `suite2/test.js` — конкретный тестовый файл в наборе

**Примеры:**

```bash
# Все тесты
node ./botest/build/index.js tests/build

# Один набор
node ./botest/build/index.js tests/build array

# Один тест
node ./botest/build/index.js tests/build array/map.test.js

# Несколько наборов
node ./botest/build/index.js tests/build array string
```

## Разработка

```bash
# Установить зависимости (из botest/)
npm install

# Собрать
npm run build

# Запустить пример
npm run test
```

## Структура проекта

```
botest/
├── src/
│   ├── index.ts          # Точка входа CLI
│   ├── tester.ts         # Test runner
│   └── borisscript/      # Эмуляция runtime
│       ├── runtime.ts    # bt.* функции
│       └── polyfills.ts  # __bt.polyfill.*
├── build/                # Скомпилированный вывод
└── README.md             # Этот файл
```

## Ограничения

- **Не полноценный BorisScript-интерпретатор** — эмулирует только необходимое для запуска тестов
- **Тесты должны быть сначала скомпилированы** через BorisType
- **Нет интерактивной отладки** — используйте console.log или отладчик Node.js

## См. также

- [Основной проект BorisType](../)
- [Руководство по тестированию](../docs/guides/testing.md)
- [GitHub Copilot инструкции для тестов](../.github/copilot/botest.instructions.md)
