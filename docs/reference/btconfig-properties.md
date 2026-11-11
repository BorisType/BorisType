# Справка по btconfig.properties

## Обзор

Необязательный файл подключения `btc push` и auto-push в `btc dev`.
CLI читает только файл с точным именем `btconfig.properties` из текущей директории.
Выбор другого имени и подстановка переменных окружения не реализованы.

## Расположение файла

```text
my-project/
├── package.json
├── btconfig.properties
└── dist/
```

## Формат

```properties
# Настройки вашего HCM
host=example.com
port=8080
username=developer
password=replace-me
https=false
```

Это простой parser `key=value`, а не полная реализация Java properties.

## Свойства

| Свойство   | Default     | Значение                                     |
| ---------- | ----------- | -------------------------------------------- |
| `https`    | `false`     | Только точная строка `true` включает HTTPS   |
| `host`     | `localhost` | Адрес без схемы                              |
| `port`     | `80`        | Порт; HTTPS сам по себе не меняет его на 443 |
| `username` | `user1`     | Имя пользователя HCM                         |
| `password` | `user1`     | Пароль HCM                                   |

Укажите реальные настройки до push; defaults не проверяют существование
или пригодность целевого сервера.

## Приоритет конфигурации

Host, port, username и password: CLI > файл > defaults.
У `btc dev` нет флагов подключения, поэтому он использует файл и defaults.

**Особенность HTTPS:** у `btc push` Commander передаёт `https=false`, когда
`--https` отсутствует. В текущей реализации это перекрывает `https=true` файла.
Для HTTPS one-shot push **явно добавьте `--https`**; `btc dev` читает значение
файла без такого CLI override.

```sh
npx btc push --https --host example.com --port 443
```

## Соображения безопасности

Не включайте файл с реальными credentials в репозиторий:

```text
btconfig.properties
```

Шаблон можно хранить как `btconfig.properties.example`. Имена
`btconfig.dev.properties`/`btconfig.prod.properties` не выбираются автоматически:
нужный набор требуется отдельно поместить в `btconfig.properties`.
CLI пароль может попасть в историю команд и список процессов.

## Правила парсинга

- Пустые строки и строки после trim, начинающиеся с `#`, пропускаются.
- Ключ и значение обрезаются по краям; внутренние пробелы сохраняются.
- Последний повторяющийся ключ побеждает.
- Кавычки не снимаются, escapes и `${VAR}` не раскрываются.
- Значение с `=` сейчас обрезается после следующего `=`. Для такого пароля
  используйте `btc push --password` с подходящим quoting вашей оболочки;
  auto-push этого обхода не предоставляет.
- `https=True` и `https=TRUE` не включают HTTPS. Комментарии после значения
  не поддерживаются.

## Решение проблем

Проверьте cwd, точное имя файла, синтаксис и CLI overrides. Для HTTPS one-shot
добавьте `--https` и нужный порт. Не заключайте значения в кавычки внутри файла.
Невалидные значения порта не получают полноценной валидации этим parser.

## См. также

- [Push & Deploy](../guides/push-deploy)
- [Dev Mode](../guides/dev-mode)
- [btconfig.json](./btconfig)
