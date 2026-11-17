---
"@boristype/ws-client": minor
"@boristype/mcp-server": minor
---

Добавлены `WshcmApi.systemInfo()` и MCP tool `wshcm_get_system_info`: сводка версий и настроек стенда, а с `includeReport: true` — полный штатный текст системного отчёта без дополнительной очистки. DLL не требуется; отчёты больше 256 KiB UTF-8 отклоняются целиком. Формализованный JSON подробных конфигураций оставлен в TODO.
