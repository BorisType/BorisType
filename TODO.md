# Конкретный долг и незавершённые проверки

Здесь — остающиеся задачи и условия их завершения. При наличии issue статус
ведётся там; ссылка ниже не является второй копией его состояния.
Идеи без проверенного основания не объявляются дефектами.
Направления проекта — [ROADMAP](ROADMAP.md).

## Компилятор и runner

- **Стратегия памяти script/module — блокер развития этих режимов.** Нужны модель
  ownership/lifetime, разбор escaping значений и ограниченные C memory tests;
  только затем пересматривать freeze. [Решение и критерии](refs/decisions/2026-11-05-script-module-memory-freeze.md).
- **Expression semantics — известные несовпадения.** Сохранённый checkpoint содержит
  10 PASS и 38 exact XFAIL из 48 comparisons; baseline не означает исправление.
  Нужны завершение producer/consumer inventory, C shape probes и согласованный
  маленький bare slice с проверкой output cost. Script/module остаются on hold.
  [Состояние и evidence](refs/research/compiler-semantics/results/2026-11-05-research-checkpoint.md).
- [#28: несколько declarations в classic for initializer](https://github.com/BorisType/BorisType/issues/28).
- [#29: provisioning JS runtime и required execution gates CI](https://github.com/BorisType/BorisType/issues/29).
- [#30: fail-closed botest при пустой выборке/неизвестных фильтрах](https://github.com/BorisType/BorisType/issues/30).
  До исправления проверять ненулевой счётчик выполненных тестов.
- **`process.exit()` в core CLI — существующий долг.** Завершение процесса должно
  оставаться в CLI; core должен возвращать результат или бросать ошибку, чтобы
  его можно было встраивать и тестировать. Старые вызовы пока есть в
  [config.ts](packages/bt-cli/src/core/config.ts) и
  [linking](packages/bt-cli/src/core/linking/).
  Закрытие: определить контракт ошибок/отмены, перенести завершение в CLI,
  проверить соответствующие exit codes и освобождение ресурсов. Новые core функции
  не должны добавлять такие вызовы.

## MCP / .NET / платформа

- **Внешний atomic compare-and-replace — отложенное исследование.** Проверка hash
  перед rename не исключает гонку с внешним writer. Нужен согласованный протокол
  Linux/Windows и проверки конкурирующих процессов либо явно ограниченный контракт.
  [Основание и текущие гарантии](refs/research/dotnet/11-read-aware-files-design.md).
- **Acceptance matrix — неполная.** Проверки одной Linux HCM/CLR сборки и managed CI
  не заменяют Windows HCM, MSSQL, другие версии, permissions, path/encoding limits
  и shutdown во время SOAP. [Файловый checkpoint](refs/research/mcp/08-filesystem-checkpoint.md),
  [native e2e](refs/research/mcp/04-local-e2e.md).
- **XML objects — расширение подтверждений.** Custom lifecycle/types, новая модель,
  external data, authorization и конкурентное сохранение пока не аттестованы.
  Нужны изолированные owned fixtures, negatives и проверка очистки.
  [Границы первой реализации](refs/research/mcp/10-object-model/first-implementation.md).
- **Регистрация URL roots и storage routing — частично исследованы.** Не считать
  DESIGN-DB/DATA-DB достаточным разрешением нового host для всех runtime.
  [Наблюдения и открытые вопросы](refs/research/dotnet/14-path-schemes-research.md),
  [disk/blob routing](refs/research/dotnet/15-url-storage-routing-research.md).
- **minimatch advisory — повторная оценка после cooldown.** Исторический refresh
  оставил GHSA-g3hv-75wg-m249 открытым вопросом; текущую применимость проверять
  через audit/lockfile, не выводить из старого отчёта.
  [Maintenance evidence](refs/archive/maintenance/2026-11-07-dependency-refresh.md).

## Документация и старые находки

- **Проверить старые findings перед дальнейшим сжатием архива.** Замечания о
  `@ts-nocheck`, parser-safety и старых refactoring reviews ещё не прошли сплошную
  техническую ревизию при миграции. Подтвердить по текущему коду, закрыть как
  устаревшие либо завести конкретную задачу с контрпримером.
  [Исходный список](refs/archive/documentation/known-issues-before-migration.md),
  [поколения ревью](refs/archive/compiler/refactoring/),
  [старый backlog](refs/archive/documentation/roadmap-before-migration.md).
- **Завершить содержательную ревизию исторических материалов.** Текущий перенос
  сохраняет исходные отчёты и evidence; не все их команды и утверждения актуальны.
  Суммаризировать по теме с сохранением отрицательных результатов и уникальных
  незакрытых вопросов. Известные неразрешённые ссылки истории учитывать отдельно.
  [Охват перехода](DOCUMENTATION_TRANSITION.md), [карта переноса](refs/migration-map.json).
