# Общий SDK и автоматически подготавливаемый runtime

`packages/ws-client/src/hcm` владеет платформенными операциями, BS resources,
input/response validation и read grants. `WshcmApi(evaluator)` не владеет
инициализацией/закрытием evaluator. MCP содержит адаптеры формата и регистрации;
тот же API доступен другим Node consumers, включая CLI. XML остаётся XML,
XQuery возвращает typed данные: integer как bigint, real как number.
MCP выбирает JSON-представление отдельно; [контракт](../../docs/reference/ws-client-values.md).

## Bundle и build

Сборка ws-client автоматически вызывает `tools/prepare-runtime.mjs` с SDK из
global.json. Готовый npm archive содержит `resources/dotnet/manifest.json`,
production RuntimeBootstrap и FileSystem DLL с deps.json. Registry consumers
не собирают C#, не скачивают ZIP и не требуют локальный .NET SDK.
Существующий standalone ZIP — отдельный артефакт.

Manifest schema 1 разделяет bootstrap/component. Descriptor содержит
id/version/apiVersion/targetFramework/buildId/entryAssembly/files; buildId —
actual PE MVID, files — basename/bytes/SHA256. Build-time AssemblyIdentity читает
PE metadata без выполнения сборки; этот reader также используется установщиком.
PDB/XML, vendor/test/probe assemblies, SDK/CLR и source в bundle не входят.
PathMap нормализует пути нового RuntimeBootstrap; параметры сборки существующего
FileSystem сохранены. Production bundle с DebugType=None проверяется повторной
сборкой из другого checkout: все MVID и bytes/hashes должны совпасть.

Helper собирается сначала под seed-name, затем с actual simple assembly name
`BorisType.RuntimeBootstrap.B<seed SHA256>`. Переименование файла недостаточно:
GetAssembly загружает **по имени**, а не exact path. Seed описывает содержимое
данной сборки; transport проверяется отдельным hash окончательного DLL.

CI устанавливает pinned SDK при сборке ws-client/dependency closure. Turbo
кеширует также resources/dotnet. Pack инспекция проверяет actual tarball,
manifest, file allowlist/bytes/hashes даже при ignore-scripts. SDK-equipped pack
job дополнительно читает PE identity обеих DLL из exact tarball и сверяет все
поля manifest. Reader собирается отдельно во временном каталоге; восстановление
bundle из кеша не требует сохранённых bin/obj build-time utility.
Publish/verify jobs без SDK используют attested SHA512 archive
и повторную проверку bytes/hashes. Runtime-package test импортирует распакованный
SDK и проверяет разрешение его собственных assets, а также отвергает false MVID
при неизменённых DLL bytes.

## Подготовка и идентичность

Первый files-вызов или `runtime.ensure()`:

1. Проверяет bounded локальный manifest и фактические bytes/SHA256 всех assets.
2. BS primitives создают helper под
   `AppDirectoryPath()/dotnetcore/shared/.boristype-runtime/bootstrap/<id>/`.
   Прочитанные серверные bytes возвращаются и сверяются до GetAssembly.
3. Helper проверяет descriptor и принимает file payload как bounded base64 JSON.
   Под exclusive filesystem lock проверяет staging hash, simple name, version,
   API, TFM и MVID без загрузки компонента.
4. Публикует immutable `components/<id>/<version>-<MVID>/`, затем active.json.
   Более новый совместимый active marker не заменяется старым; одинаковый
   version с другим MVID даёт BuildConflict. Повреждённый existing immutable
   каталог не перезаписывается.
5. Проверяет assembly **из памяти нужного ALC**. Если её нет, использует
   LoadFromAssemblyPath точного component path. Внешний host loader не обязан
   соблюдать install lock, поэтому loaded state перечитывается после staging
   и при FileLoadException.

Manifest hash относится к bytes на диске; MVID reflection — к code в памяти.
Хеширование Assembly.Location после обновления файла не различило бы эти случаи.
Helpers не ссылаются на Datex и не вызывают callbacks в BS.

Собственный root и ancestors не должны быть symlink/reparse. Последовательность
проверок не закрывает filesystem TOCTOU от внешнего writers, меняющего paths;
на Unix новый owned root получает mode0700. Загруженные файлы не truncation/
overwrite; старые directories не удаляются автоматически.

## Статусы и gate

Status schema 1: status/reason/expected/installed/loaded/changed/process.
Identity содержит id/version/apiVersion/buildId. Неизвестный API внешней assembly
может быть 0; диагностическое loaded/version может отличаться от manifest SemVer.
Process содержит PID/start/CLR/architecture ответившего managed host, а при
локальной/неизвестной transport ошибке — null.

`ready` означает загруженный expected build либо более новый совместимый API.
`restart_required` — другой loaded build, при этом требуемые bytes уже могут
быть подготовлены рядом. `blocked` отражает metadata/hash/API/permissions/build
conflict; `missing` и `installed` используются non-loading Inspect ABI.
`requireReady()` бросает WshcmRuntimeError со status, если code не готов.
File API дополнительно требует именно FileSystem/API2.

Concurrent ensure одного экземпляра объединяются. Кешируется только успешный
helper readback; следующая проверка снова обращается к процессу. Missing/
installed после restart приводит к повторной подготовке. Готовность навсегда
не запоминается. HCM автоматически не перезапускается.

MCP `wshcm_runtime_status` запускает подготовку и не read-only. Зависимые ошибки
сохраняют runtimeStatus в JSON; XML/XQuery работают независимо от DLL.
Gate и file operation — отдельные SOAP calls: балансировщик может направить их
в разные процессы. Это **не** cluster readiness/pinning и не атомарная связка.
Transport timeout не отменяет server code; файловые mutations не повторяются
автоматически при неизвестном исходе.

## Основания и пределы

Datex.Core из Linux HCM2025.2.1333 показывает by-name lookup, root restrictions,
recursive resolver и cache, включая null path. Поэтому helper нельзя сначала
запрашивать отсутствующим. Произвольный каталог под AppDirectoryPath недостаточен:
используется настроенный `dotnetcore/shared`; SDK не меняет DOTNETLIBS-PATH.
Нестандартная конфигурация без shared даст диагностическую ошибку bootstrap.

[Исследование загрузчика](../research/ws-client-runtime/loader-research.md),
[уточнение путей](../research/ws-client-runtime/loader-paths.md),
[native acceptance и ошибки BS](../research/ws-client-runtime/results.md).
Linux native подтверждает automatic install/loaded identity, cached-old update
и файловые операции через MCP. Restart recovery проверен новым ALC в managed
tests; настоящий restart HCM не выполнялся. Windows managed CI и Windows HCM —
разные проверки; Windows HCM и все варианты cluster/custom config не аттестованы.
