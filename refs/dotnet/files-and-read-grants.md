# Файловые изменения, чтения и внешняя гонка

Актуальное ядро — BorisType.FileSystem **alpha.4/API 2** и девять MCP tools.
[Публичный контракт](../../packages/mcp-server/README.md) задаёт параметры;
здесь собраны основания и ограничения из промежуточных designs alpha.3/API 1
и реализации учёта чтений. Optional `includeMetadata`, необязательный hash для
edit и unconditional overwrite относятся к прежнему API, не текущему.

## Разделение ответственности

MCP `ReadState` хранит факт выдачи диапазонов клиенту; DLL проверяет bytes/hash
и покрытие patches. Hash или угаданный oldText сами по себе не доказывают,
что клиент получил текст. Состояние принадлежит **одному createServer**, точной
строке URL и версии исходных bytes. Другой экземпляр не принимает token;
разные чаты, переиспользующие один экземпляр, автоматически не изолированы.
Выдача клиенту не доказывает осмысление моделью.

Read возвращает JSON с content, BOM, SHA256 исходных bytes и readToken.
SHA256 включает BOM; координаты — UTF-16, half-open, после удаления ровно
одного BOM. startLine/endLine — 1-based inclusive; CRLF — один перенос, CR/LF
тоже делят строки, newline входит в выданный content. Пустой файл и конечная
пустая строка учитываются. Диапазон не снимает общего лимита файла в 1 MiB.

Каждое чтение выдаёт новый UUID и заменяет прежний token URL. Покрытие той же
версии объединяется **только при передаче предыдущего readToken** в следующий
read. Без этого остаётся новый диапазон. Иначе потерянный ответ мог бы молча
расширить старый grant. Смена hash сбрасывает покрытие; URL aliases требуют
собственного чтения. Состояние ограничено 128 snapshots, 256 объединёнными
интервалами на snapshot и TTL 30 минут. Edit не продлевает TTL; eviction требует
нового чтения. Локальная очередь сериализует read/mutations.

## Edit и overwrite

Exact replacements выполняются последовательно в промежуточном тексте, ordinal.
Непустой oldText должен встретиться ровно один раз, включая overlapping
occurrences; иначе EditNotFound/EditAmbiguous с 1-based editIndex. Каждая
заменяемая область целиком должна лежать в прочитанном покрытии. После patch
диапазоны сдвигаются, клиентский newText считается известным; unknown gap нельзя
поглотить одним oldText. Все edits и промежуточные размеры проверяются до записи.
До 100 edits; no-op не переписывает файл. BOM/newlines сохраняются.

MCP передаёт DLL обязательные expectedSha256/allowedRanges из своего snapshot.
Дополнительный пользовательский expectedSha256 не заменяет token. dryRun
проверяет те же условия, не создаёт temp и не расходует token. Полный preview
**не расширяет grant**: его выдаёт только read_file.

Write по умолчанию create-only: token не нужен, но no-overwrite rename не
позволяет заменить даже target, появившийся после проверки. Overwrite требует
полного покрытия `[0,totalLength]`, hash и повторного сравнения bytes перед
rename. Write создаёт UTF-8 BOM; edit сохраняет прежний. После допущенной
mutation попытки edit/write/delete grant URL инвалидируется, включая ошибку
доставки; move инвалидирует source/destination. Отказы schema/precondition до
допущенной попытки не означают выполненную mutation. Последующее изменение
физического alias обнаруживается byte hash, а не нормализацией URL на клиенте.

Delete остаётся явной операцией без чтения всего binary file. Правило чтения
не является sandbox против клиента, намеренно вызывающего delete/create либо
прямой SOAP. DLL доверяет ranges, полученным от MCP, и не хранит sessions.

## IO и commit

[Files](../../packages/dotnet/src/BorisType.FileSystem/Files.cs) использует strict
UTF-8; NUL/invalid UTF-8 и invalid UTF-16 input отвергаются. Text bytes/output
ограничены 1 MiB включая BOM, JSON — 8 MiB, listing — 10000 entries. Нарушение
лимита даёт error, а не успешный partial/empty read. Parent у write должен
существовать. List возвращает immediate entries ordinal и помечает links;
file root, recursive delete и следование symlink/junction не допускаются.

[FileIo.Replace](../../packages/dotnet/src/BorisType.FileSystem/FileIo.cs)
создаёт unique temp sibling, пишет/flush-to-disk, повторно проверяет path и
original bytes, затем rename; finally удаляет temp. Existing Unix rwx сохраняются,
special mode bits — нет; новый файл создаётся mode 0600 с учётом umask.
Replacement меняет inode/hardlink relationship; owner/ACL preservation не
обещается. Подготовка response до commit уменьшает ошибки после mutation,
но transport loss не откатывает запись.

Process-wide MutationLock сериализует собственные mutations одного загруженного
экземпляра библиотеки. Между последней проверкой bytes и rename внешний writer
может записать новую версию, которую rename затрёт. **Это не атомарный external
CAS**. Lock-файл без участия платформы и остальных writers не решает проблему.
Нужна отдельная проверка участвующих writers/ФС и детерминированная синхронизация
двух процессов между compare/commit на Linux/Windows; random sleep недостаточен.

## Каталоги, metadata и move

Create-directory — mkdir-p, existing directory даёт created=false; частично
созданная цепочка не является транзакцией. Get-file-info читает metadata без
текста/hash/token, включая binary и файлы >1 MiB. Оба отвергают link ancestors.

Move — только файл, existing parent и отсутствие overwrite; скрытого
copy/delete fallback нет. [FileMove](../../packages/dotnet/src/BorisType.FileSystem/FileMove.cs)
вызывает Linux renameat2/RENAME_NOREPLACE или Windows MoveFileExW без COPY_ALLOWED.
CrossDevice/UnsupportedPlatform/UnsupportedFilesystem — явные ошибки.
Managed Linux `/dev/shm` проверка cross-device отказа не становится native HCM
проверкой этого случая. Windows managed CI также не аттестует Windows HCM.

Read-multiple отложен до измерения стоимости SOAP; directory-tree потребовал бы
bounded recursive listing. Search не показывает пустые каталоги и не заменяет
дерево полностью. Удалённые stubs не являются обещанными capabilities.

## Основания и критерии новых проверок

[Read-aware native report](../research/dotnet/13-read-aware-files-results.md)
содержит hashes alpha.4/API 2, independent bytes/cleanup и границы Linux
HCM 2025.2.1333/CLR 9.0.11. [Прежний alpha.3 report](../research/dotnet/09-file-tools-results.md)
сохраняет byte/BOM/edit evidence и regression `expectedSha256:null`, который
обходил прежнюю проверку и был исправлен. Эти датированные результаты не
переаттестовывают текущий head.

Managed tests нужны для actual files/coverage/rename, protocol/VM — для
schemas/tokens/carriers; отдельный native runner — для URL resolver/reflection
в HCM. Stable local files не доказывают special files/VFS, TOCTOU sandbox,
hard syscall cancellation, owner/ACL, cluster или external CAS. Физические
байты не равны SQL-backed URL: [storage](../platform/paths-and-storage.md).
