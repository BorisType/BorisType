# URL resolver, физическая ФС и SQL blobs

Для выбора инструмента сначала установить, где приложение хранит ресурс.
`UrlToFilePath(URL)` возвращает physical mapping, а `LoadUrlData(URL)` может
выбирать SQL provider. Успешная файловая правка не доказывает изменения ресурса,
который приложение читает по тому же URL. Current MCP file tools работают с
physical bytes через System.IO; logical URL/blob backend пока не реализован.

## Почему URL нельзя нормализовать на клиенте

[Path probes 2026-11-06](../research/dotnet/14-path-schemes-research.md) проверяли
Linux HCM 2025.2.1333/CLR 9.0.11 через authenticated evaluator. Они не расширили
публичную file schema: она принимает x-local; x-app/file использовались в
ограниченном прямом resolver→DLL probe, не как уже поддержанные MCP inputs.

| Наблюдение этого carrier                                                                               | Следствие                                                                |
| ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| x-local проверяет allowlist первого компонента; x-app разрешал неизвестный компонент под WebsoftServer | Это разные правила доступа к адресам, не взаимозаменяемые aliases        |
| x-local/x-app сохраняли literal `%20`/`%23`; file декодировал их                                       | decodeURIComponent на Node изменит адрес                                 |
| `..` отвергался, `.` сохранялся, повторный `/` схлопывался                                             | Не переносить правила path ОС клиента                                    |
| query/fragment отбрасывались resolver; uppercase X-LOCAL не распознавался                              | MCP явно запрещает query/fragment; case folding меняет semantics         |
| file://localhost и file://remote давали `//host/...`                                                   | Не обещать equivalence локальному file:///; сетевой доступ не проверялся |
| absolute/relative OS path не принимался UrlToFilePath                                                  | Нужен отдельный contract вместо fallback к исходной строке               |
| server:// разбирался прикладным get_source_file; x-sys-image resolver отклонял                         | Строка со схемой в UI source не доказывает filesystem protocol           |
| UrlToOptFilePath возвращал undefined на mapping miss                                                   | Type declaration `string` недостаточна для полного контракта             |
| UrlOrFilePathToFilePath был not defined                                                                | Его declaration не доказывает доступность на этом runtime                |

Read grants относятся к точной строке URL: чтение одного alias не разрешает
редактировать другой. Объединение потребовало бы server-side file identity и
отдельного invalidation protocol. Hash в DLL остаётся обязательным.

## Конфигурация не равна доказанному registry algorithm

На исследованной установке xHttp.ini содержит DEFAULT-DATABASE, повторяемые
DESIGN-DB/DATA-DB и DB-STORE-HOOK. Это серверный config; SHARED-DATABASE из
admin documentation относится к иному контексту. Список разрешённых hosts не
совпал полностью со списками ini (`app`, `Logs` тоже принимались).

Добавление двух новых DESIGN-DB/DATA-DB roots **не** разрешило их evaluator.
Первый опыт не применил config из-за entrypoint copy template; затем активные
bytes проверены, повтор с LF опроверг гипотезу CRLF, hosts оставались rejected.
Причина/полный registry mechanism неизвестны. Нельзя превращать documented
назначение строк в рецепт «добавь параметр и root станет доступным».
Точный config/hash и отрицательные результаты — в [routing evidence](../research/dotnet/15-url-storage-routing-research.md).

## Наблюдавшийся routing и hydration

В исследовании PostgreSQL таблицы `dbo."(spxml_blobs)"`:

| Root/config                           | PutUrlData(x-local) | Независимый контроль         |
| ------------------------------------- | ------------------- | ---------------------------- |
| wt / DESIGN-DB без SQL hook           | менял диск          | SQL row отсутствовала        |
| share / DATA-DB без SQL hook          | менял диск          | SQL row отсутствовала        |
| wt_data / DATA-DB + sx_store_sql hook | менял blob          | диск сохранял прежний marker |

LoadUrlData(x-local) предпочитал blob при наличии дискового файла и продолжал
читать его после удаления файла. При отсутствии blob чтение импортировало
дисковый файл в SQL. Контроль на свежем имени с SQL SELECT между шагами:
LoadFileData → x-app → file не создавали row, затем x-local создал.
DeleteUrl(x-local) удалял blob, сохраняя файл; следующий read мог импортировать
файл снова. Поэтому cleanup через чтение сам может воссоздать остаток:
независимый SQL контроль нашёл DISK3 и привёл к отдельной hydration пробе.

DATA-DB сам по себе не означает SQL; share — прямой контрпример. Отдельное
включение/отключение hook не проверялось, полный provider algorithm не установлен.
Config/source/server version и carrier существенны. Windows/VFS/S3/cluster этим
опытом не покрыты. Физическая ФС, logical URL и object XML APIs — три отдельных
контракта, даже если resolver выдаёт одинаковый physical path.

## Источники и воспроизведение

[Path research](../research/dotnet/14-path-schemes-research.md) сохраняет 27+23+3
mapping inputs, managed alias-read probe, source hashes, image и cleanup.
[Storage research](../research/dotnet/15-url-storage-routing-research.md) сохраняет
22 carrier cleanups (не 22 successful assertions), SQL controls, template/active
ini восстановление с hash, отсутствие шести exact fixture URLs и stopped state.
Raw/vendor evidence остаётся вне git; hashes не заменяют отдельно предоставленный
runtime/config. Текущая миграция не запускала ни одну пробу.

Самодостаточный переносимый reference с sources и собственными probes:
[paths/config](../../skills/websoft-hcm/references/paths-and-configuration.md),
[URL storage](../../skills/websoft-hcm/references/url-storage-and-blobs.md).
[Datex UrlToFilePath](https://wshcm-docs.boristype.dev/news/platform/7160847139044029573.html),
[xHttp.ini](https://wshcm-docs.boristype.dev/news/monolith/6747986263544912377.html)
и [wshcmx/types core at a3b1e43](https://github.com/wshcmx/types/blob/a3b1e43d0b2add53bbc1f2acc2c5128360e8c97b/lib/core/index.d.ts#L2415)
сопоставляются с observations; documentation/declarations не считаются сами
по себе доказательством runtime semantics.
