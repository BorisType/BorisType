# Деплой на WebSoft HCM

`btc push` загружает готовый `dist/` и запускает инициализацию модулей на HCM.
Подготовьте файлы инициализации в соответствии с
[метаданными пакета](../reference/package-types) и форматом его выходного кода.

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
3. Если зарегистрирован загрузчик [служебных объектов](./startup-objects), выполняет его первым. Ошибка загрузчика прерывает push и требует проверки стенда перед повтором.
4. При наличии прикладных init scripts вызывает `bt.init_require()`, затем выполняет scripts.

Нет гарантии атомарного обновления или удаления старых серверных файлов.
До запуска загрузчика объектов при распознанной сетевой ошибке повторяется **весь push** после reconnect,
не только последний файл. Init может иметь побочные эффекты; retry не является
гарантией exactly-once. Ошибки отдельных прикладных init scripts логируются и не отклоняют
push целиком: проверяйте сообщения и прикладной результат.
Порядок standalone init следует `api_ext.xml`; компоненты не сортируются
по прикладному графу зависимостей.

## Скачать файл или дерево каталогов

`btc download <source> <destination>` скачивает физические файлы HCM. Второй аргумент задаёт точное новое имя файла или корневого каталога на вашей машине. Родительский каталог должен существовать. Команда отклоняет занятое имя.

```sh
npx btc download x-local://app/sx_app_config.xmd ./app-config.xmd
npx btc download x-local://wt/site ./site-copy --https --port 443
```

Для подключения действуют `btconfig.properties` и параметры `--host`, `--port`, `--username`, `--password`, `--https`. Источником может быть абсолютный путь на машине HCM или URL `x-local://`, `x-app://`, `file://`, для которого HCM возвращает физический путь. При SQL storage hook скачиваются байты с диска. Нужны доступ к evaluator, права чтения у процесса HCM и штатный .NET-мост с `mscorlib`.

SDK перечисляет дерево и последовательно читает файлы диапазонами по 256 КиБ. Размер запроса в байтах меняет `--chunk-size` (1–4194304). Сохраняются вложенность, скрытые и пустые файлы, пустые каталоги. При обходе дерева SDK исключает временный модуль своего текущего evaluator. Вложенные символьные ссылки и Windows reparse points пропускаются. Ссылка в пути к самому источнику вызывает ошибку. Имена должны быть представимы на локальной файловой системе.

В stdout возвращается JSON с абсолютным локальным `path`, числом файлов `files`, суммой байтов `bytes` и числом пропущенных ссылок `skippedLinks`. При обрыве сетевого чтения SDK убирает временную копию. Следующий запуск начинает скачивание с начала. Для согласованной копии скачивайте неизменяемое дерево: SDK сверяет размер и время изменения каждого файла, но эти признаки могут совпасть при параллельной записи. Права, владельцы и временные метки исходных файлов не копируются.

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
