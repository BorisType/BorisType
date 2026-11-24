# Конкретный долг и незавершённые проверки

Здесь — остающиеся задачи и критерии завершения. При наличии issue статус ведётся
там; ссылка не является второй копией состояния. Наблюдение, code-only риск и
идея улучшения различаются. Направления проекта — [ROADMAP](ROADMAP.md).

## Компилятор и runner

- **Стратегия памяти для будущих режимов.** Нужны правила ownership/lifetime для
  выходного кода с замыканиями и проверяемая стратегия для циклов на C-runtime.
  [Архивное обоснование](https://github.com/BorisType/BorisType/blob/7a0b6a26a004f480f76fad9d534fedcde9f8aea7/refs/decisions/2026-11-05-script-module-memory-freeze.md).
- **Порядок и частота вычисления выражений.** Сбор pending statements требует
  учитывать ленивые ветки, вычисления до побочных эффектов и повторный вход в
  loop condition. [Открытые вопросы](refs/compiler/findings.md).

- **Literal temp collision и диагностика unsupported syntax.** R22/H01 используют
  независимый literal allocator; нужен collision-safe naming с nested-scope controls.
  F-01/T-04 inventory token/modifier/helper остаётся незавершённым: enum/namespace,
  async/generator и member paths нельзя объявить поддержанными по compile success.
  Остальные seed R/K cases имеют индивидуальный статус и воспроизведение в
  [findings](refs/compiler/findings.md); они не закрыты миграцией.
- **Статическая исчерпываемость IR — gap.** `assertNever(node as never)` в walker/
  emitter подавляет нужное union narrowing. Нужен compile-time negative test и
  устранение подавления либо доказанный альтернативный механизм. Общий verifier,
  unified walker и source maps отдельно не реализованы; это не обещанные этапы.
  [Классификация старых reviews](refs/compiler/findings.md).
- [#28: несколько declarations в classic for initializer](https://github.com/BorisType/BorisType/issues/28).
- [#29: provisioning JS runtime и required execution gates CI](https://github.com/BorisType/BorisType/issues/29).
- [#30: fail-closed botest при пустой выборке/неизвестных фильтрах](https://github.com/BorisType/BorisType/issues/30).
  До исправления проверять ненулевой счётчик выполненных тестов.

## CLI: build, linking и deployment

- **Настраиваемый каталог XML внутри пакета.** Добавить относительный путь в
  `package.json` (кандидат `ws:objectsDir`). Из одной настройки `btc link`
  должен находить XML, класть их в каталог активной версии внутри пакета и
  передавать тот же адрес в `OnInit`. Проверить два пакета с разными путями,
  сборку без настройки и повторный деплой с удалением XML из поставки.
- **Начальные значения для startup и `btc objects apply`.** Предлагаемый
  режим задаёт значение при создании документа или элемента массива с ключом.
  Проверить пустой и настроенный прокси после ручной правки и повторного старта,
  добавление переменной в существующий документ и ручное изменение состава группы.
  Согласовать синтаксис и миграцию `default="true"`.
  [Примеры и границы режима](refs/cli/startup-objects.md#начальные-значения-в-определении).
- **Перенос и проверка служебных объектов.** Остаются Windows/MSSQL, файловая
  БД, новый реестр форм, координация нескольких пишущих узлов и обратная
  выгрузка отдельных определений. [Приёмка на Linux C/PG](refs/cli/startup-objects.md).
- **CLI/config расходятся.** `build --outDir` зарегистрирован, но output берётся
  из tsconfig; Commander default `--https=false` перекрывает file `true`;
  `.properties` parser обрезает значение с `=` и не снимает quotes. Нужны tests
  приоритетов и parser round trips, затем согласованный fix. Текущие обходы и
  источники — [build](refs/cli/build-and-watch.md), [push](refs/cli/push-and-artifacts.md).
- **Incremental multi-package output.** Rebuild теряет explicit source/target и
  другие app entries, перезаписывает api_ext subset; watcher-less package может
  удержать initial barrier, duplicate ws:name схлопывает ключи. Asset unlink/TS
  rename-delete не обеспечивают удаление stale output. Нужны multi-package
  create/update/delete fixtures и полное согласование registry.
  [Source evidence](refs/cli/build-and-watch.md).
- **Executable metadata paths и полный registry.** Абсолютный sourceFile.fileName
  расходится с package-relative lookup; incremental registry заменяется affected
  subset. Определить единый file key/URL contract, проверить TSX, source roots,
  Windows и сохранение unaffected entries. [Основание](refs/cli/linking-and-cache.md).
- **Cache validity и orphan cleanup.** No-library early return оставляет old output;
  cache hit не проверяет target existence/relocation; nested edits и некоторые
  realpath-inside-node_modules случаи не инвалидируют copy. Recursive merge не
  удаляет все stale init/filemap/API entries. Нужны tests по точной
  [матрице условий](refs/cli/linking-and-cache.md); external workspace symlink
  content invalidation уже работает и не считается открытым blanket defect.
- **Component reinit names.** `${componentName}.init()` не задаёт корректный доступ
  для распространённого ws:name с `-`. Согласовать naming/lookup с generated XML
  и проверить local generation + bounded native execution.
  [Source и ограничение](refs/cli/push-and-artifacts.md).
- **`process.exit()` в core — существующий долг.** Завершение процесса должно
  оставаться в CLI; core возвращает результат или бросает ошибку. Старые вызовы
  остаются в config/linking. Нужны error/cancellation contract, перенос завершения,
  exit-code и cleanup tests. Новые core функции не добавляют такие вызовы.
  [Граница CLI/core](refs/cli/build-and-watch.md).
- **Lifecycle concurrency — code-only риски.** Async relink callbacks не сериализованы,
  close не обязательно дожидается активного push. До defect claim нужны bounded
  local repro shutdown/rebuild overlap; отдельно определить drain/cancellation.
  [Текущий flow](refs/cli/push-and-artifacts.md).

## MCP / .NET / платформа

- **После удаления импортированного объекта остаётся строка каталога.** Native
  SDK e2e на Linux C/PG обнаружил cost_center: OpenDoc не открывается, metadata
  `is_deleted=1`, но строка видна через XQuery. Нужен минимальный repro с разделением
  import/reimport, BindToDb/Save/DeleteDoc и cache/очередей; установить штатный
  cleanup либо подтвердить дефект. PostgreSQL fallback ограничен тестовыми
  fixtures и не объясняет причину. [Наблюдение, evidence и критерий закрытия](refs/platform/object-model.md#открытая-находка-строка-каталога-после-удаления-импортированного-объекта).

- **Пакеты объектов: расширить native acceptance и lifecycle.** SDK и десять MCP
  tools реализуют схемы/export/immutable inspect/import/status. Проверен объектный
  cost_center путь на Linux C/PostgreSQL; остаются courses/web/custom_file,
  custom templates/access roles/files/lists/deletions, related traversal,
  cross-client concurrency, разные аккаунты, native timeout receipt, максимальные
  размеры и Windows/MSSQL. Нужны политика уборки expired artifacts и серверных
  receipt/temp/report; полноценный remap IDs не реализован. [Контракт и точные границы evidence](refs/mcp/object-packages.md).

- **Пакеты: прикладные зависимости сверх штатного XMD-обхода.** Отдельная opt-in
  стратегия для известных ссылок в `wvars` (`custom_web_template` /
  `override_web_template`) и текстовой связи `mode` с `web_mode`. Нужны проверенные
  правила по типу/полю, объяснимый состав, пределы/циклы и точные IDs; произвольную
  hex-строку не считать ссылкой. Штатный `includeRelatedObjects` сохраняет своё
  значение и ограничения. [Границы и источники](refs/mcp/object-packages.md).

- **Оценить полезность экспериментального `print(value)`.** Пока оставить в
  `execute` как кандидата для диагностики отдельного вызова. На реальных
  сценариях сравнить с возвратом структурированного результата и чтением
  штатных логов HCM; по результатам решить, оставить, изменить или удалить.
  [Статус и основания](refs/mcp/execution.md#статус-print).

- **Формализованный JSON подробного системного отчёта.** `systemInfo` /
  `wshcm_get_system_info` пока структурируют только сводку; подробности доступны
  исходным текстом. Определить JSON-контракт секций INI/XML/Global Settings:
  сохранять повторяющиеся ключи и порядок INI, семантику XML и неизвестные секции,
  оставив доступ к исходному тексту. Проверить на версиях/ОС целевых стендов.
  [Текущий формат и основания](refs/mcp/system-info.md).

- [#70: потери отрицательных integer и NULL/empty при SQL→XML](https://github.com/BorisType/BorisType/issues/70).
  Подтверждены до SOAP на Linux C/PG; [границы и план локализации](refs/research/sql-xml-mapping.md).

- **Managed runtime: расширить acceptance.** Проверить настоящий restart HCM
  с prepared update, Windows HCM и deployments с custom DOTNETLIBS-PATH.
  Gate и файловая операция пока разные SOAP calls: для балансировки нужен
  отдельный affinity/same-request contract. Определить очистку старых immutable
  версий без удаления загруженных файлов. [Текущий контракт](refs/dotnet/managed-runtime.md).

- **Внешний atomic compare-and-replace — исследование.** Hash recheck перед rename
  оставляет race с external writer. Нужен согласованный Linux/Windows protocol и
  competing-process tests либо явно ограниченный контракт.
  [Read-grant/CAS основания](refs/dotnet/files-and-read-grants.md).
- **Acceptance matrix неполная.** Одна Linux HCM/CLR сборка и Windows managed CI
  не заменяют Windows HCM, MSSQL, другие версии, permissions/path/encoding limits
  и shutdown во время SOAP. [Файловый checkpoint](refs/research/mcp/08-filesystem-checkpoint.md),
  [transport/native e2e](refs/research/mcp/04-local-e2e.md).
- **XML objects: дополнительные подтверждения.** Custom lifecycle/types, новая модель,
  external data, authorization и concurrent save не аттестованы. Нужны owned fixtures,
  negatives и cleanup receipts. Save/timeout может иметь unknown outcome; повтор
  не является безопасным по умолчанию. [Текущие гарантии](refs/mcp/xml-objects.md).
- **URL roots/storage routing.** DESIGN-DB/DATA-DB не достаточны как рецепт разрешения
  нового host для всех runtime; physical files и SQL blobs различаются. Проверить
  registry/config recipe отдельно по версиям. [Наблюдения](refs/platform/paths-and-storage.md).

- **Datex callback и lifecycle остаются отдельными исследованиями.** Причина
  `DatexGlobal.EncodeJson` exit 139 неизвестна; нужны native stack/context/version
  данные, crash probe изолирован от smoke. Для MCP остаётся native shutdown
  во время длительного пользовательского BS. Локальные race tests покрывают
  partial setup, а native proxy подтверждает восстановление после потери ответа
  на загрузку evaluator. [Bridge evidence](refs/dotnet/bridge.md),
  [native recovery](refs/research/mcp/connection-recovery/README.md).
- **Объектные ресурсы и cache coherence.** Related documents/binary cleanup,
  trash/restore и form-cache eviction/cluster invalidation не доказаны простым
  cost_center lifecycle. Нужны отдельные resource/business adapters и bounded
  проверка invalidation; process stop не доказывает live eviction API.
  [Модель и неподтверждённые границы](refs/platform/object-model.md).

## Зависимости

- **Убрать временное CI-исключение picomatch GHSA-fc5q-39xc-vjpf.** На 2026-11-17
  исправленная версия не опубликована; dev-tool ReDoS явно исключён в workspace
  audit по одному GHSA, остальные high/critical остаются блокирующими. Повторно оценить не
  позднее 2026-12-01, раньше при появлении исправления или production цепочки
  SDK/MCP. Закрытие: совместимое обновление с соблюдением minimumReleaseAge,
  проверка потребителей и успешный audit без исключения.
  [Основание, область риска и проверка](refs/cli/release-and-maintenance.md#временное-исключение-picomatch-в-ci).

Read-only audit от 2026-11-11: 0 high/critical, но остаются moderate
GHSA-g3hv-75wg-m249 (minimatch 10.2.6) и low GHSA-474x-hrwr-fgx4
(fast-xml-parser 5.11.2). Для minimatch 11.0.1 cooldown уже истёк;
нужно проверить совместимость parent packages/major override. Для parser 5.12.0
14-дневный cooldown заканчивается 2026-11-17T12:15:08.693Z; затем переоценить audit
и выполнить parser regressions. Миграция документации не обновляет dependencies.
[Датированные данные и policy](refs/cli/release-and-maintenance.md).
