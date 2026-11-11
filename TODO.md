# Конкретный долг и незавершённые проверки

Здесь — остающиеся задачи и критерии завершения. При наличии issue статус ведётся
там; ссылка не является второй копией состояния. Наблюдение, code-only риск и
идея улучшения различаются. Направления проекта — [ROADMAP](ROADMAP.md).

## Компилятор и runner

- **Стратегия памяти script/module — блокер развития.** Нужны ownership/lifetime
  contract, разбор escaping values и bounded C memory tests. Существующие режимы,
  defaults и regressions сохраняются. [Решение и критерии](refs/decisions/2026-11-05-script-module-memory-freeze.md).
- **Expression effects — известные несовпадения.** Checkpoint содержит 10 PASS и
  38 exact XFAIL из 48 comparisons. Нужны producer/consumer inventory, C shape
  probes и небольшой bare slice с output-cost проверкой. Inline/shape prototypes
  не стали production fix; script/module design on hold.
  [Контрпримеры, варианты и стоимость](refs/research/compiler-semantics/expression-evaluation.md),
  [остальные семейства и критерии](refs/research/compiler-semantics/scope.md).
- **Ambient declarations стираются не во всех режимах.** В executable script/module
  `declare const bt/botest` превращается в undefined assignments; bare их убирает.
  Дефект воспроизводится с/без `@ts-nocheck` в обеих entrypoints. Нужны ambient-erasure
  regressions и ordinary declaration controls; это исправление frozen поведения,
  без расширения ABI. [Source и bounded compile-only repro](refs/compiler/findings.md#ambient-declarations-уточнение-старой-ts-nocheck-находки).
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
  данные, crash probe изолирован от smoke. Partial evaluator initialization и
  shutdown с активным SOAP требуют deterministic cleanup/outcome tests.
  [Bridge evidence](refs/dotnet/bridge.md), [transport](refs/mcp/transport-and-lifecycle.md).
- **Объектные ресурсы и cache coherence.** Related documents/binary cleanup,
  trash/restore и form-cache eviction/cluster invalidation не доказаны простым
  cost_center lifecycle. Нужны отдельные resource/business adapters и bounded
  проверка invalidation; process stop не доказывает live eviction API.
  [Модель и неподтверждённые границы](refs/platform/object-model.md).

## Зависимости

Read-only audit от 2026-11-11: 0 high/critical, но остаются moderate
GHSA-g3hv-75wg-m249 (minimatch 10.2.6) и low GHSA-474x-hrwr-fgx4
(fast-xml-parser 5.11.2). Для minimatch 11.0.1 cooldown уже истёк;
нужно проверить совместимость parent packages/major override. Для parser 5.12.0
14-дневный cooldown заканчивается 2026-11-17T12:15:08.693Z; затем переоценить audit
и выполнить parser regressions. Миграция документации не обновляет dependencies.
[Датированные данные и policy](refs/cli/release-and-maintenance.md).
