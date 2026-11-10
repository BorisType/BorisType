# Skills для работы с WebSoft HCM

Репозиторий содержит независимо устанавливаемые agent skills в каталоге
[`skills/`](https://github.com/BorisType/BorisType/tree/main/skills). Первый — `websoft-hcm`: знания о платформе,
URL, конфигурации путей, SQL storage и числах, с указанием источников и границ проверок.
`boristype-mcp` — отдельный skill для файловых tools и серверного XQuery/SQL.
`websoft-hcm-admin` — работа в веб-администраторе через браузер: поиск сотрудника
и проверка его карточки.

## Установка

После публикации изменений в основной ветке репозитория:

```sh
npx skills add BorisType/BorisType
```

Установщик предложит выбрать skills и поддерживаемых агентов. Можно посмотреть
каталог без установки либо выбрать один skill явно:

```sh
npx skills add BorisType/BorisType --list
npx skills add BorisType/BorisType --skill websoft-hcm
npx skills add BorisType/BorisType --skill boristype-mcp
npx skills add BorisType/BorisType --skill websoft-hcm-admin
```

Для ветки, ещё не включённой в `main`, можно использовать локальный checkout. Из его корня:

```sh
npx skills add . --list
npx skills add . --skill websoft-hcm
npx skills add . --skill boristype-mcp
npx skills add . --skill websoft-hcm-admin
```

По умолчанию установка относится к текущему проекту. Для использования в другом
проекте запускай команду оттуда, передав путь к checkout BorisType; для глобальной
установки у CLI есть `--global`. Отдельный npm-пакет для содержимого skills не нужен.

## Что входит

`websoft-hcm` содержит инструкции по применимости знаний и справочник
`references/paths-and-configuration.md`, `references/url-storage-and-blobs.md`,
`references/numbers-and-sql.md`, а также исходники трёх ограниченных resolver
probes, двух storage probes и трёх числовых/SQL probes.
URL-чтение в storage probes может импортировать файлы в БД; условия подготовки
и очистки указаны в справочнике. Справочники можно читать
и напрямую. В частности, описано расхождение логического x-local URL и дискового
файла, включая импорт файла в SQL при LoadUrlData. Числовой справочник различает
unsigned-like вывод и арифметику, показывает StrSignedInt, округление StrReal,
потери SQL integer до SOAP и text cast для точных значений.
Skill не требует нашего компилятора, MCP-сервера или локального Docker-стенда.
Если доступны документация и тестовая среда, агент может сверить сведения
с конкретной установкой. Без них он должен сохранять указанные границы выводов.

История знания и история реализации различаются: добавление сведений о `x-app`
и `file` в skill само по себе не расширяет поддерживаемые пути файловых MCP tools.

`boristype-mcp` содержит отдельные справочники по файлам и запросам: накопление
диапазонов чтения, readToken, preview/commit, физическая ФС и SQL blobs,
XQuery/SQL, усечение ответа и неизвестный исход выполнения. В нём также описаны
потери отрицательных SQL integer до SOAP и text cast для сохранения цифр.
Skill требует доступный MCP-сервер для выполнения операций, но устанавливается
независимо от `websoft-hcm`; сам MCP и DLL он не устанавливает.

`websoft-hcm-admin` содержит `references/employees.md`: вход через `/admin`,
**Персонал → Сотрудники**, открытие карточки двойным щелчком, общие и контактные
поля. Полнотекстовый поиск может не видеть новую запись до переиндексации
по расписанию; для немедленного поиска подходят обычные фильтры или каталог.
Период индексации зависит от установки. Источники и границы проверки указаны
в справочнике; создание и сохранение через UI пока не проверены.
Skill не требует нашего MCP, компилятора или определённого browser tool.

## Skills и инструкции MCP

MCP-сервер передаёт короткие server instructions в ответе инициализации:
как сочетать tools, когда перечитать файл и как обращаться с неполными
результатами/неизвестным исходом запроса. Descriptions и schemas каждого tool
содержат его текущий контракт; skill даёт подробные сценарии и references.

Клиент решает, попадут ли server instructions в контекст модели. MCP
[resources](https://modelcontextprotocol.io/specification/2025-11-25/server/resources)
могут передавать справочники, а
[prompts](https://modelcontextprotocol.io/specification/2025-11-25/server/prompts) —
шаблоны задач, но их использование также зависит от клиента. В текущем BorisType
MCP resources и prompts не зарегистрированы.
Наличие skill или instructions не заменяет проверки в коде и не гарантирует,
что агент прочитал либо применил рекомендации.
[Объяснение server instructions и ограничений клиентов](https://blog.modelcontextprotocol.io/posts/2025-11-03-using-server-instructions/).

## Пополнение

Правила источников, версий, probes и переносимости описаны в
[каталоге skills](https://github.com/BorisType/BorisType/blob/main/skills/README.md#как-пополнять-знания).
Инструкции для MCP и других инструментов можно добавлять соседними skills;
установка общего skill WebSoft HCM от них не зависит.
