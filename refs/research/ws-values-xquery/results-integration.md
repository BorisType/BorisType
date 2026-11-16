# Интеграция с shared SDK: verification, 2026-11-16

Поверх main557c252 сохранены общий WshcmApi, thin MCP, managed runtime delivery,
актуальная docs/refs структура и trusted npm publisher. Исходная реализация
зафиксирована в [предыдущем отчёте](results-preintegration.md); этот документ
отделяет проверки обновлённого кода от прежнего acceptance.

`Evaluator.xquery`, `executeXQuery` и `WshcmApi.xquery` используют одну typed
проекцию. `WshcmApi.xquery` теперь возвращает XQueryResult вместо JSON text — это
явное несовместимое изменение. MCP сохраняет shared input schema и выбирает
JSON-представление bigint/nonfinite. File/object/runtime JSON carriers не менялись.

## Выполнено до feature PR

- Пины Node24.22.2 / pnpm12.16.1 / .NET SDK9.0.321 (global.json9.0.320+latestPatch).
- Frozen install, workspace build15/15; ws-client197/197, MCP171/171,
  bt-ir61/61, eslint-plugin suites; release helpers33/33.
- MCP actual tarball smoke и ws-client runtime/archive test прошли; archive test
  проверяет managed identity/hashes и выполнение typed query API из extracted SDK.
- ESLint0errors/11 прежних bt-ir warnings, форматирование, syncpack прошли;
  audit0high/critical (2low/7moderate, зависимости не обновлялись).
- Docs checker952 local targets/157 migration entries/30 byte-preserved artifacts,
  docs checker17/17 и site build прошли.
- Native SOAP7/7 и primitive query11 cases прошли на Linux C HCM2025.2.1333/PG16.
- Native MCP query12/12 прошёл через WshcmApi/CLI/stdio/SOAP.
- Независимый review обновлённой интеграции: существенных замечаний нет.

Первая попытка native files остановилась на штатном runtime gate:
expected/installed FileSystem build646a1a84-313d-4189-8af6-ec2dd4c1234d,
loaded99c65b91-9577-4c25-aa9b-cf5907682580, status restart_required.
Код операций не выполнялся; fixtures/evaluator были очищены. Это состояние
локального стенда после обновления SDK, без client-side обхода identity gate.
Для повторного acceptance требуется штатный перезапуск тестового HCM, без
пересоздания контейнера/БД/volumes, затем новая проверка ready и файловых операций.

Результаты после перезапуска и ссылки на CI/публикации добавляются при завершении
[плана выпуска](integration-release.md). Не считать этот промежуточный результат
успешной полной файловой acceptance.
