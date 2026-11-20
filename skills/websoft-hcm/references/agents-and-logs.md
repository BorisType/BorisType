# Журналы серверных агентов и auth-events

Проверено на серверном Linux HCM 2025.2.1333, C-runtime. Журналы были
физическими файлами WT. Каталог журналов и дату файла сверяй на своей
установке.

## Отметка завершения

На тестовом WT включи отдельную категорию и запиши метку после успешного
завершения нужной операции. Передай уникальный `runId` в агент и используй его
также в проверке артефакта.

```js
EnableLog("skills_demo", true);
LogEvent("skills_demo", "completed run=" + runId);
```

На стенде появился `skills_demo_YYYY-MM-DD.log` с одной строкой для run ID.
Запись может появиться после возврата `LogEvent`. Дай журналу время
записаться, проверь соответствующую метку и фактический результат работы.
После пробы выключи свою категорию через `EnableLog('skills_demo', false)`.
[LogEvent](https://wshcm-docs.boristype.dev/news/monolith/6746897785342738464.html#logevent)

## Чтение auth-events

Дата берётся из имени `auth-events_YYYY-MM-DD.log`. В проверенных файлах
после времени и диагностического префикса в квадратных скобках идут поля
через TAB. Префикс может быть составным. Для счётчика успешных входов
выбирай точное событие `login` и нужный контекст `WEB` или `LDS`.
`logout` и `login_brute_password` обозначают другие события. В этой
поставке событие `login WEB` записывалось из `wtv_tools_web.xml` после
успешной инициализации пользователя сессии. События и уникальные
пользователи дают разные метрики. Отдельно учитывай дни с отсутствующим
файлом и дни с нулём подходящих записей.

Разбирай по одному файлу по физическому пути `logPath`. Пример рассчитан
на строки с одним блоком диагностики в квадратных скобках.

```js
var stream = new FileStream(logPath);
var counts = { web: 0, lds: 0 };
var line;
var prefixStart;
var prefixEnd;
var fields;
for (line = stream.ReadLine(); line != undefined; line = stream.ReadLine()) {
  prefixStart = line.indexOf("[");
  prefixEnd = line.indexOf("]");
  if (prefixStart < 0 || prefixEnd <= prefixStart) continue;
  fields = Trim(line.slice(prefixEnd + 1)).split("\t");
  if (ArrayCount(fields) < 3 || fields[0] != "login" || fields[2] == "") continue;
  if (fields[1] == "WEB") counts.web++;
  if (fields[1] == "LDS") counts.lds++;
}
return counts;
```

Проверка с синтетическими строками `00:00:00 [7f:12345678] login<TAB>WEB<TAB>demo`
и `login<TAB>LDS<TAB>demo` после такого же префикса дала по одному событию.
Пустая строка, logout и перебор пароля были пропущены. `ReadLine()` вернул
`undefined` на EOF и `''` на пустой строке. Первая строка могла содержать
UTF-8 BOM с первыми кодами 239, 187, 191. Если разбираешь время с начала
строки, учти также представление BOM как U+FEFF в других средах. `Close()`
у этого `FileStream` вызвал `Unknown method`.
[FileStream](https://wshcm-docs.boristype.dev/datex/common/5665465792879477156.html#filestream) ·
[Методы Stream](https://wshcm-docs.boristype.dev/datex/common/5620276905286592558.html#stream)
