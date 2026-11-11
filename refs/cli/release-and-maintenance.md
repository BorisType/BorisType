# Monorepo, release и ручное сопровождение

Точные версии находятся в manifests/pins/lockfiles, а не в этой записи.
[refs/development](../development.md) содержит обычные команды checkout.
[Датированный refresh](../archive/maintenance/2026-11-07-dependency-refresh.md)
сохраняет inventory, причины pins, результаты hosted CI и границы native evidence.

## Граф сборки

[pnpm-workspace.yaml](../../pnpm-workspace.yaml) перечисляет packages, tests и
examples; [turbo.json](../../turbo.json) задаёт build → `^build`, outputs
`build/**`/`dist/**`. Поэтому порядок определяется package dependency graph,
а не статическим списком из старого monorepo overview. bt-cli зависит от bt-ir,
ws-client, ws-version; runtime использует bt-cli только для своей сборки.
bt-cli **сейчас не имеет runtime peer dependency**, поэтому прежняя история
«peer dependency разрывает цикл CLI ↔ runtime» не описывает текущий manifest.
Системные пакеты обнаруживаются в **проекте пользователя** при link; runtime
устанавливается явно. Вынос system dependencies из compiler был выбран для
независимого layout/runtime управления; [решение](../decisions/2026-02-26-decouple-system-packages.md).

[.NET workspace](../dotnet/README.md) имеет отдельный MSBuild graph и команды,
не запускается default Turbo build и не публикуется через npm release.
[ADR monorepo](../decisions/2026-02-24-pnpm-monorepo-migration.md) сохраняет
причины pnpm/Turbo; он не фиксирует сегодняшние версии инструментов.

## Версионирование и публикация

[Changesets config](../../.changeset/config.json) содержит **fixed**, не linked
группу `bt-cli`, `runtime`, `eslint-plugin`; linked пуст. bt-ir, ws-client,
ws-version и MCP версионируются отдельно. `updateInternalDependencies:patch`
учитывает изменения внутренних dependencies при versioning, но не заменяет
анализ release plan/совместимости. Fixed group синхронизирует номера, не доказывает
runtime ABI. Private examples/test/.NET wrapper исключены из versioning.

В разработке создают changeset с пользовательской смысловой дельтой:

```sh
pnpm exec changeset
pnpm exec changeset status
```

Release preparation — `pnpm run version` (root script = changeset version), затем
проверка manifests, changelogs, lockfile и соответствующих checks. Publication
выполняется отдельно через `pnpm exec changeset publish` в утверждённом release
процессе. Эти команды описаны как workflow, не запускались при миграции.
В репозитории нет `scripts/postversion.js`/postversion script и нет release CI;
обещания об автоматическом exact pinning/публикации через них удалены.
`pnpm version` двусмысленно с package-manager version command, поэтому используем
`pnpm run version`. Не объявлять prerelease mode активным без `.changeset/pre.json`:
alpha в package version сама по себе не означает его наличие.

[Syncpack](../../.syncpackrc.json) закрепляет `workspace:*` для внутренних
prod/peer dependencies bt-cli (публикуется exact), для других workspace deps
обычно `workspace:^`. Это два разных правила; прежнее «все workspace:*» неверно.
Changeset нужен для release notes значимого package поведения, не каждого
Markdown изменения. Утилита ws-version преобразует platform metadata отдельно
и не обеспечивает lossless semver order: offsets ограничены 999, unknown labels
хэшируются, `~` превращается в `^`.

## Supply chain и актуальность advisory

Workspace policy: lifecycle scripts выключены, minimumReleaseAge 20160 минут,
strict age/missing-time, trustPolicy=no-downgrade, integrity проверки; отдельные
BorisType packages исключены из cooldown. Эти настройки не распространяются
автоматически на NuGet/Actions. Actions закреплены SHA; TypeScript остаётся на
линии 6 Compiler API. Не обновлять на TS7 как обычный bump.

Read-only оценка **2026-11-11**: `pnpm audit --json` для текущего lockfile вернул
1 moderate minimatch10.2.6 ([GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249)),
1 low fast-xml-parser5.11.2 ([GHSA-474x-hrwr-fgx4](https://github.com/advisories/GHSA-474x-hrwr-fgx4)),
0 high/critical. Это registry advisory snapshot, не доказательство эксплуатации.
Minimatch присутствует в ESLint и CLI/archiver graph; fxp — ws-client и CLI,
в том числе транзитивно у MCP через ws-client. Проверки с high gate не закрывают
эти findings. Версии не менялись.

`pnpm view <package>@<first-fix> time --json` показал:

| First fix             | Registry publication UTC | 14-day cutoff UTC                 |
| --------------------- | ------------------------ | --------------------------------- |
| minimatch11.0.1       | 2026-10-27 22:26:03.755  | 2026-11-10 22:26:03.755 (прошёл)  |
| fast-xml-parser5.12.0 | 2026-11-03 12:15:08.693  | 2026-11-17 12:15:08.693 (ещё нет) |

Для minimatch требуется отдельное совместимое обновление потребителей/override:
исправление на следующем major не станет автоматически выбранным в range10.
Для fxp сначала дождаться cutoff либо отдельного решения о policy; затем проверить
реальный parser/consumer contract, install/lock diff и suites. Наличие advisory
не даёт полномочий отключать supply-chain policy. NuGet/advisory inventory
2026-11-07 остаётся историческим: новый .NET restore/audit здесь не выполнялся.
