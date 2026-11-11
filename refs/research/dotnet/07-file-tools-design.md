> Исторический материал из `plans/dotnet/07-file-tools-design.md` (baseline `8ff2739`).
> Статусы, команды и утверждения ниже относятся к описанному этапу; актуальные входы — [refs](../../README.md).

# Managed file tools and targeted editing

Дата: 2026-11-06. Пользователь поручил перевести read/write/list/delete на .NET
и реализовать точечный edit. Продолжение существующей feat/mcp-server, без push.

## Boundary and alternatives

Сохраняем BS UrlToFilePath → standalone DLL → JSON string → EncodeJson carrier.
Пять unique `(string physicalPath, string requestJson) -> string` entry points в
`BorisType.FileSystem.Files`: ReadJson, WriteJson, ListJson, DeleteJson, EditJson.
Нет overloads, Datex references/callbacks или fallback на прежние BS операции.
DLL 0.1.0-alpha.3, apiVersion 1, capabilities search/files/edit; search ABI прежний.

Альтернативы: оставить старые операции в BS (две разные политики IO/ошибок) или
универсальный dispatch с именем операции от клиента (хуже явные contracts и review).
Выбраны отдельные методы с общей внутренней валидацией, IO и сериализацией.

## Shared contract

- Absolute physical paths only. Leaf и ancestors не могут быть symlink/junction.
  List показывает ссылки, не обходит их, добавляет isSymbolicLink=true.
- Обычные стабильные local filesystem files. Это не TOCTOU sandbox и не hard
  cancellation; FIFO/devices, VFS, ownership/ACL preservation не обещаются.
- Strict UTF-8, reject NUL/invalid UTF-8/invalid UTF-16 input. Read удаляет ровно
  один BOM; line endings/whitespace сохраняются буквально.
- Text file/output bytes <=1 MiB (BOM included), JSON request/response <=8 MiB,
  list <=10000 entries. Превышение — явная ошибка, не успешный partial/empty ответ.
- JSON request strict, unknown/null/type errors rejected before mutation.
  Operational errors return `{apiVersion:1,error:{code,message,editIndex?}}`.
  Successful payloads also carry apiVersion=1. Node validates complete schema.

## Operations

Read `{}` → `{content,sha256,bom}`. Hash lowercase SHA256 исходных bytes включая
BOM. MCP default отвечает raw text как прежде; includeMetadata=true возвращает
JSON payload с content/hash/BOM для conditional editing.

Write `{content}` → `{bytesWritten,sha256}`. Create/overwrite с UTF-8 BOM, как
проверенная прежняя реализация. Parent должен существовать; readonly и directory
targets отвергаются. Проверки и сериализация ответа выполняются до commit.

List `{}` → `{entries:[{name,isDirectory,isSymbolicLink?:true}]}`; ordinal order,
без recursion. MCP возвращает JSON array как прежде. File/missing root — error.

Delete `{}` → `{deleted:true}`. Только существующий обычный файл, никогда каталог.
MCP write/delete сохраняют `File written/deleted: <URL>` success text.

Edit `{edits:[{oldText,newText}],dryRun?:false,expectedSha256?:hex64}`. <=100 edits,
oldText непустой. Exact ordinal matching, включая overlapping occurrences:
ровно одно совпадение в промежуточном тексте, иначе EditNotFound/EditAmbiguous с
1-based editIndex. Все edits проверяются в памяти до записи. Empty edits/no-op
не переписывает файл. BOM и line endings сохраняются; dryRun не пишет даже temp.

Edit response `{status:applied|dry_run|unchanged,editsCount,previousSha256,sha256,
content?:dryRun}`. expectedSha256 проверяется до подготовки; перед commit исходные
bytes проверяются ещё раз. Stale hash → Conflict. Это не атомарный cross-process CAS:
внешняя запись между последней проверкой и rename остаётся возможной.

Write/edit создают unique temp в том же каталоге, flush и rename; finally удаляет
оставшийся temp. Existing Unix rwx permissions сохраняются, special mode bits не
переносятся. Новые Unix файлы создаются с mode 0600 (с учётом umask).
Atomic replacement меняет inode/hardlink relationship; owner/ACL
могут измениться. Process-wide mutation lock сериализует собственные write/edit/delete
без бесконечно растущего dictionary locks. Ошибки transport после commit не
откатывают файл; edit annotation idempotent=false.

## Acceptance

Настоящий temporary filesystem: exact bytes/hashes, BOM, CR/LF, invalid encoding,
links, readonly, limits, list order, edit ambiguity/overlap/sequential failure,
dryRun/no-op, stale expected hash, no temporary debris. Reflection lookup by name.
MCP tests execute real BS templates with platform/CLR boundary doubles; native
e2e отдельно запускает CLI/stdio/SOAP/DLL на unique fixture. Старые native cases
read/write/list/delete и search сохраняются; edit получает bounded native cases.
DLL обновляется при остановленном стенде; после тестов восстанавливается его state.
