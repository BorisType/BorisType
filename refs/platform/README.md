# WebSoft HCM: наблюдения и основания

Общие знания платформы применяются к MCP, .NET, компилятору и ручным операциям.
Результат одной ОС/версии/runtime/carrier не переносится автоматически на другую.
[Правила evidence](../development.md) различают documentation, declarations,
static source, JS/mock, managed tests и native C-runtime.

- [Пути, ini, physical disk и SQL blobs](paths-and-storage.md): адресный mapping
  не равен storage routing, чтение может импортировать файл в SQL, DATA-DB не
  даёт универсального registry/provider recipe.
- [Документ/XMD/catalog/XMS и lifecycle](object-model.md): full XML versus
  projection, defaults/hooks/related objects, claims, lost update и unknown Save.
- [XQuery/числа](../mcp/xquery.md): SQL→XML потери до SOAP, signed formatters,
  exact IDs, row/output versus workload и timeout.
- [Managed host/callback](../dotnet/bridge.md): standalone JSON ABI и границы
  известного Datex callback exit 139 с неизвестной причиной.
- [Переносимые skills и основания проверки](agent-skills.md): независимые
  references, installed artifacts, единичные application passes и admin UI evidence.

Переносимые пользовательские знания — в [websoft-hcm](../../skills/websoft-hcm/SKILL.md),
сценарии tools — [boristype-mcp](../../skills/boristype-mcp/SKILL.md), browser route —
[websoft-hcm-admin](../../skills/websoft-hcm-admin/SKILL.md). Эти skills самодостаточны
без checkout; refs связывают их с полным evidence и открытыми вопросами.

Datex может пропускать arguments и ошибаться. Specific HTTPS source и закреплённый
revision/file wshcmx/types помогают проверить сигнатуру, но не заменяют runtime
semantics. Отсутствующая declaration/API на одном стенде не доказывает общего
отсутствия; пустая выдача/timeout/error не доказывают отсутствия данных/изменений.
