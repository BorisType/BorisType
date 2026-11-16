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
- [ ] Push feature PR, дождаться CI, merge в main; fixes66–69.
- [ ] Запустить prepare-release(alpha), проверить release PR и merge после CI.
- [ ] Отправить отдельный тег ws-client и дождаться package/publish/verify; затем тег MCP и дождаться verify.
- [ ] Проверить registry next tags и фактическую установку; записать опубликованные версии и ссылки.

Публикуются ws-client и MCP. Подготовка Changesets может обновить версии dependent
CLI/fixed group; это не требует отправлять их release tags. Stable/latest не
переключаются: сохраняется канал next. Новые версии вычисляет существующий helper.
