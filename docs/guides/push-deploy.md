# Деплой на WebSoft HCM

## Обзор

Команда `btc push` загружает скомпилированный код на сервер WebSoft HCM и реинициализирует модули для немедленного применения изменений.

## Базовое использование

```bash
npx btc push
```

Использует значения по умолчанию: `localhost:80`, `user1/user1`

## Конфигурация

### Опции CLI

```bash
npx btc push \
  --host example.com \
  --port 8080 \
  --username admin \
  --password secret \
  --https
```

### btconfig.properties

Создайте `btconfig.properties` в корне проекта:

```properties
https=true
host=example.com
port=8080
username=admin
password=secret
```

**Приоритет:** CLI опции > btconfig.properties > значения по умолчанию

## Автоматический push в dev mode

Dev mode автоматически выполняет push после каждой успешной линковки:

```bash
npx btc dev              # авто-push включён (по умолчанию)
npx btc dev --no-push    # отключить авто-push
```

**Debounce:** задержка 500мс между push'ами

## Как это работает

1. **Загрузка dist/** - вся директория на WebSoft HCM
2. **Сбор init-скриптов** - из компонентов и standalone-модулей
3. **Сброс кеша require** - `bt.init_require()`
4. **Выполнение init-скриптов** - применение изменений

## Безопасность

**⚠️ Никогда не коммитьте `btconfig.properties` с credentials в git!**

Добавьте в `.gitignore`:
```
btconfig.properties
```

Используйте конфигурационные файлы для разных окружений:
- `btconfig.dev.properties`
- `btconfig.test.properties`
- `btconfig.prod.properties`

## Устранение проблем

### Connection refused
- Проверьте host/port
- Убедитесь что сервер WebSoft HCM запущен
- Проверьте правила файрвола

### Authentication failed
- Проверьте username/password
- Проверьте логи сервера на статус аккаунта

### Модули не перезагружаются
- Проверьте init-скрипты в компонентах
- Проверьте поле `ws:package` в package.json
- Проверьте логи evaluator на сервере

## См. также

- [Руководство Dev Mode](./dev-mode)
- [Справка btconfig.properties](../reference/btconfig-properties)
- [Архитектура Push](https://github.com/BorisType/BorisType/blob/main/ref/architecture/push-system.md)
