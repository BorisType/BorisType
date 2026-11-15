# .NET библиотеки

`BorisType.FileSystem` — самостоятельная C# библиотека для физических файлов
на сервере WebSoft HCM. Девять файловых MCP tools используют
**BorisType.FileSystem 0.1.0-alpha.4 / API 2** через общий SDK.
API 2 несовместим с alpha.3 / API 1; комплект поставляется автоматически.

Серверный `wshcm_xquery` и XML tools `wshcm_get_form`, `wshcm_get_object`,
`wshcm_save_object` **не используют эту DLL**.

## Автоматическая подготовка для MCP и SDK

Установки npm-пакета достаточно для доставки DLL: production assemblies,
manifest и hashes включены в ws-client. При первом файловом вызове SDK
проверяет пакет, доставляет helper через BS file primitives и проверяет
серверный readback перед GetAssembly. Установщик подготавливает компонент
в неизменяемом каталоге и определяет загруженную assembly по MVID из памяти.
Отдельно скачивать или распаковывать DLL не нужно.

Требуются net9 HCM, настроенный managed search root `dotnetcore/shared` и
права серверного аккаунта на запись/загрузку managed code. Собственный корень —
`<AppDirectoryPath>/dotnetcore/shared/.boristype-runtime/`. SDK не меняет
конфигурацию и не устанавливает CLR. Нестандартная конфигурация без shared
может привести к ошибке bootstrap. Установка из npm не требует .NET SDK;
сборка ws-client из исходников требует SDK из global.json.

В MCP вызовите `wshcm_runtime_status` с `{}` или просто файловый tool.
Этот status tool может устанавливать файлы и загружать managed code.

| Статус           | Значение и действие                                                                                           |
| ---------------- | ------------------------------------------------------------------------------------------------------------- |
| ready            | Загружен требуемый build или более новый совместимый API; файловые операции доступны                          |
| restart_required | Новая DLL подготовлена рядом, но процесс использует другую. После штатного перезапуска HCM повторить проверку |
| blocked          | Проверить reason: несовместимый API, hash/metadata mismatch, BuildConflict, права или transport/host error    |

Status schema 1 разделяет `expected`, `installed`, `loaded` identity:
`id/version/apiVersion/buildId`. buildId — MVID; hash файла на диске не
определяет уже загруженный code. `process` обозначает ответивший PID/start/CLR,
а при локальной или неизвестной transport ошибке равен null.
Файловые ошибки сохраняют runtimeStatus как JSON; XQuery/XML остаются доступны.

Установщик не откатывает новую совместимую версию, не перезаписывает loaded DLL
и не перезапускает HCM. Разные builds одного version могут дать BuildConflict;
повторная публикация с тем же номером не считается обычным обновлением.
Следующий вызов после restart проверяет состояние заново. Gate и операция —
разные SOAP calls: один status не аттестует весь кластер. Timeout не отменяет
работу сервера. Старые installation directories автоматически не удаляются.

Для самостоятельных managed consumers installation ZIP остаётся отдельным
build artifact; это не обязательный этап установки MCP.
[Сборка и состав архивов](https://github.com/BorisType/BorisType/blob/main/packages/dotnet/README.md).

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
