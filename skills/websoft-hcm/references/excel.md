# Чтение, создание и правка XLSX

Примеры проверены на Linux x64 HCM 2025.2.1333, серверном C-runtime, .NET 9,
со штатными Websoft.Office.Excel и Aspose.Cells. Выбор API зависит от того,
нужны ли строки таблицы, новый отчёт или изменение существующей книги.

## Импорт строк

`tools.open_excel(url).worksheet` даёт строки с ячейками в виде строковых
значений. В поставляемом `wtv_tools.xml` ширина определялась последней
непустой ячейкой первой строки, а чтение прекращалось на первой полностью
пустой строке внутри этой ширины. Если ширина задана схемой импорта,
читай нужные ячейки напрямую, например
`book.Worksheets.get_Item(0).Cells.get_Item('B2').Value`. Открытие книги
через Stream показано ниже.

Для проверки положи `Code` и `Score` в A1:B1, текст `00042` и число
`0` в A2:B2, оставь строку 3 пустой и заполни A4. На стенде первые две
строки прочитались, включая заголовки, а `00042` и `0` пришли строками.
Когда B1 очистили, ячейка B2 перестала попадать в выдачу.

В этой поставке `open_excel` предпочитает существующий физический файл.
При его отсутствии может материализовать логический URL в файл. Для БД
с URL hook сначала выясни, какой источник использует приложение.
[open_excel](https://wshcm-docs.boristype.dev/news/monolith/7042022616553977707.html#open-excel) ·
[URL и blobs](url-storage-and-blobs.md)

## Новый отчёт

На отдельном пути для результата:

```js
var excel = tools.get_object_assembly("Excel");
excel.CreateWorkBook();
var sheet = excel.GetWorksheet(0);
sheet.Cells.GetCell("A1").Value = "Баллы";
sheet.Cells.GetCell("A2").Value = Int(0);
excel.SaveAs(UrlToFilePath(outputUrl));
```

Для контролируемой типизации через Aspose.Cells используй
`cell.PutValue('00042', false)` и `cell.PutValue('=1+1', false)` как
строковые вызовы. Числовой `cell.PutValue(0)` сохраняет число.
В пробе первые два значения сохранились как текст, третье как число.

## Вставка колонки в копию

На проверенной поставке операцию выполнил Aspose.Cells. Подготовь физический
исходный файл и отдельный физический файл результата. Сначала инициализируй штатный
компонент Excel. Используй `File.OpenRead` и точный конструктор
`Workbook(Stream)`, чтобы передать в него настоящий .NET Stream.

```js
tools.get_object_assembly("Excel");
var host = tools.dotnet_host.Object;
var core = host.GetAssembly("System.Private.CoreLib.dll");
var excel = host.GetAssembly("Aspose.Cells.dll");
var streamType = core.CallClassStaticMethod("System.Type", "GetType", ["System.IO.Stream"]);
var empty = excel.CreateClassObject("Aspose.Cells.Workbook");
var streamCtor = empty.GetType().GetConstructor([streamType]);
empty.Dispose();

var input = core.CallClassStaticMethod("System.IO.File", "OpenRead", [UrlToFilePath(sourceUrl)]);
var book = streamCtor.Invoke([input]);
book.Worksheets.get_Item(0).Cells.InsertColumns(1, 1, true);
book.Save(UrlToFilePath(outputUrl));
book.Dispose();
input.Dispose();
```

Индекс `1` вставляет колонку B. Для рабочего кода освобождай книгу и
поток также при ошибке. После записи проверь хеш исходника и открой ZIP/XML
новой книги. В пробе формула `=B2*2` из C2 стала `=C2*2` в D2, а ссылка
со второго листа `=Sheet1!B2` стала `=Sheet1!C2`. Для шаблонов с оформлением
добавь в проверку используемые стили и объединения.
[Правила вызова .NET](managed-calls.md) ·
[Aspose.Cells InsertColumns](https://reference.aspose.com/cells/net/aspose.cells/cells/insertcolumns/)
