# Команда artifact

## Назначение

`btc artifact` создаёт **один** `artifact/main.zip` со всем содержимым `dist/`,
**включая `components/`**. Отдельные ZIP компонентов не создаются.
Команда не компилирует, не линкует и не отправляет файлы на сервер.

## Использование

Из корня подготовленного проекта:

```sh
npx btc link --clean
npx btc artifact --clean
```

Перед линковкой соберите все нужные пакеты. `--clean` у `artifact` удаляет
предыдущее содержимое `artifact/`; у `link` этот флаг очищает `dist/` и кэш.
Без него существующий `main.zip` перезаписывается, другие старые архивы остаются.

## Логика работы

1. Проверяет существование каталога `dist/` в текущей директории.
2. Создаёт `artifact/`, при `--clean` предварительно удаляет его.
3. Архивирует все файлы и подкаталоги `dist/` в `main.zip` без внешней папки `dist`.

## Структура результата

```text
project/
├── dist/
│   ├── components/my-component/
│   ├── wt/backend/
│   └── source/api_ext.xml
└── artifact/
    └── main.zip
```

Пути внутри ZIP начинаются с `components/`, `wt/`, `source/`. Формат ZIP,
сжатие zlib level 9. Побайтовая воспроизводимость ZIP не обещается.

## Примеры использования

Для [multi-package конфигурации](./btconfig) соберите каждый пакет своим build,
затем из корня выполните `btc link --clean` и `btc artifact --clean`.
Типы компонентов определяются их `package.json`, а не полем `packageType`
в `btconfig.json`.

## Интеграция с CI/CD

Сохраняйте `artifact/main.zip` как artifact вашей CI. Команда не создаёт manifest,
не проверяет совместимость с установленным HCM и не выбирает способ установки
компонентов. Deployment и platform acceptance выполняются отдельно.
Существующий module pipeline остаётся экспериментальным из-за
[ограничений памяти](./compile-modes).

## Обработка ошибок

Отсутствующий `dist/` и ошибка создания архива прерывают команду. Наличие ZIP
не заменяет проверку его содержимого и диагностики предыдущей сборки.

## См. также

- [Линковка](../guides/linking)
- [Push & Deploy](../guides/push-deploy)
- [Внутреннее устройство поставки](https://github.com/BorisType/BorisType/blob/main/refs/cli/push-and-artifacts.md)
