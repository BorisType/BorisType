# BS → .NET: физический путь и строковый ABI

Файловое ядро получает абсолютный **серверный physical path** и JSON options.
URL разрешает BorisScript через `UrlToFilePath`; Node не подменяет префикс и
не применяет `path`/`URL` своей ОС. Затем `GetAssembly` загружает standalone DLL,
а unique static method возвращает JSON text. [Решение](../decisions/2026-11-06-dotnet-search-boundary.md).

```text
MCP handler → SOAP evaluator → UrlToFilePath(URL)
                            → GetAssembly("BorisType.FileSystem.dll")
                            → CallClassStaticMethod(class, uniqueName, [path, json])
                            → EncodeJson(JSON text) → Node validates both carriers
```

[managed-files.ts](../../packages/mcp-server/src/tools/managed-files.ts) допускает
фиксированный union методов, а [BS bridge](../../packages/mcp-server/resources/file-operation.bs)
разрешает оба URL move. У search [отдельный template](../../packages/mcp-server/resources/search-files.bs)
с `Search.FindJson`. JSON защищает строки от SOAP/XML преобразований;
non-string, malformed/version-mismatched и oversized ответы отвергаются.

## Почему так

- Pure System.IO/Regex не требуют Datex dependency или обратных вызовов в BS.
  Отдельный уникальный method name не полагается на разрешение overloads по имени:
  такая неоднозначность была найдена при review первого search ABI.
- BS traversal потребовал бы реализовать streaming/glob/limits в слабом runtime;
  внешний grep добавлял бы executable и различия quoting/опций Linux/Windows.
- Универсальный dispatch с client-controlled именем операции усложнил бы review
  контрактов. Восемь file methods и отдельный FindJson имеют явные входы.
- Mapping physical path не переносит provider semantics: `LoadUrlData(x-local)`
  может обращаться к SQL blob. [Выбор backend](../platform/paths-and-storage.md)
  требуется раньше выбора языка реализации.

[Статический разбор Datex.Global](../research/dotnet/03-path-resolution-research.md)
нашёл публичный `DatexGlobal.UrlToFilePath(string)` как wrapper
`InvokeGlobalEnvDelegate`, не самостоятельный mapper. Internal
`UrlToOptFilePath(object)` не становится публичным C# API по аналогии с BS.
Этот разбор не запускал wrapper и не доказывает его безопасность.

## Crash evidence и предел вывода

[Native probe 2026-11-06](../research/mcp/06-dotnet-probe.md) подтвердил net9.0
static calls, Unicode/CRLF, scalar/array arguments, context injection и обычную
managed exception с последующим успешным Ping. Рабочая форма вызова на этом
carrier: `GetAssembly(...).CallClassStaticMethod(...)`, без дополнительного `.Object`.

Вызов `DatexGlobal.EncodeJson` из managed кода дважды завершал Linux HCM
exit 139, `OOMKilled=false`. Второй диагностический payload был дополнительно
экранирован и не является byte-identical повтором первого. Причина не установлена:
нет core/native stack, сравнения component.js/evaluator, других методов/версий.
Это не доказательство, что все callbacks неработоспособны. Отдельный
`unsafe-platform-encode.bs` сохранён, но standalone не запускался и исключён
из стандартной smoke серии. Ненулевой context не доказывает исправность callbacks.

Первая загрузка собственной DLL без restart проверялась; hot replacement уже
загруженной assembly, отдельный AssemblyLoadContext, runtimeconfig и lifetime
памяти этим опытом не установлены. Для обновления планируется restart.
Успешная DLL не решает BS reference-counting cycles и не размораживает compiler
script/module.

## Внешний референс и условия пересмотра

[wshcmx/net audit](../research/mcp/07-wshcmx-net-reference.md) фиксирует main
`cfecf02d67d0e873e26234409e4d98787a5560c4`, release 2.4.0
`4b7e684c2d69ad972420441b77c1edff0fba8e69` и `wshcmx/lib`
`7fc102e8fdc040df9fb18306c953af44876e27ea`. Один номер version не делает main
и tag одинаковыми: Sql namespace и process/templater API расходились, Typifier
терял namespace, TS wrappers использовали старые имена. Это статическое evidence,
не HCM-запуск чужой DLL. ProcessExecutor запускает внешний executable;
это не managed grep. SQL `adapter.Fill` до `Skip/Take` ограничивает выдачу,
а не работу/память.

Для новой dependency проверять полный publish output и фактическую host load,
а не только target `netstandard2.0` или название cross-platform ZIP. Если новая
функция требует Datex callbacks, ей нужна отдельная ограниченная проверка;
обходить известный crash расширением обычного smoke нельзя.
