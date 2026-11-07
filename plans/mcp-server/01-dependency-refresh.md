# MCP-01: dependency refresh и локальные исправления

Дата: 2026-11-05. Ветка: `feat/mcp-server`.

Пользователь ограничил шаг обновлением зависимостей и easy wins. Native
работоспособность на HCM и реализация новых tools не входят в acceptance.

## Изменения

- Ветка синхронизирована с `main` (`ed8935d`): Node 24.22.2, pnpm 12.16.1,
  действующие security overrides и supply-chain settings сохранены.
- MCP dependencies: SDK ^1.32.1, Commander ^15.0.0, Zod ^4.6.7,
  Inspector ^2.12.0; TypeScript ^6.0.3 и @types/node ^24.13.6 выровнены
  с workspace. Выбор и установка соблюдают 14-дневный minimumReleaseAge;
  более свежие SDK 1.32.2 и Inspector 2.14.0 не форсировались.
- Inspector запускается из установленных зависимостей, без unpinned `npx`.
- Убрано duplicate `htmlEntities`, блокировавшее tsc старой ветки.
- Runtime `.bs` templates включены в package files.
- Регистрируются только четыре реализованных tools. Семь заготовок сохранены.
- `createServer(connection)` отделяет создание MCP server от подключения к HCM.
  Через SDK in-memory transport проверяются initialize/list/call и errors.
- Подстановка параметров стала однопроходной: `$&` и `${other}` внутри значения
  остаются данными, кавычки/backslash/control chars экранируются. Round trip
  подтверждён локально в JavaScript, не в native C-runtime.
- SOAP parser сохраняет текст без trim/numeric coercion; typed values по
  VALUE-TYPE, nested Object/Array, Fault и request escaping покрыты regression tests.
- Read/list отклоняют non-string result вместо успешного пустого содержимого.
  Общий SOAP void/malformed-response contract не пересматривался.
- Unit tests и tarball smoke добавлены в CI. Smoke проверяет фактический tarball,
  ресурсы, import и CLI help/version с workspace dependencies; fresh install
  из registry не заявляется. Для распаковки используется системный `tar`.

## Границы шага

R01/R03/R04 исправлены с локальными проверками. R05 исправлен для локального
string/substitution contract; native escape acceptance остаётся открытым.
R02 смягчён проверкой результата в read/list, строгая SOAP envelope validation
не реализована. R06 (lifecycle, EOF, path boundaries, limits) отложен.

Не выполнялись подключения к HCM, native probes, запись/удаление файлов на
платформе или новые tools. Подтверждение write return и детали platform helpers
по-прежнему требуют отдельного исследования с учётом ненадёжности Datex.

После обновления audit не находит high/critical advisories. Полный audit
сообщает existing moderate GHSA-g3hv-75wg-m249 для minimatch 10.2.6 в других
workspace dependency chains; исправление требует перехода на major 11 и
не включено в этот MCP-шаг.

## Локальные проверки

- `pnpm install --frozen-lockfile`: PASS, lockfile согласован, supply-chain
  policies не отключались.
- `pnpm exec turbo run build`: PASS, 15/15 build tasks.
- CI unit-test command: PASS, 112/112 (bt-ir 61, ESLint 5, SOAP 19, MCP 27).
  До исправления SOAP regression tests воспроизводили пять failures
  на whitespace/numeric-looking text/nested values.
- `pnpm --filter @boristype/mcp-server test:pack`: PASS, фактический tarball
  содержит BS templates, import и CLI help/version работают с workspace deps.
- `pnpm --filter @boristype/mcp-server exec mcp-inspector --help` и
  `--cli --help`: PASS; запуск HCM session не выполнялся.
- `pnpm lint`: PASS, 0 errors. Сохранены 45 прежних warnings: 11 в compiler,
  34 в семи MCP-заготовках (неиспользуемые imports/parameters).
- `pnpm format:check`, `pnpm check-versions`, `git diff --check`: PASS.
- `pnpm docs:build`: PASS.
- `pnpm audit --audit-level=high`: PASS; полный audit по-прежнему находит одну
  moderate advisory minimatch, описанную выше.
