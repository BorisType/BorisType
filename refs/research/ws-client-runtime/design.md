# Общий HCM API и управляемые серверные зависимости

Дата: 2026-11-14. Принятые пользователем требования: платформенные операции и
управление DLL принадлежат `ws-client`; MCP является адаптером и тот же API
доступен CLI. Пользователь устанавливает npm package, без отдельного скачивания
DLL. Обновление автоматически подготавливает необходимые серверные файлы и
сообщает, если процесс HCM продолжает использовать старую сборку.

## Границы API

`new WshcmApi(evaluator)` использует предоставленный evaluator и не владеет его
lifecycle. `files` предоставляет read/write/edit/list/delete/mkdir/move/info/search;
`objects` — getForm/get/save, `xquery(input)` возвращает исходный проверенный JSON
text, сохраняя точные числовые tokens. Read grants принадлежат экземпляру API,
сохраняют существующие TTL/limits/consume rules. MCP сохраняет tool names,
schemas, annotations и внешний формат результатов, но не платформенные templates,
XML validation, read state или DLL transport. SDK не импортирует MCP и не
печатает сообщения в stdout, не вызывает process.exit.

## Доставка и загрузка

Production binaries и manifest входят в npm archive ws-client. Нужный .NET SDK
используется в CI сборки пакета, не требуется от пользователя npm. Manifest
проверяет реальные bytes/SHA256 и MVID сборок, API и target framework.

Нельзя начинать bootstrap с GetAssembly отсутствующей FileSystem: статическое
исследование текущего Datex.Core обнаружило resolver cache, включая отрицательные
результаты. GetAssembly(fullPath) регистрирует каталог, но затем грузит по simple
name в общем контексте; versioned path сам по себе не обеспечивает новый код.

Для независимого bootstrap нужен небольшой pure-managed RuntimeBootstrap без
FileSystem/Datex dependencies. Он доставляется платформенными BS file primitives
под уникальным assembly name, проверенным содержимым и immutable path внутри
AppDirectoryPath. Bootstrap идентифицирует уже загруженные сборки через reflection
и MVID, проверяет установленные bytes, подготавливает компонент в immutable
version/build directory, и загружает его явным LoadFromAssemblyPath в своём ALC.
Нельзя перезаписывать mapped DLL через CopyFile/PutFileData.

Для старого загруженного FileSystem возвращается restart_required. Подготовленная
новая версия остаётся на диске; после реального перезапуска состояние проверяется
снова. Нужная сборка на диске не доказывает её использование процессом. Если
компонент ещё не загружен, первая установка/загрузка выполняется автоматически.
Недоступный .NET host, permissions, corrupt artifacts и несовместимые API дают
отдельные диагностируемые ошибки, без обещания исправления окружения.

Конкурирующие установки сериализуются server-side; immutable files не
перезаписываются. Более старый клиент не откатывает уже работающий более новый
совместимый API. Совпадающий version с другим MVID не считается тем же build.
Состояние определяется для ответившего процесса; один endpoint не аттестует
остальные узлы кластера. Автоматический restart HCM не выполняется.

## MCP и проверки

MCP exposes runtime status инструментом и структурированной ошибкой зависимой
операции. Ошибка файловой зависимости не блокирует XQuery/XML, которым DLL не
нужна. Повторная status/preparation проверка после restart снимает stale flag
по фактической идентичности. Подготовка выполняется автоматически при обращении
к файловому API.

Проверки: SDK напрямую без MCP, прежний MCP protocol/state/XML suite, managed
installer tests с настоящими файлами и ALC, tarball с обеими реальными DLL,
native Linux SOAP/bootstrap с отдельными fixture assemblies и независимым
cleanup. Рабочий FileSystem стенда не подменяется. Windows managed tests не
выдаются за Windows HCM acceptance. Timeout не является отменой серверного кода.
