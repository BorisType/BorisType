# Вызовы .NET из серверного BorisScript

Пример для уже доступных хосту сборок. Проверен на Linux x64 HCM 2025.2.1333,
C-runtime и .NET 9. Basename сработал для сборок из путей загрузки поставки.
Для другой сборки проверь совместимость с CLR, путь загрузки и публичную
сигнатуру метода.

```js
var host = tools.dotnet_host.Object;
var core = host.GetAssembly("System.Private.CoreLib.dll");
var name = core.CallClassStaticMethod("System.IO.Path", "GetRandomFileName", []);
var streamType = core.CallClassStaticMethod("System.Type", "GetType", ["System.IO.Stream"]);
var excel = host.GetAssembly("Aspose.Cells.dll");
var book = excel.CreateClassObject("Aspose.Cells.Workbook");
var bookType = book.GetType().FullName;
book.Dispose();

return { name: name, streamType: streamType.FullName, bookType: bookType };
```

Результат содержит случайное имя, `System.IO.Stream` и
`Aspose.Cells.Workbook`. `CallClassStaticMethod` принимает полное имя типа,
имя метода и массив аргументов. `CreateClassObject` здесь проверен для
конструктора без аргументов. Передача пути вторым аргументом оставила книгу
пустой. Для конструктора с параметрами получи точный `ConstructorInfo` и
проверь типы объектов, которые попадают в `.Invoke([...])`. В пробе
вызов перегруженного `Activator.CreateInstance` через этот мост завершился
ошибкой на одноимённом generic overload.

- Для параметра `double` передавай `Real(...)` и проверяй перегрузку. В
  `SetColumnWidth(0, 16)` мост попытался передать `Int64` в `Double`.
  `SetColumnWidth(0, Real(16))` выполнился.
- В проверенном вызове reflection строка BorisScript в аргументе
  `object[]` стала `System.Byte[]`. Для открытия XLSX используй
  типизированный `System.IO.File.OpenRead`. Его результат подошёл
  конструктору `Workbook(Stream)`. [Пример изменения книги](excel.md)

[DotNetAssembly](https://wshcm-docs.boristype.dev/datex/common/7172076235998782944.html)
