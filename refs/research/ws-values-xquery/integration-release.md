# Интеграция typed SOAP/XQuery и выпуск

Пользователь разрешил публикацию GitHub и новых npm-версий 2026-11-16.
Первичная реализация и native acceptance завершены до обновления main:
[контракт](design.md), [результаты](results-preintegration.md).

Обновлённый main557c252 содержит shared `WshcmApi`, автоматическую доставку DLL,
новую docs/refs структуру и trusted npm publishing. Эти изменения сохраняются.

- [x] Сохранить исходную реализацию коммитом06391e5 и перенести поверх origin/main.
- [x] Создать issue70 и отдельный [план SQL→XML](../sql-xml-mapping.md).
- [x] Разрешить интеграцию с WshcmApi: единый typed XQueryResult в SDK, JSON presentation в MCP.
- [x] Обновить актуальные docs/refs и ссылки, не выдавая прежние проверки за acceptance нового head.
- [x] Проверить workspace, unit/pack, docs checker, native SOAP/query/files на обновлённом коде; получить review.
- [x] Push feature PR, дождаться CI, merge в main; fixes66–69.
- [x] Запустить prepare-release(alpha), проверить release PR и merge после CI.
- [x] Отправить отдельный тег ws-client и дождаться package/publish/verify; затем тег MCP и дождаться verify.
- [x] Проверить registry next tags и фактическую установку; записать опубликованные версии и ссылки.

Опубликованы ws-client и MCP. Changesets также подготовил версии зависимых
CLI/fixed group; их release tags не отправлялись. Для публикации использован канал
next; stable/latest не переключались. Версии вычислил существующий helper.

## Выпуск 2026-11-16

[PR #71](https://github.com/BorisType/BorisType/pull/71) прошёл CI и объединён
коммитом `0264f3a7d49966fd27d95def28b1b52da11fd38f`; issues #66–69 закрыты.
[Подготовка alpha](https://github.com/BorisType/BorisType/actions/runs/43934615066)
создала [release PR #72](https://github.com/BorisType/BorisType/pull/72).
После CI, включая watcher на Linux и Windows, он объединён коммитом
`86d5efba0c0040378a578913ec1aa45b6eab07e4`. Оба package tags указывают на этот
release commit; fixed group только подготовлена, её теги не отправлялись.

| Пакет                   | Версия          | Workflow                                                                       | Статус                                                |
| ----------------------- | --------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------- |
| `@boristype/ws-client`  | `0.1.0-alpha.6` | [43935245959](https://github.com/BorisType/BorisType/actions/runs/43935245959) | package, publish, verify прошли; npm next подтверждён |
| `@boristype/mcp-server` | `0.1.0-alpha.5` | [43935948901](https://github.com/BorisType/BorisType/actions/runs/43935948901) | package, publish, verify прошли; npm next подтверждён |

Дополнительно 2026-11-16 скачаны точные версии обоих пакетов из
`https://registry.npmjs.org` через `npm pack --ignore-scripts`. SHA512 bytes совпала
с metadata; эти архивы прошли `smoke` из `tools/release.mjs` вне workspace с его
cooldown/trust/patch/ignore-scripts политиками. Импорт ws-client и MCP CLI `--help`
завершились успешно. В опубликованном MCP dependency на ws-client —
`^0.1.0-alpha.6`. Временные consumer installs удалены.

| Пакет      | Проверенная npm integrity                                                                         |
| ---------- | ------------------------------------------------------------------------------------------------- |
| ws-client  | `sha512-UVqBsH2pEz3/0K6zOb17HTTQ9SbiTzUIEvggknGzFVaYA6MSE4xmBtV833uAYqyeZXL6g+oi3XZmjKYfLd/9RQ==` |
| mcp-server | `sha512-WFXOBD0moqh0QfV3fZDbKxCVSs+A8jrHXCwjipNqqxqMOy4r8IA4SSkFnHQ3eVwV3NOAuoUVUTkWS5pJyRp1QA==` |

У обоих пакетов `latest` остался `0.1.0-alpha.2`. Успешная registry/consumer
проверка подтверждает поставку; native acceptance кода до release version bump
зафиксирован отдельно в [результатах интеграции](results-integration.md).

Issue #70 остаётся открытым: SQL→XML требует отдельной локализации по
[плану исследования](../sql-xml-mapping.md). Ограничение точности real сохраняется
в [публичном контракте](../../../docs/reference/ws-client-values.md).
