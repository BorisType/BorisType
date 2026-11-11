> Исторический материал из `plans/mcp-server/06-dotnet-probe.md` (baseline `8ff2739`).
> Статусы, команды и утверждения ниже относятся к описанному этапу; актуальные входы — [refs](../../README.md).

# MCP: собственные .NET DLL, native smoke и сбой callback

Дата: 2026-11-06. Продолжение [инвентаризации .NET](05-dotnet-search-research.md).
Код и повторяемые команды: [.NET probes](../../../packages/dotnet/probes/README.md).

## Результат и область

На существующем Linux C-стенде проверены собственные `BorisType.PlainProbe.dll`
и `BorisType.DatexProbe.dll`. Итоговый smoke: **19/19**, штатный cleanup evaluator
и независимая проверка его отсутствия через Docker. Это не реализация MCP search,
не проверка Windows и не аттестация всех .NET/Datex API.

- SDK на хосте: **9.0.320**, установлен официальным dotnet-install вне git в
  `/home/agent/.local/share/boristype-dotnet`; CLR SDK-хоста **9.0.22**.
- Target framework собственных class libraries: **net9.0**, AnyCPU, без RID/AOT.
- Выполнение: HCM **2025.2.1333**, Linux amd64, CLR **9.0.11**.
- Image ID: `sha256:0edeac24afc2a5371ea8431c59b1c17ca2b1a9e5a3768275cfdb5023609e34ab`.
- Carrier: ws-client → SOAP → eval во временной BS library → DotNetCoreHost.
- Нужен только существующий `DOTNETLIBS-PATH` с `dotnetcore/shared`;
  xHttp.ini не менялся, debug-флаги не переключались.

## Платформенная ссылка

Из остановленного контейнера извлечён только
`/WebsoftServer/dotnetcore/core/linux/Datex.Global.dll`. Файл хранится вне git,
в приватном research-каталоге стенда. SHA256:
`fc4cb9134b3a8504575448660509e385c985cf566668b12556a26535646d06a4`.

`PlainProbe` не имеет ссылок Datex или сторонних NuGet packages. Для `DatexProbe`
этой одной DLL достаточно: обе сборки проходят Release build с 0 warnings/errors.
`Private=false` оставляет платформенную DLL вне output; reference runtime-методом
подтверждён как `Datex.Global`, version **2.25.12.4**.
Windows-вариант Datex.Global в Linux-образе не найден. Платформенные native
библиотеки не копировались: необходимости в них для этих двух проектов нет.

## Успешные native-проверки

Собственные DLL скопированы в `/WebsoftServer/dotnetcore/shared`; новая сборка
была найдена уже работающим сервером. Это не проверка замены ранее загруженной DLL.
Минимальный Ping вернул ровно `pong`; временный evaluator удалён.

Итоговый неизменённый `bridge.bs` проверяет:

- Статический вызов без аргументов и строковый результат.
- Пустую строку, whitespace, кириллицу, emoji, CJK, CR/LF/CRLF, кавычки,
  backslash, XML metacharacters и entity/template-like text.
- Строку `000123` с сохранением строкового типа.
- .NET JSON serializer для строки и null; результат разбирается Node JSON.parse.
- Привязку BS integer к Int64, сумму 42 и значение 2147483648.
- Boolean arguments/results и различие null / empty string.
- Runtime metadata из исполняемой DLL, ссылку на Datex.Global.
- Автоматическую передачу последнего аргумента `DatexGlobal context`:
  `HasContext()` вызывается с пустым массивом BS arguments и возвращает true.
- `InvalidOperationException` из C#: BS catch получает `BT_PROBE_EXPECTED_FAILURE`,
  а последующий Ping в том же evaluator возвращает `pong`.

Рабочая форма: `tools.dotnet_host.Object.GetAssembly(name)` возвращает объект,
у которого `CallClassStaticMethod(...)` вызывается напрямую, без `.Object`.
Это уточняет неоднозначные примеры документации, где свойство assembly компонента
может представлять другой wrapper.

SHA256 итогового source/evaluated BS совпадают, адаптации нет:
`6e5784fdbaefec0e518281c489781489f03c787bf523e6937a6ed5218e4927c5`.

| Загруженная собственная DLL | SHA256                                                             |
| --------------------------- | ------------------------------------------------------------------ |
| BorisType.PlainProbe.dll    | `0091218db94c38f24aaae4272ac356a8b611f912ab00fd36575e5fec9fcdff85` |
| BorisType.DatexProbe.dll    | `b687912f4b96d234fde4a01b1223274d7a0e361ae881322fe21919c7862f612e` |

Вне git сохранены `native.result.jsonl` и `isolate.result.jsonl` в research-каталоге
стенда. Исходники/загруженные DLL относятся к указанным hashes; самостоятельные
повторные сборки могут иметь другие hashes из-за путей и metadata.

## Известный сбой DatexGlobal.EncodeJson

Попытка вызвать из C# `context.EncodeJson(value)` через автоматически переданный
`DatexGlobal context` завершила HCM с **exit 139, OOMKilled false**. Подтверждены
два сбоя, без автоматического повторения после timeout:

1. Первый полный smoke включал этот вызов перед проверкой managed exception.
   SHA256 исходного/evaluated BS:
   `11d9e9d968986fbcfd1ef71246cd427525546bf7e4a861cb7a649cc6a7ebfd68`.
   Процесс завершился; первоначальный runner перекрыл transport error ошибкой
   независимой очистки. Runner исправлен: теперь сохраняет обе ошибки.
2. После проверки exited/OOM state стенд запущен заново; оставшийся evaluator
   удалён по точному имени. Диагностический запуск выполнял предыдущие scalar
   операции отдельными SOAP вызовами с фиксацией шага. Runtime/reference/context
   прошли, затем `platformEncoded` дал `Request failed: socket hang up` и снова
   exit 139. SHA256 именно этого сгенерированного фрагмента:
   `a0d054a93141a67ee0704022cd44cd63f39a08ee3cc2e7d54f7eeb330eaeaa45`.
   В диагностическом фрагменте escapes payload были дополнительным образом
   экранированы; это не byte-identical повтор исходного payload.

Затем восстановлен стенд, удалён второй оставшийся evaluator по точному имени,
а failing callback исключён из стандартной серии. Отдельный bounded managed
exception smoke подтвердил обычную передачу C# ошибки в BS. Финальный smoke
прошёл полностью с собственным cleanup.

`unsafe-platform-encode.bs` сохраняет метод и исходный payload как отдельный
кандидат для дальнейшей изоляции; standalone файл **не запускался**. Он исключён
из runner и не должен становиться частью автоматического smoke. Получение
не-null context ещё не подтверждает исправность всех callback-операций.

Причина exit 139 не установлена. Не исследованы native stack/core dump,
вызов из обычного component.js вместо evaluator, другие Datex методы и версии.
Нельзя обобщать сбой на все обратные вызовы или всю интеграцию .NET.

## Практическое следствие и следующий шаг

Первый поисковый прототип может выполнять IO/сопоставление средствами .NET и
возвращать JSON text. Для такого кода Datex.Global вообще не нужна, и callback
из managed code в ядро BS не входит в путь исполнения. Пока проверен только
bridge, а не File IO, поиск, производительность или отмена.

Перед поиском отдельно определить mapping `x-local://` / VFS / физический путь,
корни обхода, symlink/junction, кодировки, пределы работы и ответа. DLL hot reload,
собственный runtimeconfig, отдельный AssemblyLoadContext и долговременная память
этим экспериментом не исследованы. Результат не решает прежнюю проблему циклов
BS reference counting и не размораживает script/module compiler work.

## Завершение проверки

После этого эксперимента probes перенесены в `packages/dotnet/probes` при
[оформлении общего workspace](../dotnet/01-workspace-design.md). Исторические
hashes и native results выше относятся к исходным путям/сборкам до переноса.

- Итоговые DLL и BS имеют SHA256 из таблицы/примера выше; vendor Datex.Global
  отсутствует в build outputs и git, bin/obj исключены локальным .gitignore.
- После успешного smoke evaluator files отсутствуют. Обе собственные DLL удалены
  из `dotnetcore/shared`, отсутствие файлов проверено до остановки контейнера.
- HCM и PostgreSQL снова остановлены; исходное состояние стенда восстановлено.
- Существующие MCP unit tests: **38/38**, failures/skips отсутствуют.
- Проверены синтаксис Node runner, локальные documentation links, форматирование
  изменённых Markdown/Node файлов и `git diff --check`.

## Источники

- [Подключаемые библиотеки](https://wshcm-docs.boristype.dev/news/platform/7117698192299190042.html):
  Datex.Global, отдельные linux/windows paths.
- [Библиотеки программного кода](https://wshcm-docs.boristype.dev/news/platform/7181083125928132263.html):
  CallClassStaticMethod и DatexGlobal parameter в примерах. Это документация,
  автоматическая передача контекста отдельно подтверждена native-проверкой выше.
- [DotNetHost.GetAssembly](https://wshcm-docs.boristype.dev/datex/common/7172076235998782943.html)
  относится к .NET Framework 4.x; её нельзя автоматически считать спецификацией
  исследованного DotNetCoreHost.
- [wshcmx/types, lib/dotnetcorehost/index.d.ts](https://github.com/wshcmx/types/blob/a3b1e43d0b2add53bbc1f2acc2c5128360e8c97b/lib/dotnetcorehost/index.d.ts)
  и `lib/tools/index.d.ts`, revision `a3b1e43d0b2add53bbc1f2acc2c5128360e8c97b`:
  дополнительные сигнатуры GetAssembly / CallClassStaticMethod / tools.dotnet_host,
  не доказательство runtime semantics.

Документация Datex может ошибаться или пропускать аргументы; native-факты выше
относятся только к указанному C-runtime и carrier. JS/mock результатов здесь нет.
