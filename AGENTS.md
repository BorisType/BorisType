# Работа в BorisType

Пользовательские сценарии и публичные ограничения — [docs/](docs/index.md).
Внутренние основания решений, evidence и маршруты по коду — [refs/](refs/README.md).
Правила ведения обеих баз и смысловой дельты PR — [refs/development.md](refs/development.md).
Читай тематический вход по задаче, а не весь архив.

- MCP: [refs/mcp/](refs/mcp/README.md); C#: [refs/dotnet/](refs/dotnet/README.md).
- Компилятор: [refs/compiler/](refs/compiler/README.md),
  [проверки](refs/compiler/verification.md),
  [локальный workflow skill](.agents/skills/boristype-compiler-development/SKILL.md).
- Общая платформа: [refs/platform/](refs/platform/README.md),
  переносимые пользовательские знания: [skills/](skills/README.md).
- Конкретный долг — [TODO.md](TODO.md); направления — [ROADMAP.md](ROADMAP.md).

Развитие script/module компилятора заморожено до решения стратегии памяти C-runtime;
сохранять существующие реализации, defaults и регрессии. Текущее направление — bare.
Ограничения BorisScript относятся к платформенному коду и output, а не ко всему Node/C# коду.
Версии инструментов брать из manifests и pins, не из исторических инструкций.

## Источники сведений о WebSoft HCM / BorisScript

Предупреждение пользователя от 2026-11-05: документация Datex может пропускать
аргументы функций и содержать неверные описания. Не принимать её за достаточное
доказательство сигнатуры или поведения платформы.

- Использовать MCP `wshcm-docs` для поиска документации и чтения статей; сохранять
  ссылки на конкретные найденные материалы.
- Дополнительный референс сигнатур и комментариев:
  https://github.com/wshcmx/types. Сверять подходящие функции с этим репозиторием,
  указывая revision и файл. Отсутствие декларации не доказывает отсутствие функции.
- Сопоставлять документацию и декларации с доступной реализацией и результатами
  ограниченных проверок на целевой платформе. Декларации тоже не доказывают
  runtime semantics; расхождения и непроверенные предположения отмечать явно.
- Различать сведения из документации, TypeScript declarations, локальных
  mock/JS-проверок, managed tests и запусков C-runtime. Не переносить результат
  между ними автоматически. Историческую пробу не выдавать за проверку текущей ревизии.

<!-- codebase-memory-mcp:start -->

For structural codebase exploration, use the installed `codebase-memory` skill.
<!-- codebase-memory-mcp:end -->
