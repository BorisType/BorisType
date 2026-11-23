---
"@boristype/ws-client": patch
"@boristype/mcp-server": patch
---

Экспорт пакетов возвращает `exportPath` в `~/.boristype/packages/export` и принимает `outputPath` внутри проекта. Для просмотра передайте `artifactId` или путь к ZIP в проекте либо в общих каталогах `packages/import` и `packages/export`. Произвольные пути за их пределами отклоняются. Пути обмена задают `--package-import-directory` и `--package-export-directory`. MCP получает корни от клиента или из `--project-directory`. SDK поддерживает `importDirectory`, `exportDirectory` и `projectDirectory`. Существующие файлы сохраняются.
