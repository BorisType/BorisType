# WebSoft HCM: наблюдения и основания

Это общие знания платформы, применимые к компилятору, MCP, C# и ручным операциям.
Работающий пример для одной среды не доказывает поведения другой ОС, версии,
runtime, carrier или объектной модели. Правила evidence — в [development](../development.md).

| Вопрос                                             | Краткое понимание                                                                                                                                                                     | Основания и воспроизведение                                                                                                                                        |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `x-local`, `x-app`, `file`, ini и допустимые hosts | URL resolver и разрешённые корни определяются платформой/конфигурацией; запись в DATA-DB/DESIGN-DB сама по себе не доказывает поведение URL                                           | [Path schemes research](../research/dotnet/14-path-schemes-research.md), [переносимый справочник](../../skills/websoft-hcm/references/paths-and-configuration.md). |
| Диск или SQL blob                                  | На исследованном Linux C-runtime SQL hook мог направлять `LoadUrlData` к blob и импортировать файл при отсутствии blob; одинаковый physical path не делает URL APIs взаимозаменяемыми | [Routing research](../research/dotnet/15-url-storage-routing-research.md), [операции и blobs](../../skills/websoft-hcm/references/url-storage-and-blobs.md).       |
| Отрицательные числа и точные IDs                   | SQL→XML, JSON и числовое форматирование могут терять разные сведения на разных этапах; JS Number не сохраняет произвольный 64-bit ID                                                  | [XQuery observations](../research/mcp/09-xquery-native.md), [numbers/SQL reference и probes](../../skills/websoft-hcm/references/numbers-and-sql.md).              |
| XMD, каталог, XMS и Save                           | Сохранение XML-документа и выполнение пользовательского бизнес-сценария различаются; defaults/hooks/permissions имеют собственную семантику                                           | [Object model research](../research/mcp/10-object-model/README.md), [XMS/business logic](../research/mcp/10-object-model/xms-and-business-logic.md).               |
| C# host и callbacks                                | Простая static JSON ABI была проверена отдельно от вызовов обратно в Datex; один callback приводил к падению процесса, причина не установлена                                         | [Native experiment](../research/mcp/06-dotnet-probe.md), [собственные probe sources](../../packages/dotnet/probes/README.md).                                      |

Переносимые пользовательские знания распространяются в
[websoft-hcm skill](../../skills/websoft-hcm/SKILL.md). Он самодостаточен без checkout;
эта страница связывает его с полной историей разработки, а не дублирует весь справочник.
Для браузерных наблюдений есть отдельный
[websoft-hcm-admin](../../skills/websoft-hcm-admin/SKILL.md).

При добавлении вывода укажи источник и степень подтверждения. Новая статья или
declaration может уточнить сигнатуру, но runtime behavior требует собственного основания.
Отсутствующий результат, пустая выдача или timeout не доказывают отсутствие данных
либо изменений. Отдельные неизвестные явно сохраняются в тематическом исследовании.
