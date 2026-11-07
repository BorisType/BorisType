# MCP: e2e на локальном C-стенде

Дата: 2026-11-06. Ветка `feat/mcp-server`, draft PR #48.

## Область

Проверяется настоящий `build/cli.js` через SDK stdio client и реальный
`@boristype/ws-client`/SOAP. Файлы создаются в отдельном
`x-local://wt/mcp-e2e-<UUID>/`. Oracle использует Docker `tee`/`cat`/`test`,
а не вторую копию того же MCP handler: чтение начинается с независимо записанных
байтов, запись сравнивается с реальными байтами, удаление — с отсутствием файла.

Команда `pnpm --filter @boristype/mcp-server test:e2e` отделена от unit tests и CI.
Без `WSHCM_E2E_CONTAINER`, `WSHCM_E2E_USERNAME`, `WSHCM_E2E_PASSWORD` она падает,
не пропускает тесты молча. Запускать после `pnpm --filter @boristype/mcp-server... build`.
Точный пример приведён в [package README](../../packages/mcp-server/README.md).
E2E требует Linux Docker host, один напрямую доступный IPv4 контейнера, порт 80
и серверную директорию `/WebsoftServer/wt`. Он не разворачивает стенд.

## Runtime evidence

- Существующая локальная установка `websoft/hcm:2025.2.1333`, Linux amd64.
- Image ID: `sha256:0edeac24afc2a5371ea8431c59b1c17ca2b1a9e5a3768275cfdb5023609e34ab`.
- Установочный README стенда указывает .NET 9.0.11 и managed assembly
  `2.25.12.4 [202512041524]`; e2e идентифицирует контейнер по image/image ID.
- Carrier: Node CLI → MCP stdio (protocol `2025-11-25`) → SOAP → C-runtime.
  Read/list/delete выполняются через eval во временной библиотеке, write —
  прямым SOAP вызовом `tools.put_url_text_server`.
- Перед серией успешно выполнен существующий `install-smoke.bs`:
  `OK: net9-smoke`, cleanup подтверждён. SHA256 исходного/переданного кода:
  `1ac5949e2a6197ae1f5144de4a373f79c7063918c873194dca9ae3f9fa9015b6`.
  Адаптации кода не было.

Сам e2e печатает image ID и SHA256 используемых BS templates. Финальные SHA256:

| Template            | SHA256                                                             |
| ------------------- | ------------------------------------------------------------------ |
| `read-file.bs`      | `1f0e1f3b3009fc859e015dc2c9a1e7169ada1198f4654576a23b2f2722f248db` |
| `list-directory.bs` | `33f7fa3f7acb1c2536a97fd9038ea839fe27f5818bcaffbcac78785f850e8862` |
| `delete-file.bs`    | `dbefc6d3f9d15afa0c64a62a48c339da3ecded64d3dd090f802be9de55865e55` |

Диагностические probes также передавались без source adaptation. SHA256 исходного
и переданного BS совпадают: echo library `d7eb40c710451fd6be930aca8277d5b1bc930d6cd7a1216d82ad6b0692eec649`,
raw CRLF `53987cd883f7ac08bbad45bb6d7a1670c036c7e15a19be1490216a2d918d4064`,
JSON CRLF `415e089bce5c0212315ac64626783da2ec02006ea1e0859d3e81cbee38905dd2`,
explicit UTF-8 `b1b2aac31d35df44e4fcde6ba441e5b3a44e31bc47d1b41199101f7fe68d7d3f`.
Все временные библиотеки и charset fixture удалены после этих probes.

Содержимое,
fixture paths и подстановки берутся из versioned test cases; TS → BS compiler
в этом пути не используется.

## Что обнаружилось и исправлено

### Завершающий whitespace в SOAP request

Короткая отдельная native echo-библиотека возвращала `EncodeJson(value)`:

| Отправлено  | Получено до исправления |
| ----------- | ----------------------- |
| `"  x  "`   | `"  x"`                 |
| `"a\n  \n"` | `"a"`                   |

Таким образом, потеря происходит до файлового helper: HCM SOAP receiver удаляет
завершающий literal whitespace. XML 1.0 дополнительно нормализует literal CR.
`renderRequest` теперь за один проход экранирует XML metacharacters и все четыре
XML whitespace characters numeric references. Экранирование выполняется и для
текстовых значений, и для атрибутов, без повторного entity processing builder-а.
Literal `&#13;`/`&#32;` в содержимом остаются текстом, что проверяет native e2e.
Форматирование XML вне значений остаётся обычным.

### CRLF в SOAP response

Отдельный ограниченный probe `return "A\r\nB\rC";` дал native wire Result
`A&#10;B&#13;C`, то есть уже потерял CR из пары CRLF. Тот же результат через
`EncodeJson(...)` сохранил `"A\r\nB\rC"`. Общий XML parser не может восстановить
уже потерянный символ. Read-file теперь возвращает JSON-encoded string, Node
делает `JSON.parse` и проверяет string type. Malformed/non-string результаты
остаются ошибками, а не успешным пустым файлом.

### UTF-8 без BOM

Независимо созданный UTF-8 файл с `Привет 👋 中文 é` читался как CP1251.
`LoadUrlText(url, {DetectContentCharset:true})` на этой сборке дал тот же mojibake,
хотя документация описывает распознавание UTF-8. Отдельный probe подтвердил,
что `DecodeCharset(LoadUrlData(url), 'utf-8')` возвращает исходную строку.
Read-file использует этот явный UTF-8 путь внутри JSON carrier. Один начальный
U+FEFF исключается из text result как BOM.

### BOM при записи

`tools.put_url_text_server` создаёт UTF-8 BOM. При записи `""` реальные байты
равны `EF BB BF`, а не zero-length file. Это сохранено как native поведение
текстовой операции; e2e сравнивает именно BOM + исходный UTF-8 payload.
Нормализации newline/whitespace в ожидаемых результатах нет.

### Утечка evaluator по EOF

SDK transport закрывает stdin, а прежний CLI выполнял cleanup только по сигналам.
Первый e2e подтвердил оставшийся `unsafe_eval_<id>.bs`. CLI теперь использует
общий idempotent shutdown для EOF/SIGINT/SIGTERM и ошибок запуска транспорта
после создания соединения. `false` от `Evaluator.close()` считается ошибкой
и приводит к ненулевому exit code. Частичная ошибка самого создания evaluator
и shutdown с активными SOAP requests не объявляются решёнными.

## Покрытие и очистка

Проверки идут последовательно, без native unbounded loops:

- Initialize/list четырёх tools и пустая директория.
- Девять payload cases: пустая строка, whitespace, trailing spaces, CR/LF/CRLF,
  numeric-looking text, exponent-looking text, boolean-looking text, Unicode,
  XML/quotes/backslashes/dollars/entity-looking text. Для каждого независимый
  read и write/create/overwrite с точным сравнением bytes/text.
- Имя с apostrophe, dollar/template-like fragments и кириллицей через все tools.
- Files/directories и отсутствие рекурсивного обхода; delete и subsequent read error.
- Invalid schema input и следующий успешный запрос по тому же соединению.
- Удаление evaluator после EOF и после SIGTERM/SIGINT одновременно с EOF.

27 subcases + parent дают **28/28** в Node test runner. Cleanup проверяется
независимым filesystem snapshot: fixture directory и новые evaluator files
должны исчезнуть. Нужен эксклюзивный доступ к стенду на время серии. После первой
ошибки последующие native cases пропускаются; cleanup остаётся обязательным.
Timeout не отменяет выполнение на сервере и не запускает автоматический retry.
Fallback удаляет только однозначно определённый evaluator этого запуска и всё
равно проваливает тест. Первый failing прогон использовал такой fallback;
успешный прогон подтверждает собственный cleanup CLI.

## Проверки итогового изменения

- Native e2e: **28/28**, без skipped/cancelled cases, собственный cleanup CLI
  и fixture directory подтверждены. Итоговый native проход занимал около 3 секунд;
  это wall-time одного тестового запуска, не benchmark.
- Unit tests: **123/123** — MCP 38, ws-client SOAP 19, bt-ir 61, ESLint 5.
- Frozen-lockfile install и сборка **15/15**.
- MCP tarball smoke: resources, package import, CLI help/version; зависимости
  workspace, не fresh registry install.
- Lint: 0 errors, прежние 45 warnings; format, syncpack, docs build,
  `git diff --check` проходят.
- `pnpm audit --audit-level=high` проходит; остаётся прежняя одна moderate.
- Отдельно проверено, что без обязательных `WSHCM_E2E_*` конфигурация завершается
  ошибкой до Docker/HCM доступа.

## Источники и границы

Документация найдена через `wshcm-docs`; она не заменяет native evidence:

- [ReadDirectory](https://wshcm-docs.boristype.dev/datex/common/5620276892448878725.html#readdirectory).
- [PutUrlText и UTF-8 BOM](https://wshcm-docs.boristype.dev/datex/common/7172076235998782832.html).
- [LoadUrlText и DetectContentCharset](https://wshcm-docs.boristype.dev/datex/common/7172076235998782839.html).
- [DecodeCharset](https://wshcm-docs.boristype.dev/datex/common/5620250451197911758.html#decodecharset).
- [EncodeJson](https://wshcm-docs.boristype.dev/datex/common/7172076235998782728.html).

Дополнительный референс: [wshcmx/types](https://github.com/wshcmx/types) revision
`a3b1e43d0b2add53bbc1f2acc2c5128360e8c97b`, `lib/core/index.d.ts`
(`LoadUrlData`, `DecodeCharset`, `LoadUrlTextOptions`, `EncodeJson`, filesystem
functions) и `lib/tools/index.d.ts` (`put_url_text_server`). Сигнатуры не являются
доказательством runtime semantics; расхождение DetectContentCharset выше сохранено.

Не проверены JS runtime, другие C versions, HTTPS/permissions, произвольные
URL/пути, symlinks, traversal, binary/legacy encodings, большие файлы и все
control characters. JSON carrier исправляет read-file, но не нормализует
произвольные SOAP responses в общем ws-client. Частичная initialization,
in-flight shutdown и ограничения входных данных остаются следующими задачами.
