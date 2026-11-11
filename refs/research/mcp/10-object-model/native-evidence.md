> Датированное техническое evidence; текущие основания — [тематическая запись](../../../platform/object-model.md).
> Linux legacy observations и проверка saved transcripts не аттестуют current head. Unknown method на этом стенде не означает отсутствие API универсально.

# Native evidence: XMD, XML values и CRUD

Эта заметка фиксирует серию 2026-11-08. Дополнительные проверки 2026-11-10
(раскрытая форма в XML, импорт, полная замена и тихая потеря входных данных)
описаны отдельно в [xml-mvp.md](xml-mvp.md), с отдельными probes и manifest.

Дата: 2026-11-08. Среда: Linux x64, `websoft/hcm:2025.2.1333`, assembly
`2.25.12.4 [202512041524]`, .NET 9.0.11, PostgreSQL 16. Carrier:
authenticated SOAP → временная библиотека evaluator → серверный C-runtime.
Пользователь изолированного demo-стенда: `user1`. Низкопривилегированный доступ
не проверялся. Версии и hashes — в [manifest](evidence-manifest.json).

## Метод и воспроизводимость

Три пробы расположены в [probes/](probes):

1. `01-reflection.bs`: только чтение формы и создание документа в памяти.
2. `02-values-and-hooks.bs`: собственные динамические формы и временный XML-файл
   `x-local://wt/boristype_object_probe_20261108.xml`, без `BindToDb`.
3. `03-owned-crud.bs`: один новый собственный `cost_center` за запуск,
   с уникальным code, без binary. Его ID выделяет сама платформа; существующий
   ID на вход не принимается. Все удаления ограничены этим ID и его trash URL.

Файлы передавались без трансформации, `sha256 == evaluatedSha256`.
Evaluator cleanup подтверждён после каждого запуска, включая ошибки подготовки
проб. Перед основной серией выполнены HTTP 200, authentication и
`install-smoke.bs → OK: net9-smoke`.

Сырые транскрипты и извлечённые vendor файлы находятся вне git:
`/home/agent/workspace/wshcm-stand-net9/research/object-model-20261108/`.
В [observed/](observed) сохранены переносимые производные транскрипты:
убраны XML vendor-схем, error stacks сокращены до первой строки, пути probe
нормализованы и elapsed time опущен. Значения, carrier, source hashes и cleanup
сохранены. Hash исходного и производного транскрипта записаны в manifest.
Сохранены также отдельный readonly `postcheck.bs` и его ответ: это проверка
конкретных двух ID предыдущих запусков, а не универсальный cleanup script.
Команда проверки этих сохранённых ответов, не обращающаяся к серверу:

```sh
node refs/research/mcp/10-object-model/probes/verify-results.mjs \
  refs/research/mcp/10-object-model/observed
```

Результат: **`OK: 59/59 native observations`**. Verifier проверяет hashes
текущих исходников, carrier, отсутствие fatal, evaluator cleanup и конкретные
наблюдения, включая отрицательные случаи. Это число assertions в трёх пробах,
а не 59 независимых платформенных сценариев или production acceptance tools.
При проверке каталога `observed/` verifier дополнительно сверяет hashes
производных транскриптов по manifest и независимый cleanup receipt для обоих ID.
Два отдельных отрицательных контроля verifier также прошли: он отверг
подменённое наблюдение lost update и несовпадающий source hash. Это проверка
качества фиксации evidence, не ещё два запуска на HCM.

Для повторного native-запуска подходит установленный локальный runner
`wshcm-probes`; он не является зависимостью пакета или общедоступной частью
репозитория. Нужен уже установленный локальный стенд и его текущий container IP.
Пробы 02/03 изменяют собственные данные: не использовать на production.
Пробы не требуют .NET DLL BorisType.FileSystem.

## Reflection и поколение API

| Проверка                                           | Фактический результат                                               |
| -------------------------------------------------- | ------------------------------------------------------------------- |
| `FetchForm(fullUrl)`                               | Возвращает форму, доступны `TopElem`, `Url`, `Xml`                  |
| Object / catalog root                              | `cost_center` / `cost_centers`                                      |
| `catalog.IsHier`                                   | `true`                                                              |
| `Form.TopElem.Child('parent_id').ForeignArrayExpr` | `cost_centers`                                                      |
| `is_active` metadata                               | bool, `IsNotNull=true`, `DefaultValue='true'`                       |
| `OpenNewDoc`                                       | URL пуст, `NeverSaved=true`, `HasWriteAccess=true`, ID без значения |
| Default объекта                                    | `is_active=true`, в XML присутствует `<is_active>1</is_active>`     |
| Пустой string                                      | `Value=''`, `HasValue=false`                                        |
| Пустой integer                                     | `Value=null`, `HasValue=false`                                      |
| `.Value` у составного элемента                     | `Unknown object property: Value`                                    |
| `DefaultDb.UseObjectTypes` / ObjectForms           | `false` / 0                                                         |
| `GetObjectFormUrl('cost_center')`                  | Ошибка                                                              |
| `GetOptObjectForm(...)`                            | `Unknown method`                                                    |
| `FindOptCatalog('cost_centers').Form.Url`          | `x-local://wtv/wtv_cost_centers.xmd`                                |
| `.FormUrl` у того же catalog object                | `Unknown object property`                                           |
| `common.exchange_object_types`                     | 414 элементов; полнота списка не доказана                           |
| legacy `tools.get_object_form_url`                 | Для cost_center вернул ожидаемые XMD object/catalog                 |

`OBJECT-NAME` в исходнике принадлежит `SPXML-FORM`, а не корневому тегу
`cost_centers`. Попытка прочитать этот атрибут у `Form.TopElem` не дала значение.
Нужно разбирать различие контейнера формы и элемента данных.

## Типы, значения и структуры

Собственная схема содержит `required string NOT-NULL=1`, integer n,
`defaulted integer DEFAULT=7`, bool `NULL-FALSE=1 DEFAULT=false`, TEMP scratch,
вычисляемое derived `n+1` и составной массив с ключом key.

| Действие                                           | Наблюдение                                                |
| -------------------------------------------------- | --------------------------------------------------------- |
| Новый документ                                     | `OnCreate` добавил `C` в trace                            |
| Пустой required string → Save                      | Файл успешно записан; поле осталось `HasValue=false`      |
| `n = '42'`                                         | `Value=42`, derived=43                                    |
| `n = 'not-an-integer'`                             | Ошибка `Invalid format`                                   |
| Два `AddChild` с key=`a`                           | 2 элемента, оба записаны в файл                           |
| TEMP scratch                                       | В памяти был заполнен, в файле и после reload отсутствует |
| `defaulted.Clear()`                                | `HasValue=false`, `Value=null`                            |
| Save после Clear, затем OpenDoc                    | defaulted снова 7 с `HasValue=true`                       |
| Открытие XML с неизвестным тегом по заданной форме | Неизвестный тег отсутствует в результате                  |
| `LoadData` с единственным полем n                  | Изменил n, сохранил required/rows/trace                   |
| `SetXml`                                           | `Unknown method`                                          |

Это наблюдения выбранных конструкций. Они не доказывают все преобразования
bool/date/real/variant, required checks provider-а или поведение всех массивов.
Например, добавление существующего ключа через `ObtainChildByKey` и `AddChild`
— разные операции; здесь проверялось второе.

## Порядок Save и ошибки после записи

Собственная форма содержит `OnCreate → C`, `OnBeforeSave → B`, `OnSave → S`.
Первое сохранение:

```text
до Save:          memory.trace = C
после Save:       memory.trace = CBS
фактический файл: trace = CB
после OpenDoc:    trace = CB
```

Следовательно, `OnSave` выполняется после записи. Изменение данных самим
OnSave автоматически в эту же запись не попало. `LastSavedData.Xml`, прочитанный
после сохранения, содержал уже `CBS`; это свойство нельзя без отдельного
исследования считать неизменяемым снимком байтов на диске или CAS revision.

`RunActionOnBeforeSave=true`, `RunActionOnSave=true`, `WriteDocInfo=true` по
умолчанию. После отключения двух callback flags добавления B/S не происходили.
Свойства `WriteFt` и `IsSeparated` из declarations недоступны.

Два отрицательных случая:

- При n=-77 `OnBeforeSave` бросает `owned-before-save-rejection`. Save возвращает
  ошибку, файл совпадает с предыдущим содержимым.
- При n=-78 `OnSave` бросает `owned-after-save-error`. Save возвращает ошибку,
  **файл уже содержит новую запись**: trace=`CBSB` и новое n. После reload
  n=-78. Его XML-число при этом записано как `18446744073709551538`.

Это демонстрирует post-write failure для файлового XML API. Atomicity связки
полный документ БД + несколько каталогов + hooks + внешние интеграции на этих
пробах не проверялась. Из первого отрицательного случая также нельзя выводить
rollback побочных действий, выполненных hook до исключения.

## Сокращённая форма и потеря данных

После сохранения файла с rows/trace он открыт через альтернативную XMD с
единственным полем n. `ChildExists('rows')=false`. Сохранение этой копии записало:

```xml
<probe SPXML-FORM="...short_probe_....xmd">
    <n>6</n>
</probe>
```

Повторное открытие по полной форме: rows=0, trace пуст. Сокращённое чтение
не является безопасной заготовкой для записи части полей полного документа.
То же относится к schema drift; поведение отдельного типа с custom loader
должно проверяться отдельно.

## Настоящий объект БД: lifecycle и проекция

Проверен простой `cost_center`, чья XMD не содержит собственных save hooks.
Присутствует стандартная `doc_info`; каталог имеет `OnBuild`. Это ограничивает
объём business effects по сравнению с сотрудником/мероприятием.

1. `OpenNewDoc` создаёт несохранённый документ без ID/URL.
2. `BindToDb(DefaultDb)` присваивает совпадающие DocID/TopElem.id и URL вида
   `x-local://wt_data/objects/...xml`. `NeverSaved=true`, строки каталога ещё нет.
3. Заполнены code/name/comment и `parent_id=9007199254740993`, которого в БД нет.
4. `Save()` успешно создаёт объект и одну строку cost_centers.
5. Полное повторное открытие возвращает comment и точный parent ID.
   Каталог содержит name, но не comment. `OptForeignElem=undefined`.
6. `doc_info.creation/modification.date` заполнены, modification.user_login=`user1`.

ID возвращались строками. Входной reference преобразован в BS integer на
сервере; JS Number в цепочке проверки не использовался.

## Две копии: воспроизведён lost update

```text
A = OpenDoc(url), B = OpenDoc(url)
A.name = 'writer-A'; A.Save()
B.comment = 'writer-B'; B.Save()   // успех
OpenDoc(url): старое name + новый comment
```

Save B не обнаружил устаревшую копию и затёр name из A. Проверка выполнена
последовательно, без scheduler-race: достаточно открыть две копии до первого
save. Это доказывает отсутствие автоматического conflict detection **на этом
пути вызова**. Не доказывает отсутствия иных lock/version API в платформе.

## Корзина, восстановление, окончательное удаление

| Операция                | Основной каталог | trash_docs | Документ                                                       |
| ----------------------- | ---------------- | ---------- | -------------------------------------------------------------- |
| После Save              | 1                | 0          | Доступен                                                       |
| `DeleteDoc(url, false)` | 0                | 1          | По прежнему URL ошибка, по `UrlFromDocID(id,'trash')` читается |
| `tools.restore_doc(id)` | 1                | 0          | Возвращён с тем же ID                                          |
| `DeleteDoc(url, true)`  | 0                | 0          | OpenDoc → Object not found                                     |

Поставляемый `wtv_tools.xml:22998` реализует `restore_doc` через `MoveDoc` из
trash в DefaultDb. Это жизненный цикл с повторным сохранением, а не обещание
восстановления всех внешних эффектов/связанных документов.

Binary cleanup не выполнялся: fixture не содержит файлов. Для resource
[документация удаления](https://wshcm-docs.boristype.dev/news/monolith/7074139960547835866.html)
и исходники XMS показывают отдельный путь удаления binary; generic DeleteDoc
нельзя объявлять его эквивалентом.

## Очистка, диагностические ошибки и пределы

За время разработки пробы CRUD создали и удалили два собственных объекта:
`7348878536800680991`, `7348879056500055424`. Независимый последующий evaluator
подтвердил для обоих: catalog rows=0, trash rows=0, OpenDoc не открывается.
Проверка Docker filesystem после закрытия evaluator не нашла своих XML fixtures
или `unsafe_eval_*` в `/WebsoftServer/wt`.

Выявленные ошибки подготовки не скрываются за итоговым PASS:

- Повторное `var fe` внутри цикла вызвало `Variable already declared`;
  объявления вынесены наружу.
- `.Value` составного элемента и неподдерживаемые APIs вынесены в отдельные
  captured errors. Данные итогового запуска не обрываются на этих проверках.
- Raw BS `try/finally` без catch отвергнут синтаксически. Вариант с rethrow не
  обеспечил ожидаемую очистку в этой серии; причина отдельно не локализована.
  Итоговая проба использует catch-result и последовательный cleanup после него.
- `DropFormsCache` залогировал `function is obsolete`; удаление динамической
  формы из кэша не подтверждено. Формы имеют собственные уникальные URL;
  завершение процесса стенда освобождает его memory cache. Проба не обещает
  очистить такой cache на продолжающем работать сервере.
- Проверка `FilePathExists(x-local URL)` дала false при существующем физическом
  файле. Независимая проверка обнаружила остаток, файл удалён через `DeleteUrl`.
  Итоговая проба проверяет `FilePathExists(UrlToFilePath(url))`; эта проверка
  относится к выбранному физическому fixture, а не ко всем URL/SQL blobs.

Контейнеры были остановлены до исследования и возвращены в stopped состояние:
WT exit 143, PostgreSQL exit 0, `OOMKilled=false` у обоих. Установка/конфигурация
сервера и vendor source не менялись. Динамическая регистрация форм прекращена
вместе с процессом.

Не проверены: cluster cache, Windows/MSSQL, new object model, транзакции
provider-а, полномочия обычного пользователя, schema migration, реальная
стоимость больших объектов, notifications/integrations и resource binary cleanup.
