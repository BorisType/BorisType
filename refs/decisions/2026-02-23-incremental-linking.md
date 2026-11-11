# ADR 004: Инкрементальная линковка для dev mode

**Дата решения:** 2026-02-23. **Статус:** принято; механизм реализован с
ограничениями ниже. Текущий код сверён 2026-11-11; эта сверка не меняла CLI.

## Контекст и решение

Полное копирование build каждого пакета при каждом сохранении повторяет IO
для неизменившихся файлов и dependencies. Выбрано передавать список реально
эмитированных output paths из build в linking и для standalone/component в dev
копировать этот список вместо всего дерева. Initial linking остаётся полным,
чтобы подготовить весь проект и dependencies до первых обновлений.

Источник списка — emit, а не простое переименование source path: postprocessing
может менять расширение на XML/HTML, а TypeScript определяет affected files,
включая зависимые исходники. Старый пример `customWriteFile` больше не описывает
актуальный BS emit: его выполняет bt-ir, tsc отвечает за diagnostics и `.d.ts`.

## Текущий dataflow

[compiler.ts](../../packages/bt-cli/src/core/building/compiler.ts) собирает
абсолютные output paths `emittedFiles`. [DevCoordinator](../../packages/bt-cli/src/core/building/coordinator.ts)
ждёт успешные initial builds всех выбранных watchers, выполняет full link,
затем передаёт `devMode:true` и `changedFiles` в общий pipeline
[ADR 002](2026-02-23-unified-linking.md).

[Standalone/component linkers](../../packages/bt-cli/src/core/linking/linkers)
копируют changed files относительно sourceDir; при пустом списке возвращаются
к полному копированию. В incremental ветке их node_modules copy пропускается.
System dependencies обрабатываются отдельно и могут снова копироваться, поэтому
«в dev никогда не копируются dependencies» было бы слишком сильным выводом.
Generated файлы используют [writeIfChanged](../../packages/bt-cli/src/core/linking/utils/write.ts),
где это предусмотрено: helper сравнивает текст и не пишет неизменённый файл.
Он не регенерирует автоматически уже существующие init templates и не применяется
ко всем output безусловно (общий api_ext.xml пишется отдельно).

## Альтернатива и цена решения

Полная линковка после каждого изменения проще: каждый раз виден весь набор
конфигурации и metadata. Она сохранена для initial build и итоговой поставки,
но не выбрана для каждого dev update из-за повторного IO. Ускорение не измерено
как универсальные «10x» и не гарантировано для любых размеров проекта.

Избирательное копирование требует корректного полного состояния отдельно от
списка changed files: удаления, registry metadata, dependency changes и paths
нельзя восстановить из одного массива emitted files. Эти обязанности не следует
объявлять решёнными лишь по факту добавления двух options.

## Подтверждённые ограничения и условия пересмотра

Сверка текущего исходника выявила конкретные границы:

- Координатор передаёт только `{name}` изменённого пакета: теряет явные
  `source`/`target` и при записи общего api_ext может исключить остальные пакеты.
- Non-TS unlink удаляет build-файл, но callback передаёт source path: линкер
  не удаляет старый target. Общего удаления stale TS output также нет.
- Watch executable registry заменяется affected subset; filemap имеет ещё
  отдельное расхождение absolute/relative key normalization.
- Library/static directories не получают своих watchers; dependencies нужно
  собирать и линковать отдельно. Push после incremental link всё ещё загружает
  весь dist, а не только changed files.

Эти пункты — действующие ограничения, а не список обещанных будущих features.
Причины, точные условия и текущие обходы находятся в
[build/watch](../cli/build-and-watch.md) и [linking/cache](../cli/linking-and-cache.md);
конкретный реализационный долг учитывается в [TODO](../../TODO.md).
Перед поставкой: убрать stale compiler output, собрать нужные пакеты и выполнить
полную `btc link --clean`. Это не исправляет алгоритм incremental metadata,
но даёт полный вход линковщику. Дальнейшая оптимизация должна сохранять полный
registry/config state и выражать удаления отдельно; отсутствие ускорения не
оправдывает потерю корректности.
