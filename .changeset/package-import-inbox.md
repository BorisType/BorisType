---
"@boristype/ws-client": patch
"@boristype/mcp-server": patch
---

ZIP пакетов и XML форм и объектов используют общие `inputPath`, `outputPath` и `file.path`. Через 24 часа MCP может очистить созданные им файлы в `~/.boristype/shared/{packages,objects}`. Для постоянного результата укажите путь в проекте. Stdio MCP принимает `--shared-directory` и использует `--project-directory` при отсутствии пригодных корней клиента. XML можно редактировать локально и отправлять с исходным `readToken`. Просмотр ZIP сохраняет совместимость с `localPath` и сообщает `PackageFileNotFound` до обращения к HCM, если файл отсутствует по разрешённому пути.
