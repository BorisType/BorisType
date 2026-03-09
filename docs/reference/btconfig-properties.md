# Справка по btconfig.properties

## Обзор

`btconfig.properties` — это необязательный файл конфигурации для настроек push/deploy на WebSoft HCM.

**Примечание:** Подстановка переменных окружения пока не поддерживается, но запланирована в будущих версиях.

## Расположение файла

Разместите в корне проекта (в той же директории, что и `package.json` и `btconfig.json`):

```
my-project/
├── package.json
├── btconfig.json
├── btconfig.properties  ← здесь
├── src/
└── dist/
```

## Формат

Стандартный формат Java properties файла:

```properties
# Настройки подключения к WebSoft HCM
https=true
host=example.com
port=8080
username=admin
password=secret123
```

## Свойства

| Свойство   | Тип     | По умолчанию | Описание                            |
| ---------- | ------- | ------------ | ----------------------------------- |
| `https`    | boolean | `false`      | Использовать HTTPS для подключения  |
| `host`     | string  | `localhost`  | Имя хоста сервера WebSoft HCM       |
| `port`     | number  | `80`         | Порт сервера WebSoft HCM            |
| `username` | string  | `user1`      | Имя пользователя для аутентификации |
| `password` | string  | `user1`      | Пароль для аутентификации           |

## Приоритет конфигурации

Настройки объединяются в следующем порядке (последующие переопределяют предыдущие):

1. **Значения по умолчанию** (localhost:80, user1/user1)
2. **Файл btconfig.properties**
3. **Опции CLI** (`--host`, `--port` и т.д.)

### Пример

```properties
# btconfig.properties
host=dev-server.com
port=8080
username=developer
```

```bash
# Опции CLI переопределяют настройки из файла
npx btc push --username admin
# Использует: dev-server.com:8080, admin/user1
```

## Соображения безопасности

**⚠️ НИКОГДА не коммитьте этот файл с реальными учётными данными в систему контроля версий!**

### Лучшие практики

1. **Добавьте в .gitignore:**

   ```gitignore
   btconfig.properties
   btconfig.*.properties
   ```

2. **Используйте файлы для разных окружений:**

   ```
   btconfig.dev.properties
   btconfig.staging.properties
   btconfig.prod.properties
   ```

3. **Храните шаблон в репозитории:**

   ```properties
   # btconfig.properties.example
   https=false
   host=localhost
   port=80
   username=your-username
   password=your-password
   ```

4. **Делитесь безопасно:**
   - Используйте инструменты управления секретами
   - Делитесь через зашифрованные каналы
   - Регулярно меняйте учётные данные

## Использование

### Однократный push

```bash
npx btc push
# Автоматически читает btconfig.properties
```

### Авто-push в dev режиме

```bash
npx btc dev
# Использует btconfig.properties для всех push операций
```

### Переопределение через CLI

```bash
npx btc push --host production.com --username admin
# Переопределяет host и username из файла
```

## Правила парсинга

- Строки, начинающиеся с `#`, являются комментариями
- Формат: `ключ=значение`
- Пробелы вокруг `=` обрезаются
- Пустые строки игнорируются
- Булевы значения: `true`/`false` (регистр не важен)

## Решение проблем

### Файл не найден

- Убедитесь, что файл находится в корне проекта
- Проверьте, что имя файла в точности `btconfig.properties`
- Проверьте текущую рабочую директорию при запуске btc

### Настройки не применяются

- Проверьте синтаксис файла (формат ключ=значение)
- Проверьте отсутствие опечаток в именах свойств
- Помните, что опции CLI переопределяют настройки из файла

### Проблемы с кодировкой

- Используйте кодировку UTF-8
- Избегайте специальных символов в значениях
- Используйте кавычки для значений с пробелами (при необходимости)

## См. также

- [Руководство по Push & Deploy](../guides/push-deploy.md)
- [Руководство по Dev режиму](../guides/dev-mode.md)
- [Справка по btconfig.json](btconfig.md)
