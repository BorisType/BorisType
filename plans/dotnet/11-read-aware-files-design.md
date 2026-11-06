# Учёт чтений и файловое ядро: контракт реализации

Дата: 2026-11-06. Пользователь разрешил реализацию требований из
[следующих этапов](10-file-tools-next-steps.md). Продолжаем feat/mcp-server.

## Версия и границы

DLL 0.1.0-alpha.4 / API 2. Версия всех managed JSON responses, включая search
и metadata, становится 2. BS URL resolver и standalone DLL без Datex callbacks
сохраняются. Это несовместимое обновление прототипа; MCP и DLL обновляются вместе.
Текст по-прежнему strict UTF-8, до 1 MiB исходных bytes, включая BOM.

Гарантия учёта чтений действует для edit/overwrite через этот MCP server.
Создание отдельного экземпляра сервера создаёт отдельную область чтений.
Разделение чатов, переиспользующих один server, не гарантируется. Выдача ответа
клиенту не доказывает получение текста моделью. Строгий cross-process CAS после
последней проверки остаётся отдельным отложенным исследованием.

## Read и состояние

read_file принимает path, optional startLine/endLine (1-based inclusive).
includeMetadata удалён: ответ всегда JSON с content, sha256 исходных bytes,
bom, readToken и координатами startLine/endLine/totalLines/startOffset/endOffset/
totalLength. Offsets — UTF-16, half-open, после удаления одного BOM.
CRLF считается одним переносом; CR и LF тоже разделяют строки. Newline входит
в возвращаемую строку. Пустой файл и завершающая пустая строка считаются строками.
endLine ограничивается концом файла; startLine за концом и endLine < startLine
дают ошибку. Диапазоны не снимают общий лимит файла в 1 MiB.

MCP хранит только hash/координаты, не скрытое содержимое. Read-token — random UUID,
привязан к точному URL, версии и одному экземпляру server. URL aliases требуют
отдельного чтения; локальная нормализация URL средствами клиентской ОС запрещена.
Каждое чтение возвращает новый token и отменяет предыдущий для этого URL.
Для объединения покрытия того же URL/hash клиент передаёт предыдущий readToken
в новый read request; без него сохраняется только новый диапазон. Это не позволяет
молча расширять старый grant ответом, token которого клиент не получил.
Другая версия сбрасывает покрытие. Лимиты: 128 snapshots, 256 объединённых диапазонов
на snapshot, TTL 30 минут без продления при edit. Eviction требует нового чтения.
Read/mutations проходят последовательную очередь внутри экземпляра сервера.

## Edit и overwrite

edit_file требует readToken; optional expectedSha256 остаётся дополнительной
проверкой клиента и не заменяет token. MCP получает expectedSha256 и allowedRanges
из собственного состояния и передаёт их DLL. У DLL EditJson оба поля обязательны.
Для каждого exact unique oldText весь исходный участок должен лежать в покрытии.
Диапазоны обновляются после каждого последовательного patch: введённый клиентом
newText считается известным, более поздние координаты сдвигаются. Unknown gaps
нельзя поглотить одним oldText. Все проверки выполняются до записи.

dryRun проверяет те же условия и не расходует token. Полный preview сохраняется,
но не расширяет покрытие: подтверждением чтения служит только read_file.
После допущенной попытки edit (кроме dryRun), write или delete token
этого URL инвалидируется даже при ошибке доставки результата. После move
инвалидируются source и destination. Другие URL не инвалидируются; при изменении
их физического alias устаревший hash отвергается DLL.

write_file получает mode=create|overwrite, default create. Create не требует
token и использует rename без overwrite: существующий target не изменяется,
включая появившийся после проверки. Overwrite требует token с полным покрытием
[0,totalLength], проверяет hash и повторно сравнивает bytes перед rename.
Write по-прежнему добавляет BOM; edit сохраняет исходный BOM/newlines.
Delete остаётся отдельной явной операцией удаления, без требования чтения текста;
это не sandbox против клиента, намеренно вызывающего delete/create или SOAP.

## Остальные три инструмента

create_directory: mkdir-p, существующий каталог — успех с created=false;
файл на пути и symlink/junction ancestors — ошибка. Создание цепочки не является
транзакцией, внешние filesystem races остаются вне гарантии.

get_file_info: name, isDirectory, sizeBytes только для файла, modifiedUtc;
без чтения текста, hash и предоставления read-token. Файлы могут быть бинарными
или больше 1 MiB. Links/ancestors отвергаются. Metadata не даёт права на edit.

move_file: source/destination URL разрешаются в BS. Только файл, существующий
parent, без overwrite и скрытого copy/delete. Использовать Linux renameat2
RENAME_NOREPLACE и Windows MoveFileExW без COPY_ALLOWED. Другая файловая система
или неподдерживаемая операция — явная ошибка. На других ОС — UnsupportedPlatform.
Binary bytes сохраняются без чтения в текстовый API.

Удалить deferred read-multiple/tree TS stubs и все пять неиспользуемых BS stubs;
общий bridge получает второй resolver для move. Сборка очищает build, чтобы
старые emitted stubs не оставались в npm artifact.

## Acceptance

Managed: реальные временные файлы, line bounds/CRLF/CR/LF/Unicode/BOM, hash и
coverage checks, последовательные сдвиги диапазонов, no-partial-write, create-only,
guarded overwrite, mkdir/info/binary rename/no-overwrite/link failures.
MCP: реальный protocol и BS template, отсутствие/чужой/устаревший token, union
диапазонов, TTL/eviction, сериализация, write обход, invalidation/transport errors.
Pack: отсутствие удалённых stubs в tarball. Native Linux HCM: отдельный bounded
runner для диапазонов/guarded edits/write и новых tools; байты проверяются вне
MCP. Windows managed tests не считать evidence Windows HCM.
