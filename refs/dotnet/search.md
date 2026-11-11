# Ограниченный managed поиск

Поиск выполняется через `Search.FindJson(string rootPath,string requestJson)`;
это единственный bridge method с таким именем. Managed cancellation имеет
другое имя `FindJsonWithCancellation`. BS разрешает root URL, DLL получает
абсолютный physical path, MCP добавляет исходный URL к относительным matches.
Текущий JSON API — **2**; alpha.2/API 1 в [первом native отчёте](../research/dotnet/06-search-results.md)
является историческим checkpoint, не совместимой конфигурацией текущего MCP.

## Почему System.IO и ограниченный glob

BS traversal усложнял streaming/matching, grep требовал executable и разных
Windows/Linux правил, NuGet glob library добавляла dependency ради небольшого
подмножества. Выбран собственный glob → NonBacktracking regex; content regex
использует штатный .NET engine с timeout 50 ms на сопоставление. Ни shell,
ни Datex callback, ни compiler TS→BS в этом пути нет.

Glob всегда case-sensitive ordinal: `*`, `?`, полный сегмент `**`, где `**/`
может означать ноль каталогов. Без `/` pattern сопоставляется с basename на
любой глубине. Единственный separator — `/`; absolute/drive patterns,
`.`/`..`, пустые segments, backslash и `[]`/`{}` отвергаются. Directory exclusions
проверяют имя и имя с конечным `/`, чтобы `vendor/**` отсекал само поддерево.
Relative **результат** может содержать literal backslash/colon Linux filename:
это данные, не Windows path. Root URL и path возвращаются раздельно; из path
не строится URL по предположению клиента. Physical paths в успешном ответе
не нужны.

## Как устроены пределы

| Предел        | Default / hard maximum | Что ограничивает                                  |
| ------------- | ---------------------- | ------------------------------------------------- |
| maxResults    | 200 / 1000             | matches, одно первое совпадение на строку         |
| maxEntries    | 10000 / 100000         | все перечисленные entries, включая исключённые    |
| maxDepth      | 10 / 32                | root files на глубине 0                           |
| maxFileBytes  | 1 MiB / 8 MiB          | отдельный читаемый файл                           |
| maxTotalBytes | 16 MiB / 64 MiB        | фактически прочитанные bytes                      |
| timeoutMs     | 2000 / 10000           | cooperative deadline между IO/regex               |
| maxLineLength | 2000 / 8192            | UTF-16 units; длинная строка пропускается целиком |

Pattern ≤256 chars, до 32 exclusions, непустой query ≤1024 chars.
Без query ищутся имена без чтения файлов; regex требует query.
Literal ignoreCase — OrdinalIgnoreCase, regex — CultureInvariant.
[SearchContract](../../packages/dotnet/src/BorisType.FileSystem/SearchContract.cs)
остаётся источником точных ranges; invalid options/patterns отклоняются до
обхода.

Lazy iterative DFS не сортирует/материализует всё дерево. Готовые matches
сортируются ordinal по path/line; subset при раннем останове зависит от порядка
filesystem enumeration. Root/ancestors не могут быть reparse points; child
links/junctions пропускаются. Это политика стабильного дерева, не TOCTOU sandbox.

Content — strict UTF-8 с optional начальным BOM; NUL, invalid encoding,
oversized files, long lines и child IO errors отражаются в отдельных skipped
counters; root error фатален. Чтение блоками учитывает реальные bytes и рост
файла после открытия. CRLF/CR/LF разделяют строки, query не пересекает newline.
line/column — 1-based, column в UTF-16 units; текст без newline.

JSON budget DLL и итогового MCP ответа — 262144 UTF-8 bytes, для matches
резервируется 256000. MCP учитывает root URL и при необходимости дополнительно
обрезает matches. `limitReason` различает results/entries/bytes/time/regex/output.
При точном исчерпании budget прекращение может быть консервативным. Даже пустой
matches при limitReason или skipped не означает отсутствие данных; полнота
относится только к filters и пройденному охвату.

Cooperative timeout не прерывает заблокированный syscall/сетевую ФС. Special
files/VFS и hard cancellation требуют иной архитектуры. Output limit после
материализации не ограничил бы работу — поэтому budgets проверяются при обходе.

## Что сохраняют проверки

[Первый report](../research/dotnet/06-search-results.md) разделяет actual temporary
filesystem, Node VM с doubled CLR boundary и native HCM. Review regressions:
terminal `**` должен совпадать с LF Linux filename; literal backslash/colon в
результате допустим; drive-prefixed glob — нет; длинный root учитывается в общем
budget; overload reflection не предполагается. Deadline детерминированно
проверяется already-cancelled token, а не скоростью диска.

Native regression с API 2 записана в [alpha.4 report](../research/dotnet/13-read-aware-files-results.md).
Она относится к Linux HCM/CLR 9.0.11, не Windows HCM; текущий Markdown перенос
не был новым runtime acceptance. Запуск — отдельный `test:e2e:search` с уже
установленной совместимой DLL и подготовленным эксклюзивным локальным stand.
