# .NET библиотеки

`packages/dotnet` объединяет самостоятельные C# библиотеки BorisType. Каждая
имеет собственный `.csproj`, DLL и версию. Первая — `BorisType.FileSystem`,
с metadata, file IO/edit и ограниченным поиском имён/UTF-8 содержимого.
Все шесть MCP tools используют DLL через BS URL resolver. Для текущего MCP
требуется версия DLL 0.1.0-alpha.3 / API 1.

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
с `id`, `version`, `apiVersion` и `capabilities`. Capabilities `search`, `files`, `edit` обозначают доступные API.
Сборка не требует Datex.Global и не выполняет обратные вызовы в ядро BS.
Установка архива на HCM и проверка совместимости его runtime — отдельные действия;
успешные unit/pack tests выполняются вне HCM.

Команды ручной установки, native probes и правила vendor references приведены
в [README workspace](https://github.com/BorisType/BorisType/blob/main/packages/dotnet/README.md).

Поиск доступен через `BorisType.FileSystem.Search.FindJson(physicalRoot, requestJson)`.
BS вызывает `UrlToFilePath`, затем передаёт физический путь в DLL без Datex callbacks.
Поддержаны glob filters, literal или line regex, исключение поддеревьев и явные
лимиты работы/ответа. Partial results обозначаются limitReason и skipped counters.
Подробный контракт и установка — в README workspace. Помимо managed и MCP/VM
проверок поиск прошёл native e2e на Linux HCM 2025.2.1333 / CLR 9.0.11 через
CLI/stdio/SOAP/BS/DLL с проверкой cleanup. Windows и другие версии HCM требуют
отдельной acceptance.

`BorisType.FileSystem.Files` предоставляет ReadJson/WriteJson/ListJson/DeleteJson/
EditJson через `(physicalPath, requestJson) -> JSON string`. Text IO — strict
UTF-8, до 1 MiB; write добавляет BOM, edit сохраняет его. Exact edits проверяются
последовательно в памяти, поддержаны preview и expectedSha256. Отсутствующее
или неоднозначное oldText не вызывает частичных правок. Write/edit заменяют
файл через temp sibling; external race после финальной hash/byte проверки остаётся
возможной. Все file tools прошли ограниченный native e2e на том же Linux HCM.
Контракт, ограничения rename/ACL и команды — в README workspace.
