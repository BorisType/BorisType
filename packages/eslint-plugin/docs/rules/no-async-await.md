# no-async-await

Запрещает использование `async`/`await` синтаксиса.

## Причина

BorisScript **не поддерживает и никогда не будет поддерживать** async/await. Платформа не имеет event loop и асинхронных примитивов.

Это правило помогает выявить использование async/await на этапе разработки.

## Что проверяется

- `async function` декларации
- `async function` выражения
- `async` стрелочные функции
- `async` методы объектов/классов
- `await` выражения
- `for await...of` циклы

## Примеры

### ❌ Неправильно

```js
// Async function declaration
async function fetchData() {
  const response = await fetch(url);
  return response.json();
}

// Async arrow function
const getData = async () => {
  await delay(100);
  return data;
};

// Async method
const api = {
  async request() {
    return await this.fetch();
  },
};

// Async IIFE
(async () => {
  await init();
})();

// For-await-of
async function processStream() {
  for await (const chunk of stream) {
    console.log(chunk);
  }
}
```

### ✅ Правильно

```js
// Synchronous function
function processData(data) {
  return transform(data);
}

// Callback pattern
function fetchData(url, callback) {
  httpRequest(url, function (err, response) {
    if (err) {
      callback(err, null);
      return;
    }
    callback(null, response);
  });
}

// Event-based pattern
function loadData(onSuccess, onError) {
  var xhr = createRequest();
  xhr.onload = function () {
    onSuccess(xhr.response);
  };
  xhr.onerror = function () {
    onError(xhr.error);
  };
  xhr.send();
}
```

## Альтернативы async/await

### Callback-паттерн

```js
function fetchUser(id, callback) {
  httpGet("/users/" + id, function (err, data) {
    if (err) {
      callback(err, null);
      return;
    }
    callback(null, JSON.parse(data));
  });
}

// Использование
fetchUser(123, function (err, user) {
  if (err) {
    console.log("Error:", err);
    return;
  }
  console.log("User:", user.name);
});
```

### Цепочка callbacks (для последовательных операций)

```js
function fetchUserAndPosts(userId, callback) {
  fetchUser(userId, function (err, user) {
    if (err) {
      callback(err, null);
      return;
    }

    fetchPosts(user.id, function (err, posts) {
      if (err) {
        callback(err, null);
        return;
      }

      callback(null, { user: user, posts: posts });
    });
  });
}
```

## Когда отключать

**Никогда** для кода, предназначенного для BorisScript.

Если файл не будет транспилироваться (например, скрипты сборки), можно отключить:

```js
/* eslint-disable @boristype/no-async-await */
async function buildProject() {
  await compile();
}
```
