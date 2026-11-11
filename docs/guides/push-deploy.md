# Деплой на WebSoft HCM

`btc push` загружает готовый `dist/` и запускает инициализацию модулей на HCM.
Команда относится к существующему экспериментальному module pipeline;
развитие `script/module` заморожено до решения стратегии памяти C-runtime.
[Статус режимов](../reference/compile-modes) распространяется и на generated init.
Bare output не получает module ABI автоматически при загрузке через этот pipeline.

## Базовое использование

Сначала соберите пакеты, затем из корня выполните:

```sh
npx btc link --clean
npx btc push --host example.com --port 8080 --username developer
```

Пароль можно задать в `btconfig.properties`. `push` не выполняет build/link
и не читает ZIP из `artifact/` — он отправляет содержимое `dist/`.
Проверьте адрес сервера перед запуском: без конфигурации используются
`localhost:80`, `user1/user1`.

## Конфигурация

### Опции CLI

```sh
npx btc push --https --host example.com --port 443 --username developer
```

Поддерживаются `--host`, `--port`, `--username`, `--password`, `--https`.
Host/port/credentials из CLI перекрывают файл. Для HTTPS one-shot push явно
передавайте `--https`: его отсутствие сейчас перекрывает `https=true` файла.
HTTPS не переключает port с 80 на 443 автоматически.

### btconfig.properties

```properties
host=example.com
port=443
username=developer
password=replace-me
https=true
```

Имя файла фиксировано, env substitution и выбор environment-файла отсутствуют.
См. [точные правила parser и HTTPS override](../reference/btconfig-properties).

## Автоматический push в dev mode

```sh
npx btc dev
npx btc dev --no-push
```

Auto-push включён по умолчанию; отключённый вариант работает локально.
Сессия переиспользуется, очередь объединяет изменения с debounce 500 мс.
Каждый push отправляет весь `dist/`. См. [ограничения watch](./dev-mode).

## Как это работает

1. Загружает файлы `dist/` через evaluator/uploader в `x-local://`.
2. Собирает вызовы `<componentName>.init()` для каталогов `components/`
   (исключая `bt-runtime`), затем standalone OnInit из `source/api_ext.xml`.
3. При наличии init scripts вызывает `bt.init_require()`, затем выполняет scripts.

Нет гарантии атомарного обновления или удаления старых серверных файлов.
При распознанной сетевой ошибке повторяется **весь push** после reconnect,
не только последний файл. Init может иметь побочные эффекты; retry не является
гарантией exactly-once. Ошибки отдельных init scripts логируются и не отклоняют
push целиком: проверяйте сообщения и прикладной результат.
Порядок standalone init следует `api_ext.xml`; компоненты не сортируются
по прикладному графу зависимостей.

## Безопасность

Не коммитьте `btconfig.properties` с реальными credentials. Храните безопасный
шаблон отдельно. Для выбора окружения замените содержимое фиксированного файла
или задайте CLI options команды `push`.

## Устранение проблем

### Connection refused

Проверьте host, port и доступность HCM. Для HTTPS укажите `--https` при one-shot push.

### Authentication failed

Проверьте credentials и доступ пользователя к evaluator платформы.

### Модули не перезагружаются

Проверьте полный `api_ext.xml`, generated init и ошибки каждого script в логе.
После multi-package dev выполните полную линковку перед повторной загрузкой.
Сообщение об успешной загрузке файлов не доказывает успешный reinit всех модулей.

## См. также

- [Dev Mode](./dev-mode)
- [btconfig.properties](../reference/btconfig-properties)
- [Внутренние границы upload/retry](https://github.com/BorisType/BorisType/blob/main/refs/cli/push-and-artifacts.md)
