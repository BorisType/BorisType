# .NET библиотеки

`packages/dotnet` объединяет самостоятельные C# библиотеки BorisType. Каждая
имеет собственный `.csproj`, DLL и версию. Первая — `BorisType.FileSystem`,
с metadata API и ограниченным поиском имён/UTF-8 содержимого. MCP tool
`wshcm_search_files` использует DLL через BS resolver; четыре прежних tools
работают своими существующими реализациями.

Для сборки нужен SDK, указанный в корневом global.json: 9.0.320 с допустимыми
новыми patch той же feature band. Target framework первой DLL — net9.0.
SDK разработчика и CLR HCM — разные установки; сборка не обновляет сервер.

Из корня репозитория:

```sh
pnpm build:dotnet
pnpm test:dotnet
pnpm pack:dotnet
pnpm test:dotnet:pack
```

Dotnet-команды запускаются отдельно от default Turbo build, поэтому для сборки
Node-компонентов SDK не нужен. Итоговый installation ZIP находится в
`packages/dotnet/dist/`. В нём production DLL, зависимости publish output и
manifest версии/API с SHA256 файлов. SDK, CLR, tests, probes и vendor DLL
в архив не включаются.

Вызов `BorisType.FileSystem.LibraryInfo.GetMetadataJson()` возвращает JSON string
с `id`, `version`, `apiVersion` и `capabilities`. Capability `search` обозначает поисковый API.
Сборка не требует Datex.Global и не выполняет обратные вызовы в ядро BS.
Установка архива на HCM и проверка совместимости его runtime — отдельные действия;
успешные unit/pack tests выполняются вне HCM.

Команды ручной установки, native probes и правила vendor references приведены
в [README workspace](https://github.com/BorisType/BorisType/blob/main/packages/dotnet/README.md).

Поиск доступен через `BorisType.FileSystem.Search.FindJson(physicalRoot, requestJson)`.
BS вызывает `UrlToFilePath`, затем передаёт физический путь в DLL без Datex callbacks.
Поддержаны glob filters, literal или line regex, исключение поддеревьев и явные
лимиты работы/ответа. Partial results обозначаются limitReason и skipped counters.
Подробный контракт и установка — в README workspace. Новый поиск пока проверен
managed и MCP/VM тестами; native acceptance на HCM остаётся отдельным действием.
