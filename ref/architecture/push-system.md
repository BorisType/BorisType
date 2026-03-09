# Архитектура системы деплоя (Push)

## Обзор

Система push загружает скомпилированный код на сервер WebSoft HCM и реинициализирует модули.

**Компоненты:**

- [btc/src/core/pushing/](../../btc/src/core/pushing/) — модуль
- [@boristype/ws-client](../../ws-client/) — библиотека клиента WebSoft HCM

## Архитектура

```
┌─────────────┐
│ btc push    │ CLI команда
└──────┬──────┘
       │
┌──────▼──────────────┐
│ PushingPipeline     │ Фасад
│  - loadConfig()     │
│  - createSession()  │
│  - push()           │
└──────┬──────────────┘
       │
┌──────▼──────────────┐
│ DeploySession       │ Постоянное соединение
│  - initialize()     │  - Логин + создание evaluator
│  - push()           │  - Загрузка + reinit
│  - close()          │  - Очистка
└──────┬──────────────┘
       │
       ├──> Upload (upload.ts)
       │     - uploadDistToServer()
       │     - использует Evaluator.eval()
       │
       ├──> Reinit (reinit.ts)
       │     - collectInitScripts()
       │     - resetRequireCache()
       │     - executeInitScripts()
       │
       └──> WshcmClient (@boristype/ws-client)
             - HTTP/HTTPS соединение
             - Управление сессией
             - Evaluator для исполнения кода
```

## DeploySession

Управляет постоянным соединением с сервером WebSoft HCM.

### Жизненный цикл

```typescript
const session = new DeploySession(config);

// 1. Инициализация
await session.initialize();
  → логин на сервер
  → создание evaluator
  → сохранение сессии

// 2. Push (многократно)
await session.push(distPath, btconfig);
  → загрузка dist/
  → сбор init-скриптов
  → bt.init_require()
  → исполнение inits

// 3. Закрытие
await session.close();
  → очистка evaluator
  → logout
```

### Автоповтор

Сетевые ошибки вызывают автоматический retry (макс. 1):

```typescript
try {
  await uploadFile(file);
} catch (err) {
  if (isNetworkError(err) && !retried) {
    await session.reconnect();
    await uploadFile(file); // повтор
  }
}
```

## Процесс загрузки

1. **Подготовка кода evaluator** (upload_prepare.bs)
   - Создаёт временную структуру директорий
   - Возвращает upload ID

2. **Загрузка файлов** по одному
   - Чтение содержимого файла
   - Кодирование как строка
   - `evaluator.eval(upload_code)`

3. **Финализация** (upload_finish.bs)
   - Перемещение temp → финальное расположение
   - Очистка

**Файлы:** [btc/resources/](../../btc/resources/)

- `upload_prepare.bs`
- `upload_finish.bs`

## Механизм реинициализации

После загрузки выполняется реинициализация модулей для применения изменений:

### 1. Сбор init-скриптов

Из:

- Компоненты: `dist/scripts/init.js`
- Standalone модули: `dist/init.js`

### 2. Сброс кеша require

```javascript
bt.init_require();
```

Очищает все загруженные модули.

### 3. Исполнение init-скриптов

```typescript
for (const script of initScripts) {
  await evaluator.eval(script.code);
}
```

Порядок: зависимости первыми (по порядку из btconfig.json)

## Конфигурация

### btconfig.properties

Формат:

```properties
https=true
host=example.com
port=8080
username=admin
password=secret
```

Парсится в [core/utils/properties.ts](../../btc/src/core/utils/properties.ts)

### Приоритет

1. CLI опции (`--host` и т.д.)
2. btconfig.properties
3. Значения по умолчанию (localhost:80, user1/user1)

Логика слияния в [core/pushing/config.ts](../../btc/src/core/pushing/config.ts)

## Integration with Dev Mode

## Интеграция с Dev Mode

Dev mode использует `DebouncedPushQueue` ([core/pushing/queue.ts](../../btc/src/core/pushing/queue.ts))

Debounce для частых push (500мс):

```typescript
queue.schedulePush(distPath, btconfig);
// Ожидание 500мс
// Если ещё одно изменение → сброс таймера
// В итоге выполняется
```

**Постоянная сессия:** Одна DeploySession на весь dev mode.

## Обработка ошибок

### Сетевые ошибки

- WshcmException с сетевой ошибкой → автоповтор (макс. 1)
- Reconnect: новый WshcmClient + Evaluator

### Ошибки аутентификации

- Неверные credentials → немедленный fail
- Без retry

### Ошибки загрузки

- Ошибка чтения файла → пропуск файла, лог-warning
- Ошибка Evaluator → fail всего push

## Безопасность

**⚠️ Credentials в открытом виде!**

btconfig.properties НЕ должен коммититься в git.

**Рекомендации:**

- Добавьте в .gitignore
- Используйте конфиги для разных окружений
- Рассмотрите использование environment variables (будущее)

## Зависимости

### @boristype/ws-client

Предоставляет:

- `WshcmClient` — HTTP/HTTPS клиент для WebSoft HCM
- `Evaluator` — исполнение кода на сервере
- `WshcmException` — типы ошибок

**Расположение:** [ws-client/](../../ws-client/)

### fast-xml-parser

Для парсинга XML-ответов от сервера.

## Файлы

| Файл                                                          | Назначение                 |
| ------------------------------------------------------------- | -------------------------- |
| [index.ts](../../btc/src/core/pushing/index.ts)               | Facade API                 |
| [session.ts](../../btc/src/core/pushing/session.ts)           | Класс DeploySession        |
| [config.ts](../../btc/src/core/pushing/config.ts)             | Загрузка + слияние конфига |
| [upload.ts](../../btc/src/core/pushing/upload.ts)             | Логика загрузки файлов     |
| [reinit.ts](../../btc/src/core/pushing/reinit.ts)             | Реинициализация модулей    |
| [init-scripts.ts](../../btc/src/core/pushing/init-scripts.ts) | Сбор init-скриптов         |
| [queue.ts](../../btc/src/core/pushing/queue.ts)               | Debounced очередь          |
| [types.ts](../../btc/src/core/pushing/types.ts)               | TypeScript типы            |

## См. также

- [Руководство: Push & Deploy](../../docs/guides/push-deploy.md)
- [Архитектура Dev Mode](build-pipeline.md#dev-mode)
- [Справка btconfig.properties](../../docs/reference/btconfig-properties.md)
