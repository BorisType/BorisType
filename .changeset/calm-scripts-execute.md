---
"@boristype/ws-client": minor
"@boristype/mcp-server": minor
---

Добавлены `WshcmApi.execute({code})` и MCP tool `wshcm_execute` для серверного BorisScript: возвращаемое значение, сообщения `print(value)` и native ошибки с сохранением вывода. Transport/response failures отмечают неизвестный исход без автоматического retry; timeout клиента не останавливает серверный код. XML/date/typed values используют общую проекцию с XQuery. DLL не требуется; штатные alert/логи не перехватываются.

`print(value)` оставлен экспериментальным кандидатом: практическую полезность ещё предстоит оценить, после чего функция может быть изменена или удалена.
