# BorisType

Инструменты для работы с WebSoft HCM: MCP-сервер, C# библиотеки, знания для агентов
и компилятор ограниченного подмножества TypeScript в BorisScript.
Компоненты можно использовать независимо. Проект экспериментальный;
границы поддержки описаны у каждого инструмента.

| Задача                                                              | С чего начать                                                                                             |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Подключить агента к HCM: файлы, поиск, XQuery, XML объектов         | [MCP: установка и использование](docs/guides/mcp-server.md)                                               |
| Установить DLL для файловых операций MCP                            | [.NET: установка и совместимость](docs/guides/dotnet.md)                                                  |
| Установить знания о платформе и инструментах через `npx skills add` | [Каталог skills](skills/README.md)                                                                        |
| Компилировать TS в BorisScript                                      | [Начало работы](docs/guides/getting-started.md), [ограничения](docs/reference/borisscript-constraints.md) |
| Изменять реализацию или найти основания решений                     | [Внутренние справочники](refs/README.md), [разработка](refs/development.md)                               |

Пользовательские гайды и справка находятся в [docs/](docs/index.md) (сайт VitePress).
Текущий контракт пакета также доступен в его README: [MCP](packages/mcp-server/README.md),
[DLL](packages/dotnet/README.md), [компилятор CLI](packages/bt-cli/README.md).

## Границы поддержки

MCP предоставляет девять файловых инструментов, XQuery и три XML object tools.
Файловые операции требуют standalone DLL alpha.4 / API 2 и обращаются к физическим
файлам; чтение платформенного URL может вместо файла обращаться к БД.
Native проверки выполнены на одной Linux-сборке HCM; это не acceptance Windows HCM
или всех бизнес-сценариев. Подробнее — в гайдах соответствующих инструментов.

Для компилятора поддерживаемое направление развития — **bare mode**.
Развитие script/module приостановлено до принятия стратегии памяти: env/descriptor
и receiver graph могут образовывать циклы, не освобождаемые reference counting
C-runtime. Реализации и регрессии сохранены; CLI всё ещё выбирает module по умолчанию.
[Выбор режима](docs/reference/compile-modes.md), [решение и условия возобновления](refs/decisions/2026-11-05-script-module-memory-freeze.md).
Bare не обещает полную JS-семантику или отсутствие пользовательских циклов.

## Разработка из checkout

Версия Node закреплена в [.node-version](.node-version), pnpm — в
[package.json](package.json). Из корня:

```sh
pnpm install --frozen-lockfile
pnpm exec turbo run build
pnpm docs:check
pnpm docs:build
```

Для C# требуется SDK из [global.json](global.json):
[сборка, тесты и упаковка](packages/dotnet/README.md).
[Проверки компилятора](refs/compiler/verification.md) требуют отдельно
предоставленного JS runtime; `pnpm test` сам не собирает тесты и не устанавливает runtime.
Команды локальных и native проверок MCP описаны в README пакета.

[TODO](TODO.md) содержит конкретный долг, [ROADMAP](ROADMAP.md) — направления.
[Итоги миграции документации](refs/archive/documentation/2026-11-11-documentation-migration.md)
объясняют структуру и судьбу прежних материалов.
