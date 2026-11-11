> Исторический материал из `plans/mcp-server/07-wshcmx-net-reference.md` (baseline `8ff2739`).
> Статусы, команды и утверждения ниже относятся к описанному этапу; актуальные входы — [refs](../../README.md).

# MCP: референс wshcmx/net

Дата: 2026-11-06. Исследование исходников, release metadata и состава ZIP;
на HCM библиотека не загружалась, стенд оставлен остановленным.

## Зафиксированные версии

| Источник                            | Revision / версия                                                                   |
| ----------------------------------- | ----------------------------------------------------------------------------------- |
| `wshcmx/net`, main                  | `cfecf02d67d0e873e26234409e4d98787a5560c4` от 2026-10-29                            |
| Latest GitHub release               | `v2.4.0`, commit `4b7e684c2d69ad972420441b77c1edff0fba8e69`, опубликован 2026-05-17 |
| npm `@wshcmx/net`, latest           | `2.4.0`, gitHead совпадает с commit релиза выше                                     |
| Дополнительно прочитан `wshcmx/lib` | `7fc102e8fdc040df9fb18306c953af44876e27ea`                                          |

Версия в csproj main тоже 2.4.0, но исходники main и tag v2.4.0 различаются.
Нельзя переносить состав опубликованной сборки на HEAD только по номеру версии.

## Что применимо к нашей DLL

Основная библиотека — обычная class library с `TargetFramework=netstandard2.0`.
В csproj нет ссылок на Datex.Global или другие vendor assemblies. Зависимости
main: Microsoft.Data.SqlClient 7.1.1, Npgsql 8.0.9, System.Linq.Dynamic.Core 1.6.4,
System.Security.Cryptography.Pkcs 9.0.21. Установлен `CopyLocalLockFileAssemblies=true`.

Главный проект main успешно собран командой
`dotnet build src/wshcmx/wshcmx.csproj -c Release --nologo` с нашим SDK **9.0.320**:
0 warnings, 0 errors. Checkout и output находятся вне BorisType в `/tmp`.
Проекты Test и Typifier на main требуют **net10.0**; полная solution и их тесты
не запускались. Build основной DLL не доказывает совместимость её зависимостей
с CLR конкретного HCM или отсутствие конфликтов с уже загруженными версиями.

В [wshcmx/lib, src/index.ts:61](https://github.com/wshcmx/lib/blob/7fc102e8fdc040df9fb18306c953af44876e27ea/src/index.ts#L61)
сборка загружается через `tools.dotnet_host?.Object.GetAssembly("wshcmx.dll")`.
SQL wrapper создаёт managed instance через `CreateClassObject`, а методы вызываются
непосредственно на нём. Это дополнительный исходный пример того же bridge,
который [наш native smoke](06-dotnet-probe.md) проверил для статических методов.
Native-проверку instance proxy этим чтением исходников не заявляем.

Для будущего поиска подход применим: .NET IO/Regex и сериализация внутри DLL,
BS вызывает небольшой публичный API. Datex references нужны при обращении к
платформенным API, а не просто для загрузки managed DLL.
Отсутствие Datex callback в wshcmx/net не объясняет и не исправляет наш exit 139
при вызове DatexGlobal.EncodeJson через evaluator.

`netstandard2.0` — вариант более широкого API target; это не название CLR и не
гарантия работы всех dependencies на любом старом хосте. Для нашего первого
опыта net9.0 уже проверен; менять target ради сходства с референсом необходимости нет.

## Main и опубликованный release

| API                             | main                      | Tag v2.4.0                                          |
| ------------------------------- | ------------------------- | --------------------------------------------------- |
| SQL                             | `wshcmx.Net.Database.Sql` | `wshcmx.Net.Sql`                                    |
| Templater                       | Отсутствует               | `wshcmx.Net.Templater`, Mustache и File.ReadAllText |
| ProcessExecutor / ProcessResult | Отсутствуют               | Есть, запускают внешний процесс                     |

README и сохранённый `src/Typifier/types/index.d.ts` на main всё ещё перечисляют
удалённые классы и прежнее имя Sql. Published npm gitHead соответствует старому
релизу, где эти классы действительно присутствуют: речь о рассинхронизации
с main, а не о доказанной ошибке npm 2.4.0.

Typifier использует reflection для генерации TS declarations, но записывает все
классы в фиксированное `wshcmx.Net`, не сохраняя `Type.Namespace`. Поэтому простая
перегенерация не отразит новое полное managed-имя Sql. Для нашего bridge нужно
проверять отдельно TS facade и строку полного имени класса для loader.

Текущий SQL wrapper wshcmx/lib также использует старое `wshcmx.Net.Sql`, а его
process wrapper указывает `wshcmx.Net.ProcessHelper`; в tag v2.4.0 класс называется
`ProcessExecutor`. Это статически обнаруженные несовпадения строк/API; запуск
этой комбинации библиотек на платформе не проводился.

`ProcessExecutor` из v2.4.0 использует System.Diagnostics.Process и запускает
указанный executable. Это не реализация grep средствами .NET и не устраняет
различия команд Windows/Linux. Полнотекстового файлового поиска в исследованных
main/tag исходниках нет. Templater старого релиза показывает прямое .NET File IO,
но не задаёт нужные нам правила обхода, лимитов и кодировок.

## Упаковка и платформенные файлы

В workflow main предусмотрены `cross-platform`, `win-x64`, `linux-x64`,
`dotnet publish` с `--self-contained false` для RID-вариантов. Этот workflow
описывает будущую/повторную сборку, а не состав уже опубликованного ZIP.

У latest release v2.4.0 фактически найден **один asset** —
`wshcmx-cross-platform.zip` (4 733 832 байта). Проверена только ZIP inventory,
без загрузки/исполнения содержащихся DLL:

- 59 файлов, из них 57 DLL.
- Datex assemblies, `.so` и каталогов `runtimes` нет.
- Есть собственная DLL, `wshcmx.deps.json`, PDB, .NET/NuGet dependencies и
  resource assemblies Microsoft.Data.SqlClient для разных языков.
- SHA256 ZIP: `539b65eadd330b81e54413d470a5afc78a5727c5b561673d5e6b70b10638086b`.

Имя cross-platform и перечень DLL не подтверждают native acceptance для Windows
и Linux. Для своей DLL следует упаковывать реально требуемые зависимости;
наличие OS-specific assets в чужой библиотеке не означает необходимость
извлекать весь dotnetcore из контейнера. Наш PlainProbe работает без vendor refs.

## Что учесть в дальнейшей работе

- Сохранить независимость поискового ядра от Datex, когда достаточно .NET API.
- Проверять публичные методы, полные managed-имена и TS declarations на одном revision.
- При появлении сторонних dependencies проверять итоговый publish output и загрузку
  на целевом HCM; runtime variants собирать при конкретной необходимости.
- Не считать лимит возвращённых строк лимитом работы: SQL pagination этого
  референса выполняет `adapter.Fill(ds)` до `Skip/Take`. Поиску нужны лимиты
  непосредственно во время чтения/обхода, а не после полной материализации.
- В референсе есть unit tests с FakeDb; они не заменяют HCM native acceptance.

Это дополнительный архитектурный референс, не готовая зависимость для поиска.
Никакие SQL-запросы, процессы или code из wshcmx/net на стенде не выполнялись.

## Ссылки на изученные источники

- [csproj main](https://github.com/wshcmx/net/blob/cfecf02d67d0e873e26234409e4d98787a5560c4/src/wshcmx/wshcmx.csproj).
- [Sql main](https://github.com/wshcmx/net/blob/cfecf02d67d0e873e26234409e4d98787a5560c4/src/wshcmx/Database/Sql.cs).
- [DatabaseProviderBase main](https://github.com/wshcmx/net/blob/cfecf02d67d0e873e26234409e4d98787a5560c4/src/wshcmx/Database/Providers/DatabaseProviderBase.cs).
- [Typifier main](https://github.com/wshcmx/net/blob/cfecf02d67d0e873e26234409e4d98787a5560c4/src/Typifier/Generator.cs).
- [Release workflow main](https://github.com/wshcmx/net/blob/cfecf02d67d0e873e26234409e4d98787a5560c4/.github/workflows/release.yml).
- [Release v2.4.0](https://github.com/wshcmx/net/releases/tag/v2.4.0).
- [ProcessExecutor в release commit](https://github.com/wshcmx/net/blob/4b7e684c2d69ad972420441b77c1edff0fba8e69/src/wshcmx/ProcessExecutor/ProcessExecutor.cs).
- [Templater в release commit](https://github.com/wshcmx/net/blob/4b7e684c2d69ad972420441b77c1edff0fba8e69/src/wshcmx/Templater/Templater.cs).
- [wshcmx/lib SQL wrapper](https://github.com/wshcmx/lib/blob/7fc102e8fdc040df9fb18306c953af44876e27ea/src/sql.ts).
- [wshcmx/lib process wrapper](https://github.com/wshcmx/lib/blob/7fc102e8fdc040df9fb18306c953af44876e27ea/src/process.ts).
