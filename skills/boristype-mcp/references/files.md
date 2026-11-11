# Файлы через BorisType MCP

## Контракт и хранилище

Справочник описывает девять файловых tools прототипа с
BorisType.FileSystem 0.1.0-alpha.4 / API 2. DLL устанавливается отдельно на HCM;
npm-пакет MCP её не содержит. Актуальные параметры сверяй со schemas tools.

Tools разрешают `x-local://` в серверный физический путь и выполняют обычный IO.
ОС агента не определяет синтаксис путей сервера. `x-app://`, `file:`, обычные
OS paths и URL с query/fragment schemas этого прототипа не принимают.
Не заменяй URL aliases автоматически: token связан с точной строкой URL.

**Физический файл и логический ресурс могут содержать разные байты.** На Linux
C-runtime HCM 2025.2.1333 с PostgreSQL и SQL hook для `x-local://wt_data/`:
`LoadUrlData` читал blob при существующем дисковом файле с другим содержимым;
при отсутствии blob мог импортировать файл в БД. Managed file tools и поиск
работают с диском и не покрывают `spxml_blobs`. Если после правки приложение
видит старый текст, сопоставь точный URL, backing store и способ чтения приложения.
Успешный disk read не доказывает, что приложение прочитало те же байты.
Это результат одной конфигурации, не правило для каждого `x-local` URL.

## Найти → прочитать → изменить → проверить

1. Найди файл через `wshcm_list_directory` или `wshcm_search_files`.
   Search без `query` ищет имена; с `query` — UTF-8 содержимое. Учитывай
   `limitReason` и skipped counters: отсутствие match при пропусках/лимитах
   не доказывает отсутствие текста. List возвращает только immediate entries.
2. Прочитай нужный участок через `wshcm_read_file`:

   ```json
   { "path": "x-local://wt/web/app.bs", "startLine": 10, "endLine": 30 }
   ```

   Диапазон 1-based inclusive. Ответ содержит `content`, hash исходных bytes,
   координаты и новый `readToken`. Для накопления других диапазонов той же версии
   передай этот token в следующий read; дальше используй только новый token
   из последнего ответа. Без предыдущего token подтверждается только новое чтение.
   При изменившемся hash прежнее покрытие не переносится.

3. Передай token в `wshcm_edit_file` с точными `oldText`/`newText`:

   ```json
   {
     "path": "x-local://wt/web/app.bs",
     "readToken": "token-from-latest-read",
     "edits": [{ "oldText": "var count = 1;", "newText": "var count = 2;" }],
     "dryRun": true
   }
   ```

   Каждый непустой oldText должен встретиться ровно один раз в промежуточном
   тексте, целиком в прочитанном покрытии. При неоднозначности прочитай контекст
   и включи его в замену. После проверки preview отправь нужную замену с
   `dryRun: false`, если изменение входит в задачу пользователя.

4. После попытки применения перечитай результат перед следующей правкой.
   Preview сохраняет token; допущенная попытка edit без dryRun расходует его
   даже при no-op или ошибке. Потеря ответа не означает отсутствие commit.

Preview может содержать весь файл, но не расширяет разрешённые диапазоны.
Search, metadata и hash тоже не дают read coverage. `expectedSha256` —
дополнительная проверка, а не замена token. Для полной перезаписи явно прочитай
весь файл без line range и используй новый token с `mode: "overwrite"`.

Tokens принадлежат экземпляру MCP, действуют для точного URL и версии, могут
истечь через 30 минут после чтения или быть вытеснены. Между чатами, которые
делят один экземпляр MCP, изоляция не гарантируется. Старый token из другого
экземпляра не переносится; при ReadRequired/Conflict получи свежие reads и
пересмотри изменение. Delete/create не служат обходом чтения для перезаписи.

## Выбор остальных операций

- `wshcm_write_file`: по умолчанию create-only, existing target даёт ошибку.
  Overwrite требует полное чтение; parent должен существовать. Новая запись —
  UTF-8 с BOM, edit сохраняет исходные BOM и неизменённые переводы строк.
- `wshcm_create_directory`: создаёт missing parents; вся цепочка не транзакционна.
- `wshcm_move_file`: `source`/`destination`, без overwrite и copy/delete fallback.
  Cross-filesystem move отвергается; parent назначения должен существовать.
- `wshcm_delete_file`: удаляет отдельный файл, не каталог.
- `wshcm_get_file_info`: metadata, в том числе binary/large files, без readToken.

Delete/move не требуют чтения текста; выбирай их для самой операции удаления
или переноса в рамках задачи. Они инвалидируют связанные tokens.
Текстовые read/write/edit ограничены 1 MiB и strict UTF-8; links/ancestors с
symlink/junction отвергаются. Проверка bytes перед заменой не обеспечивает
атомарный compare-and-replace с внешними writers.

## Источники

- [Публичный контракт MCP](https://github.com/BorisType/BorisType/blob/main/packages/mcp-server/README.md).
- [Read-aware design](https://github.com/BorisType/BorisType/blob/main/refs/research/dotnet/11-read-aware-files-design.md)
  и [native acceptance](https://github.com/BorisType/BorisType/blob/main/refs/research/dotnet/13-read-aware-files-results.md).
- [Наблюдения SQL storage](https://github.com/BorisType/BorisType/blob/main/refs/research/dotnet/15-url-storage-routing-research.md):
  Linux HCM 2025.2.1333 / CLR 9.0.11, server-side eval, PostgreSQL.
  Windows и другие конфигурации этим запуском не проверены.
