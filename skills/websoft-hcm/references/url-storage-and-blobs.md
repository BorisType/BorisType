# Логический URL, диск и spxml_blobs

## Главное различие

`LoadUrlData(url)` и `LoadFileData(UrlToFilePath(url))` могут читать **разные
данные**. Получение строки физического пути не устанавливает, какое хранилище
использует URL API. Особенно это существенно для `x-local` с SQL storage hook.

Ниже — наблюдения **Linux x64 HCM 2025.2.1333, C-runtime / eval во временной
библиотеке, CLR 9.0.11, PostgreSQL**, полученные 2026-11-06. Другие версии,
Windows, JS runtime и многонодный кластер этими пробами не проверены.

## Конфигурация проверенного сервера

В `xHttp.ini` прочитаны:

```text
DESIGN-DB: wt
DATA-DB: share
DATA-DB: wt_data
DB-STORE-HOOK: wt_data x-local://platform/storage/spxml/sx_store_sql.xml
```

Для `share` SQL hook отсутствовал. В PostgreSQL таблица называлась
`dbo."(spxml_blobs)"`, с полями `url` и `data` типа `bytea`.
Форма имени таблицы зависит от СУБД; не копировать MSSQL-синтаксис в PostgreSQL.

`DATA-DB` само по себе **не означает запись в SQL blobs**: в этой конфигурации
`PutUrlData` для `share` изменил файл на диске, а для `wt_data` — blob в БД.
Проверена конфигурация с hook; отдельное отключение hook не исследовалось.

Документированное назначение `DESIGN-DB`, `DATA-DB`, `DEFAULT-DATABASE` и
клиентского `SHARED-DATABASE` — в [справочнике путей](paths-and-configuration.md#конфигурация-что-прочитано-и-что-не-проверено).
Их нельзя сводить к универсальной паре «разрешить путь / хранить в SQL».

## Прямое сравнение источников

Для собственного файла `x-local://wt_data/__bt_storage_0yggwahs.txt` на диске
лежал ASCII-маркер `DISK:wt_data:0yggwahs`. Затем:

```javascript
PutUrlData("x-local://wt_data/__bt_storage_0yggwahs.txt", "URL:wt_data:0yggwahs");
```

Независимый SQL SELECT нашёл blob с `URL:wt_data:0yggwahs`; независимое чтение
файла из контейнера сохранило `DISK:wt_data:0yggwahs`.

| Операция                                                                 | Наблюдаемый результат            |
| ------------------------------------------------------------------------ | -------------------------------- |
| `LoadUrlData("x-local://wt_data/__bt_storage_0yggwahs.txt")`             | `URL:wt_data:0yggwahs` из SQL.   |
| `LoadFileData(UrlToFilePath(...))` для того же x-local                   | `DISK:wt_data:0yggwahs` с диска. |
| `LoadUrlData("x-app://wt_data/__bt_storage_0yggwahs.txt")`               | Дисковый маркер.                 |
| `LoadUrlData("file:///WebsoftServer/wt_data/__bt_storage_0yggwahs.txt")` | Дисковый маркер.                 |

Все три URL преобразовывались в один физический путь. После изменения
дискового маркера на `DISK2:wt_data:0yggwahs` `x-local` продолжал возвращать
SQL-маркер, остальные способы — новый дисковый. После удаления физического
файла `x-local` по-прежнему читал blob, остальные способы дали «Файл не найден».

Следовательно, сравнение `UrlToFilePath` для двух URL не доказывает идентичность
их логических ресурсов. Изменение диска может не изменить результат URL-чтения.

## Чтение может импортировать файл в БД

На отдельном новом имени `__bt_hydrate_0yggwahs.txt` перед каждой операцией
проверялось состояние точной записи SQL. На диске был маркер `HYDRATE:0yggwahs`,
первоначально записи в `spxml_blobs` не было.

| Операция                     | Возвращённые данные | Blob после операции              |
| ---------------------------- | ------------------- | -------------------------------- |
| `LoadFileData(physicalPath)` | `HYDRATE:0yggwahs`  | Отсутствует.                     |
| `LoadUrlData(x-app URL)`     | Тот же маркер.      | Отсутствует.                     |
| `LoadUrlData(file URL)`      | Тот же маркер.      | Отсутствует.                     |
| `LoadUrlData(x-local URL)`   | Тот же маркер.      | **Создан**, с тем же содержимым. |

Таким образом, на проверенном SQL-backed корне отсутствие blob не обеспечивает
чтение без изменения БД. Наблюдаемое поведение включает импорт локального файла
в SQL; после этого приоритет имеет blob. Проверки выполнялись отдельными
evaluator-вызовами с SQL SELECT между ними.

`DeleteUrl(x-local URL)` удалил blob, но физический файл остался. В другой
проверке после удаления blob и наличия дискового файла очередное URL-чтение
снова создало blob из дисковых данных. Очистка логического ресурса и очистка
дискового файла здесь требуют отдельных проверок.

## Исходники и независимый контроль

В skill включены оригинальные тела BS eval, без адаптации source:

Обе пробы вызывают URL-чтение и могут импортировать файл в SQL. Запускай их
только на собственных подготовленных fixtures с независимым контролем БД.

- [storage-read-routes.bs](../probes/storage-read-routes.bs) — три корня × три
  схемы, сравнение URL и physical read. При `pathError` не интерпретируй поле
  `fileData`: переменная path в исходной пробе переиспользуется между строками.
  На проверенном сервере все девять преобразований были успешны.
- [storage-import-read.bs](../probes/storage-import-read.bs) — один
  `LoadUrlData(x-local)` для hydration fixture. **Этот вызов может писать в БД**;
  выполнять его только после подготовки своего имени и контрольных SQL SELECT.

Оба файла заканчиваются верхнеуровневым `return` и рассчитаны на eval-carrier.
Пути и nonce в них относятся к описанному эксперименту. Для нового запуска
замени nonce на уникальный в исходнике, fixtures и SQL; зафиксируй адаптацию.
Файлы сами не создают fixtures и не выполняют очистку.

Точные отдельные чтения до import-вызова на нашей hydration fixture:

```javascript
LoadFileData("/WebsoftServer/wt_data/__bt_hydrate_0yggwahs.txt");
LoadUrlData("x-app://wt_data/__bt_hydrate_0yggwahs.txt");
LoadUrlData("file:///WebsoftServer/wt_data/__bt_hydrate_0yggwahs.txt");
```

Контроль **между каждым hydration-вызовом** выполнялся напрямую через
PostgreSQL по точному URL; запрос с понятными именами колонок:

```sql
SELECT url, octet_length(data) AS bytes, encode(data, 'escape') AS marker
FROM dbo."(spxml_blobs)"
WHERE url = 'x-local://wt_data/__bt_hydrate_0yggwahs.txt';
```

Для основной routing fixture SQL проверял её точный URL
`x-local://wt_data/__bt_storage_0yggwahs.txt` вместе с контрольными `wt`/`share`.

На новом hydration URL первые три чтения дали 0 rows; после import-вызова:
`x-local://wt_data/__bt_hydrate_0yggwahs.txt | 16 | HYDRATE:0yggwahs`.
После `DeleteUrl("x-local://wt_data/__bt_hydrate_0yggwahs.txt")` — 0 rows,
а независимое физическое чтение всё ещё вернуло `HYDRATE:0yggwahs`.

В конце эксперимента физические fixtures удалены отдельно. Прямой SQL count
по шести точным fixture URL дал 0; filesystem check не нашёл файлов/каталогов
с nonce или временных evaluator-файлов. Все 22 carrier cleanup подтверждены,
в том числе для отрицательных конфигурационных probes. Исходные host template
и активный ini восстановлены побайтово; оба контейнера снова остановлены.

## Как проверять другую установку

1. Установи ОС, версию, runtime, carrier, действующую конфигурацию корня и
   storage hook. Для VFS изучи также её mapping и backend.
2. Выбери уникальное имя в отдельном тестовом пространстве. Подтверди отсутствие
   и файла, и записи URL в БД до создания fixture; сохраняй только свои маркеры.
3. Сравни диск и URL API на случаях «только файл», «только blob», «оба с разными
   маркерами», «оба отсутствуют». SQL проверяй по точному URL между операциями.
4. Для проверки побочных эффектов чтения используй новое имя и сначала выполняй
   физическое/file/x-app чтение, затем x-local. Проверяй SQL после каждого вызова.
5. После удаления проверь оба backend. Не проверяй очистку через `LoadUrlData`
   на оставшемся дисковом файле: такое чтение само может импортировать blob.
6. Очисти только свои точные URL и файлы; независимо проверь отсутствие SQL rows,
   физических fixtures и временного кода. Восстанови изменённую конфигурацию.

Семантику своей интеграции задавай явно: физический файл, платформенный URL или
объект/ресурс БД. Для прямого filesystem API нельзя обещать поведение URL API
только потому, что вход удалось преобразовать в путь.

## Документация и границы

- [Архитектура SPXML → SQL](https://wshcm-docs.boristype.dev/news/platform/7119439504986790928.html)
  описывает storage provider с LoadUrl/PutUrl/DeleteUrl и таблицу blobs для
  неструктурированных данных. Документация упоминает MSSQL и PostgreSQL.
- [LoadUrlData](https://wshcm-docs.boristype.dev/news/platform/7160845440290060345.html)
  описывает получение бинарной строки по URL. Пример `file:` не устанавливает
  маршрутизацию `x-local` или отсутствие побочных эффектов.
- [Настройка VFS](https://wshcm-docs.boristype.dev/news/monolith/6868365774940041241.html)
  описывает `DOTNETCORE-VFS`, mappings/endpoints, S3 и `uni:x-local://` как
  вспомогательное пространство ресурсов базы, содержащихся в `spxml_blobs`.
  Это конфигурационное обозначение VFS; его приём обычным URL resolver в наших
  пробах не проверялся. Включение VFS и S3 не тестировалось.
- [wshcmx/types, lib/core/index.d.ts](https://github.com/wshcmx/types/blob/a3b1e43d0b2add53bbc1f2acc2c5128360e8c97b/lib/core/index.d.ts#L2019),
  revision `a3b1e43d0b2add53bbc1f2acc2c5128360e8c97b`: `LoadFileData` — 2019,
  `DeleteUrl` — 2210, `LoadUrlData` — 2276, `PutUrlData` — 2284.
  Сигнатуры согласуются с вызовами probes; declarations не описывают эту
  маршрутизацию и не доказывают storage semantics.

Общая БД позволяет хранить ресурсы вне локального диска узла, что согласуется
с описанной архитектурой. Согласованность между нодами, кеши, транзакционность,
поведение при недоступной БД и иные storage providers не исследовались.
