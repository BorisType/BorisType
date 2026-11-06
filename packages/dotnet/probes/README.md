# Тестовая .NET DLL для WebSoft HCM

Исследовательский пример, не новый MCP tool. Подробности и ограничения:
[результат native-проверки](../../../plans/mcp-server/06-dotnet-probe.md).
До переноса в общий workspace на Linux HCM 2025.2.1333 / .NET 9.0.11
проверены **19/19** условий smoke-прогона. Перенос путей сам по себе не является
новой native-проверкой.

## Что требуется

- .NET **9 SDK** на машине сборки и собранный `packages/ws-client` в этом workspace.
- Существующий локальный HCM с работающим DotNetCoreHost и доступом к Docker
  с Linux-хоста; стенд запускается и останавливается отдельно от runner.
- Для `PlainProbe` сторонние сборки и NuGet packages не нужны.
- Для `DatexProbe` нужна `Datex.Global.dll` **из целевой установки** вне git.

`PlainProbe` содержит обычные статические методы и JSON serializer из .NET.
`DatexProbe` отдельно проверяет compile-time reference и переданный HCM-контекст.
Обе сборки — class library, net9.0 / AnyCPU, без RuntimeIdentifier и NativeAOT.
`bin/obj` игнорируются; probes не включены в публикуемый MCP package.

## Извлечение платформенной ссылки

Из корня репозитория, подставив контейнер своего **локального тестового стенда**:

```sh
WSHCM_PROBE_CONTAINER=boristype-c-runtime-net9-wt-1
WSHCM_PROBE_REFS=/absolute/path/outside-repository/references/linux
mkdir -p "$WSHCM_PROBE_REFS"
docker cp "$WSHCM_PROBE_CONTAINER:/WebsoftServer/dotnetcore/core/linux/Datex.Global.dll" "$WSHCM_PROBE_REFS/Datex.Global.dll"
sha256sum "$WSHCM_PROBE_REFS/Datex.Global.dll"
```

`docker cp` работает и с остановленным контейнером. Не добавлять vendor DLL в git.
`Private=false` в csproj исключает её копирование в output; на runtime используется
сборка самой платформы. Другие платформенные зависимости этому примеру не нужны.

Документация указывает `dotnetcore/core/windows` для Windows и
`dotnetcore/core/linux` для Linux. Исследованный контейнер содержит только Linux
вариант Datex.Global. Для API другой установки следует извлекать её собственные
ссылки; совместимость версий и переносимость DatexProbe на Windows здесь не проверены.
Native `.so`/Windows DLL не нужно копировать в собственный проект без конкретной
зависимости. Наличие расширения `.dll` само по себе не означает зависимость от Windows.

## Сборка

```sh
dotnet build packages/dotnet/probes/PlainProbe/PlainProbe.csproj -c Release
dotnet build packages/dotnet/probes/DatexProbe/DatexProbe.csproj -c Release -p:WebsoftReferenceDir="$WSHCM_PROBE_REFS"
```

Получатся `BorisType.PlainProbe.dll` и `BorisType.DatexProbe.dll` в
соответствующих `bin/Release/net9.0/`. Self-contained publish, копирование CLR и
извлечение всего dotnetcore не требуются: код исполняется в CLR сервера.

## Ограниченный native smoke

Следующие действия предназначены только для выбранного тестового стенда.
Перед запуском должны пройти HTTP/authentication smoke; нужен эксклюзивный доступ.
`DOTNETLIBS-PATH` должен включать `dotnetcore/shared` — в исследованной установке
он уже включён. Этот пример не меняет xHttp.ini и не регистрирует компонент.

```sh
docker exec "$WSHCM_PROBE_CONTAINER" mkdir -p /WebsoftServer/dotnetcore/shared
docker cp packages/dotnet/probes/PlainProbe/bin/Release/net9.0/BorisType.PlainProbe.dll "$WSHCM_PROBE_CONTAINER:/WebsoftServer/dotnetcore/shared/BorisType.PlainProbe.dll"
docker cp packages/dotnet/probes/DatexProbe/bin/Release/net9.0/BorisType.DatexProbe.dll "$WSHCM_PROBE_CONTAINER:/WebsoftServer/dotnetcore/shared/BorisType.DatexProbe.dll"
pnpm --filter @boristype/ws-client build
export WSHCM_PROBE_CONTAINER
# Передать WSHCM_USER и WSHCM_PASSWORD через environment своего тестового стенда.
NODE_USE_ENV_PROXY=0 node packages/dotnet/probes/run.mjs
```

Runner читает `bridge.bs` без изменений, печатает image ID, SHA256 кода и DLL,
проверяет SOAP arithmetic smoke и один последовательный вызов BS. Проверки Node
сравнивают значения и типы, декодируют JSON независимо от платформы. После запуска
обязательны успешный `Evaluator.close()` и независимое сравнение evaluator files
через Docker. При ошибке нет автоматического retry. HTTP timeout не отменяет
работу на сервере; перед следующим запуском проверить состояние и cleanup.

Ожидаются `result: "OK"`, `checks: 19`, `evaluatorCleanup: true` и
`independentCleanup: true`. Runtime/version берутся из реально исполняемой DLL.
Проверки Windows или других версий HCM этим результатом не заявляются.

Фактически работающая форма вызова:

```js
var assembly = tools.dotnet_host.Object.GetAssembly("BorisType.PlainProbe.dll");
return assembly.CallClassStaticMethod("BorisType.Probes.PlainBridge", "Ping", []);
```

У результата `GetAssembly` в этом пути метод вызывается **без `.Object`**.
Возвращаемое значение для произвольного текста оборачивается в BS `EncodeJson`
перед SOAP: [почему нужен JSON carrier](../../../plans/mcp-server/04-local-e2e.md).

## Известное падение: обратный вызов EncodeJson

`DatexBridge.EncodeViaPlatform(value, DatexGlobal context)` успешно компилируется,
но на исследованном C-runtime вызов `context.EncodeJson(value)` завершал весь
HCM с **exit 139**, OOM false. Получение контекста отдельно работает. Причина
не установлена; запрещать по этому результату все Datex API или другие carriers
оснований нет.

Метод оставлен для исследования. `unsafe-platform-encode.bs` сохраняет вызов и
payload первого сбоя как отдельный кандидат для изоляции; сам файл отдельно не
запускался. Он **не входит в run.mjs**. Два исходных failing sequence описаны
в отчёте. Обычный smoke использует .NET JSON serialization и не вызывает этот метод.

## Очистка

Runner удаляет свой evaluator, но не DLL. После серии удалить только свои файлы
и остановить стенд, если он запускался для этого эксперимента:

```sh
docker exec "$WSHCM_PROBE_CONTAINER" rm -- /WebsoftServer/dotnetcore/shared/BorisType.PlainProbe.dll /WebsoftServer/dotnetcore/shared/BorisType.DatexProbe.dll
```

Managed-сборка может оставаться загруженной до завершения процесса. Обновление
уже загруженной DLL, unload/hot reload и долговременное использование не проверены.

Источники: [подключение Datex.Global](https://wshcm-docs.boristype.dev/news/platform/7117698192299190042.html),
[вызов C# библиотек](https://wshcm-docs.boristype.dev/news/platform/7181083125928132263.html).
