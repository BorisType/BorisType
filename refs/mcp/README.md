# MCP: устройство, решения и проверки

Пользовательский вход — [гайд](../../docs/guides/mcp-server.md), точный текущий
контракт — [README пакета](../../packages/mcp-server/README.md) и schemas tools.
Сервер предоставляет девять файловых tools, XQuery и три XML object tools.
Его Node-сборка не использует TS → BS compiler и не зависит от script/module ABI.

## Путь вызова и причины границ

```text
MCP client → Node stdio server → ws-client/SOAP → BS evaluator
                                               ├─ URL resolver → standalone C# DLL (файлы)
                                               └─ native XQuery/XML APIs (запросы/объекты)
```

[server.ts](../../packages/mcp-server/src/server.ts) регистрирует tools и создаёт
read state одного экземпляра сервера. Handlers и schemas находятся в
[tools](../../packages/mcp-server/src/tools/), BS templates — в
[resources](../../packages/mcp-server/resources/).
[managed-files.ts](../../packages/mcp-server/src/tools/managed-files.ts) проверяет
string carrier, versioned JSON и пределы ответа DLL.

Файлы обрабатывает DLL alpha.4/API 2. XQuery/XML не используют эту DLL.
URL преобразуется платформой в BS; DLL получает physical path и JSON через
уникальное имя метода. Это избегает неоднозначности reflection overloads и
обратных Datex callbacks: последние приводили к native crash на исследованном стенде,
причина не установлена. [Boundary decision](../decisions/2026-11-06-dotnet-search-boundary.md).

## Неочевидные решения

- **Физические файлы, а не произвольное URL-хранилище.** `LoadUrlData` может читать
  `spxml_blobs` даже при существовании файла. Успех file edit не доказывает изменения
  ресурса приложения. [Routing evidence](../research/dotnet/15-url-storage-routing-research.md).
- **Read grants в MCP, проверки bytes/ranges в DLL.** Hash сам по себе не показывает,
  что клиент получил текст. Token связан с URL, версией и MCP instance, диапазоны
  расширяются только явной цепочкой чтений. Это политика инструмента, не доказательство
  понимания текста моделью или изоляции чатов. [Решение](../decisions/2026-11-06-read-aware-file-tools.md).
- **Повторная проверка не atomic CAS.** Между проверкой bytes и rename возможна запись
  внешнего процесса; собственная сериализация не задаёт протокол для него.
  Строгий cross-process compare-and-replace остаётся отдельным исследованием.
- **Явные partial results.** Search/query limits и skipped counters влияют на смысл
  пустой выдачи. Лимит строк ответа не ограничивает работу БД.
- **Нативный XML вместо typed JS round-trip.** Схему раскрывает HCM; XML сохраняет
  платформенное представление и точные integer IDs. Save — create либо полная замена;
  пропущенные поля могут исчезнуть или получить defaults. Проверки частичны, загрузка
  формы/hooks может выполнить код. [Решение](../decisions/2026-11-10-native-xml-object-tools.md).
- **Неизвестный исход явно обозначается.** Потеря ответа или Save error не доказывает
  отсутствие изменений. Blind retry create/replace/query может повторить побочный эффект.
  XML Save не обещает UI authorization, полный бизнес-сценарий или rollback.

## Проверки и основания

Команды берутся из [package scripts](../../packages/mcp-server/package.json).
После build `pnpm --filter @boristype/mcp-server test` запускает локальные
protocol/state/XML/template tests; `test:pack` проверяет npm artifact.
Подкоманды `test:e2e*` — отдельные native runners для подготовленного стенда:
обычный `test` его не поднимает и DLL не устанавливает.

Историческая native acceptance относится к Linux HCM 2025.2.1333 / CLR 9.0.11;
Windows HCM, MSSQL, все типы и полные бизнес-процессы этим не аттестованы.

- [Файловый checkpoint](../research/mcp/08-filesystem-checkpoint.md).
- [Девять tools и read guards](../research/dotnet/13-read-aware-files-results.md).
- [XQuery, числа и SQL mapping](../research/mcp/09-xquery-native.md).
- [XML object MVP: реализация, acceptance и limitations](../research/mcp/10-object-model/first-implementation.md).
- [Исходные object probes, manifests и очищенные результаты](../research/mcp/10-object-model/README.md).

Записанные object-model результаты можно проверить **локально, без HCM**:

```sh
node refs/research/mcp/10-object-model/probes/verify-results.mjs refs/research/mcp/10-object-model/observed
node refs/research/mcp/10-object-model/probes/verify-xml-results.mjs
```

Verifier проверяет сохранённые наблюдения, hashes и cleanup receipts. Его PASS
не является новым native запуском и не расширяет acceptance на текущую ревизию.

При добавлении tool сначала определить storage, наблюдаемый контракт, побочные
эффекты, limits и исход ошибки/timeout. Проверять слой, который меняется; новый
protocol test не выдаётся за native acceptance. Историю общих HCM API ищи также
в [platform](../platform/README.md), а не только по имени пакета MCP.
