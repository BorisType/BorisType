# .NET библиотеки

`BorisType.FileSystem` — самостоятельная C# библиотека для физических файлов
на сервере WebSoft HCM. Девять файловых MCP tools требуют
**BorisType.FileSystem 0.1.0-alpha.4 / API 2**. Обновляйте MCP и DLL вместе:
API 2 несовместим с alpha.3 / API 1.

Серверный `wshcm_xquery` и XML tools `wshcm_get_form`, `wshcm_get_object`,
`wshcm_save_object` **не используют эту DLL**.

## Установка для MCP

1. Получите installation ZIP `BorisType.FileSystem-0.1.0-alpha.4.zip` из
   artifact workflow `.NET workspace` соответствующей сборки либо соберите его
   по [инструкции сборки и упаковки](https://github.com/BorisType/BorisType/blob/main/packages/dotnet/README.md#требования-и-команды).
   Пакет MCP не устанавливает DLL автоматически.
2. Проверьте в `manifest.json` значения `id`, `version`, `apiVersion`,
   `targetFramework`, а также размер и SHA256 файлов архива. Для этого комплекта
   ожидаются `BorisType.FileSystem`, `0.1.0-alpha.4`, `2` и `net9.0`.
3. Распакуйте содержимое ZIP в каталог из `DOTNETLIBS-PATH` целевого HCM.
   В исследованном Linux стенде использовался `dotnetcore/shared`; путь вашего
   сервера определяется его конфигурацией. Архив содержит production DLL и
   сопроводительные файлы, без CLR, SDK и vendor assemblies.
4. При обновлении уже загруженной DLL планируйте перезапуск HCM. Первая загрузка
   без рестарта проверена; горячая замена — нет.
5. Проверьте metadata загруженной DLL и затем настройте
   [подключение MCP](./mcp-server#установка-и-подключение).

Target framework — **net9.0**. SDK машины сборки и CLR внутри HCM — разные
установки: сборка библиотеки не обновляет CLR сервера. Успех managed tests
не подтверждает совместимость с конкретным HCM.

## Проверка версии на сервере

В существующем BS evaluator целевого HCM вызовите metadata API:

```javascript
var assembly = tools.dotnet_host.Object.GetAssembly("BorisType.FileSystem.dll");
return assembly.CallClassStaticMethod("BorisType.FileSystem.LibraryInfo", "GetMetadataJson", []);
```

Метод возвращает **JSON string**. Для текущей DLL ожидаются:

```json
{
  "id": "BorisType.FileSystem",
  "version": "0.1.0-alpha.4",
  "apiVersion": 2,
  "capabilities": ["search", "files", "edit", "read-ranges", "read-preconditions", "mkdir", "info", "move"]
}
```

Наличие файла DLL на диске не заменяет эту проверку: она показывает metadata
assembly, которую загрузил HCM. Успех metadata-вызова также не заменяет проверку
нужной файловой операции на целевой установке.

## Использование через MCP

| Tool                     | Назначение                                         |
| ------------------------ | -------------------------------------------------- |
| `wshcm_read_file`        | UTF-8 текст или диапазон строк, hash и readToken   |
| `wshcm_write_file`       | Создание файла либо overwrite после полного чтения |
| `wshcm_edit_file`        | Точные замены в прочитанном тексте                 |
| `wshcm_list_directory`   | Непосредственные элементы каталога                 |
| `wshcm_search_files`     | Поиск имён и UTF-8 содержимого                     |
| `wshcm_delete_file`      | Удаление отдельного файла                          |
| `wshcm_create_directory` | Создание каталога и отсутствующих родителей        |
| `wshcm_move_file`        | Rename без overwrite и copy/delete fallback        |
| `wshcm_get_file_info`    | Metadata без чтения содержимого                    |

BS bridge разрешает платформенный URL через `UrlToFilePath` и передаёт в DLL
физический путь. DLL не вызывает ядро BorisScript через Datex callbacks.

Text IO использует strict UTF-8 и ограничение файла 1 MiB; write добавляет BOM,
edit сохраняет исходный BOM. MCP требует `readToken` и прочитанное покрытие
перед edit или overwrite. Поиск и metadata не заменяют чтение.
[Учёт чтений, token и ошибки](./mcp-server#чтение-перед-изменением) описаны
в руководстве MCP.

## Ограничения

Физический путь и логический URL могут обозначать разные данные. Например,
`LoadUrlData` с SQL storage hook может читать blob из `spxml_blobs`, а DLL —
другие байты на диске. Изменение или удаление дисковой копии не обновляет blob.
ReadToken и hash относятся к физическому файлу.

Links/junctions и их ancestors отвергаются; special files и VFS не аттестованы.
Write/edit используют временный файл рядом с target и rename, но финальная
проверка bytes и rename не образуют атомарный cross-process CAS. Сохранение
owner/ACL/inode/hardlinks не гарантируется. Move не заменяет существующий
путь и не копирует данные между файловыми системами.

Полный string ABI, параметры и лимиты доступны в
[README библиотеки](https://github.com/BorisType/BorisType/blob/main/packages/dotnet/README.md).

## Границы проверок

DLL alpha.4 / API 2 и все девять файловых tools с read guards прошли ограниченную
native acceptance на **Linux HCM 2025.2.1333 / CLR 9.0.11**. Это результат одной
C-runtime сборки. Windows HCM, другие версии HCM и JS runtime этим не проверены.
Managed/pack tests выполняются вне HCM и не расширяют эту границу.

[Основания и результаты](https://github.com/BorisType/BorisType/blob/main/refs/dotnet/README.md)
собраны во внутренней базе. Подготовка SDK, сборка, упаковка, vendor references
и native probes относятся к [разработке инструментария](https://github.com/BorisType/BorisType/blob/main/refs/development.md).
