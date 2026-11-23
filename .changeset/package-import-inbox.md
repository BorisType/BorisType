---
"@boristype/ws-client": patch
"@boristype/mcp-server": patch
---

Внешние ZIP для просмотра по `localPath` теперь принимаются только из `~/.boristype/package-inbox` или входного каталога, настроенного через `--package-import-directory` (SDK: `importDirectory`). Поместите туда файл перед просмотром. Для собственного экспорта по-прежнему используйте `artifactId`. Копия с неподходящим форматом удаляется до загрузки на HCM.
