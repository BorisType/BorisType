# .NET библиотеки

`packages/dotnet` объединяет самостоятельные C# библиотеки BorisType. Каждая
имеет собственный `.csproj`, DLL и версию. Первая — `BorisType.FileSystem`,
с metadata API для идентификации установленной библиотеки. Поиска и файловых
операций в ней пока нет; четыре существующих MCP tools работают прежним способом.

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
с `id`, `version`, `apiVersion` и `capabilities`. Сейчас capabilities пусты.
Сборка не требует Datex.Global и не выполняет обратные вызовы в ядро BS.
Установка архива на HCM и проверка совместимости его runtime — отдельные действия;
успешные unit/pack tests выполняются вне HCM.

Команды ручной установки, native probes и правила vendor references приведены
в [README workspace](https://github.com/BorisType/BorisType/blob/main/packages/dotnet/README.md).
