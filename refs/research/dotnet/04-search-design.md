> Исторический материал из `plans/dotnet/04-search-design.md` (baseline `8ff2739`).
> Статусы, команды и утверждения ниже относятся к описанному этапу; актуальные входы — [refs](../../README.md).

# Первый файловый поиск: BS resolver и независимое C# ядро

Дата: 2026-11-06. Пользователь разрешил начать реализацию с преобразованием
платформенного URL в BS перед вызовом DLL и явно подтвердил поиск «по содержимому
и именам». Без query тот же API ищет имена.

## Граница компонентов

`wshcm_search_files` → SOAP evaluator → BS `UrlToFilePath` →
`BorisType.FileSystem.Search.FindJson(string rootPath, string requestJson)`.
DLL принимает только абсолютный физический путь каталога и JSON options;
возвращает JSON string. Нет Datex reference, callback, процесса grep или shell.
MCP оборачивает response исходным `root` URL. Пути matches относительно root,
с `/` как единственным разделителем (backslash/colon могут быть данными Linux-имени), без предположений о преобразовании имён в URL. Root URL и relative path
возвращаются раздельно; физические серверные пути в успешном ответе не раскрываются.

Продолжаем в текущей `feat/mcp-server`, сохраняем `.agents/` пользователя и
прежние native evidence. Не переписываем четыре существующих инструмента.
Версия первой DLL становится `0.1.0-alpha.2`, API version остаётся 1,
capabilities получает `search`. Установка DLL выполняется отдельно; при её
отсутствии новый инструмент возвращает tool error, остальные работают как прежде.

## Запрос

| Поле            | Default  | Контракт                                                             |
| --------------- | -------- | -------------------------------------------------------------------- |
| pattern         | `**/*`   | Glob до 256 chars; без `/` сопоставляет basename на любой глубине    |
| excludePatterns | `[]`     | До 32 glob; исключённые каталоги не обходятся                        |
| query           | null     | null — имена; непустая строка до 1024 chars — содержимое             |
| regex           | false    | .NET line regex, CultureInvariant, timeout 50 ms на сопоставление    |
| ignoreCase      | false    | OrdinalIgnoreCase для literal; CultureInvariant IgnoreCase для regex |
| maxResults      | 200      | 1–1000, один результат на строку, первое совпадение                  |
| maxEntries      | 10000    | 1–100000, все перечисленные entries, включая исключённые             |
| maxDepth        | 10       | 0–32; файлы корня имеют глубину 0                                    |
| maxFileBytes    | 1048576  | 1–8388608                                                            |
| maxTotalBytes   | 16777216 | 1–67108864, фактически прочитанные bytes                             |
| timeoutMs       | 2000     | 1–10000, cooperative deadline между IO/regex операциями              |
| maxLineLength   | 2000     | 1–8192 UTF-16 units; более длинные строки пропускаются целиком       |

Неизвестные JSON properties, неверные типы, null вместо обязательного значения,
недопустимые ranges и malformed regex/glob отвергаются до обхода.
regex/ignoreCase относятся к содержимому; glob всегда case-sensitive ordinal,
независимо от ОС. `regex=true` без query отвергается.

Glob поддерживает `*`, `?`, полный сегмент `**`; `**/` может соответствовать
нулю каталогов. `/` — единственный separator; абсолютные patterns, `.`/`..`,
пустые segments, backslash и неподдерживаемые `[]`/`{}` отвергаются.
Для directory exclusions проверяются относительное имя и имя с конечным `/`:
`vendor/**` исключает сам vendor и всё поддерево.

## IO и пределы

Итеративный depth-first обход через ленивые enumerators, без сортировки/загрузки
всего дерева. Matches сортируются ordinal по path/line перед возвратом; выборка
при раннем прерывании зависит от порядка filesystem enumeration.
Root и его ancestors не могут быть reparse points. Дочерние symlink/junction
пропускаются. Это политика обхода обычного стабильного дерева, не защита от
конкурентной подмены путей (TOCTOU) и не filesystem sandbox.

Имена ищутся без чтения файлов. Содержимое — strict UTF-8, допускается начальный
UTF-8 BOM. NUL означает binary; invalid UTF-8 и большие файлы пропускаются с
отдельными counters. Файлы читаются ограниченными блоками, учитывая фактические
bytes и рост после открытия. CRLF, CR и LF разделяют строки; line/column —
1-based, column измеряется в UTF-16 units. Возвращается текст строки без newline.
Query не пересекает строки. Ошибки дочерних IO учитываются, ошибка root фатальна.

Ограничение JSON ответа DLL и итогового MCP JSON — 262144 UTF-8 bytes; на сериализованные matches
выделяется 256000, остальное зарезервировано для фиксированного envelope. MCP отдельно учитывает root URL;
если он превышает общий бюджет, обрезает matches и возвращает limitReason=output.
Результат с пустым matches и причиной прерывания не считается полным ответом.
Deadline не обещает прервать блокирующий syscall/сетевую FS; специальные файлы
и произвольная VFS не аттестуются. Hard cancellation требует отдельной архитектуры.

## Ответ

```json
{
  "apiVersion": 1,
  "matches": [{ "path": "lib/a.bs", "line": 2, "column": 5, "text": "var needle = 1;" }],
  "limitReason": null,
  "stats": { "visitedEntries": 2, "filesRead": 1, "readBytes": 18 },
  "skipped": { "links": 0, "depth": 0, "tooLarge": 0, "binary": 0, "invalidEncoding": 0, "longLines": 0, "ioErrors": 0 }
}
```

В name-only matches есть только path. limitReason: null, `results`, `entries`,
`bytes`, `time`, `regex` или `output`. При исчерпании budget прерывание может
быть консервативным, даже если budget совпал с последней записью. Нулевые skipped
и null limitReason означают полный проход в рамках filters; skipped показывают
исключения из охвата. Не выдавать частичный результат за полный.

## Альтернативы и проверка

- BS traversal усложняет glob/streaming и нагружает слабый runtime.
- Native grep требует разных executable и правил quoting Windows/Linux.
- NuGet glob library добавляет dependency для маленького подмножества.
- Выбран System.IO плюс ограниченный собственный glob → NonBacktracking regex;
  content regex использует штатный .NET engine с timeout.

Тесты используют реальные temporary files: Unicode/BOM/newlines, nested globs,
pruning, links, invalid input/encoding, binary и каждый детерминированный budget.
Для cooperative deadline тестировать cancellation через уже отменённый token;
не полагаться на скорость диска. Managed entry FindJsonWithCancellation принимает CancellationToken;
bridge entry FindJson остаётся ровно `(string, string)` и единственным методом с этим
именем, чтобы не полагаться на разрешение overloads платформенным bridge.
MCP protocol tests выполняют настоящий BS template в Node VM, подменяя внешние
platform/CLR вызовы; это adapter evidence, не C-runtime acceptance.
Отдельная bounded native проверка при доступном стенде: path resolver, actual
DLL, Unicode/newlines, результат и evaluator cleanup. Managed проверки Windows
должны выполняться отдельным CI job; текущий локальный запуск относится к Linux.
