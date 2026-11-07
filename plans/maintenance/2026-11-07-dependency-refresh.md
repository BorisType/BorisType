# Ручное обновление зависимостей — 2026-11-07

База: squash merge MCP/filesystem checkpoint, `fd1d248` в `main`.
Dependabot заменён ручным сопровождением: его version-update config удалён,
открытые PR **19, 21, 22, 23, 24, 35, 42, 49–55** закрыты без удаления веток.
GitHub security alerts сохранены; automatic security fixes уже были отключены.
Удаление config вступит в силу после merge этого PR.

## Правила выбора

- Проверять stable releases всех прямых npm/NuGet зависимостей и Actions,
  включая новые major и successor packages вместо legacy names.
- Учитывать 14-дневный `minimumReleaseAge` для всего npm dependency graph.
  Cutoff этой проверки: **2026-10-24T09:16:36Z**. Не добавлять исключения
  только ради обновления. Старые исключения source-map-js/shell-quote удалены:
  их исправления уже прошли cooldown.
- Сохранять `trustPolicy: no-downgrade`, integrity checks и запрет lifecycle
  scripts. NuGet и Actions проверены по датам releases отдельно: pnpm на них
  не распространяется. Actions закреплять полным commit SHA.
- **TypeScript 7 исключён по прямому указанию пользователя.** TS остаётся
  6.0.3; Compiler API migration не входит в эту работу.
- Node остаётся 24.22.2 LTS, `@types/node` — 24.19.2. pnpm 12.16.1 и SDK
  9.0.320 не понижаются: это уже принятые pins предыдущего checkpoint.
  Production target `net9.0` соответствует CLR9 стенда.
- Обновлять transitive dependencies в совместимых ranges родителей.
  VitePress 1.6.4 остаётся stable; его override Vite обновлён до 6.4.5,
  принудительный переход на Vite 8 вне совместимости VitePress не выполняется.

## Изменения

| Зависимость                | До          | После                  |
| -------------------------- | ----------- | ---------------------- |
| MCP client/server          | 2.3.1       | 2.4.0                  |
| Chokidar                   | 5.0.0       | 6.0.0                  |
| Chalk                      | 6.0.0       | 6.0.1                  |
| ESLint                     | 10.11.0     | 10.13.0                |
| typescript-eslint / parser | 8.70.1      | 8.72.0                 |
| Prettier                   | 3.9.8       | 3.9.10                 |
| Turbo                      | 2.11.2      | 2.11.10                |
| Vue                        | 3.5.43      | 3.5.44                 |
| Lefthook                   | 2.1.14      | **exact 2.2.1**        |
| Vite override              | 6.4.4       | 6.4.5                  |
| shell-quote override       | 1.11.0      | 1.12.0                 |
| xUnit test framework       | xunit 2.9.3 | xunit.v3.mtp-off 4.0.2 |

Lockfiles обновлены; manifests примеров и syncpack согласованы.
Остальные прямые зависимости уже соответствуют выбранным версиям.
Более новые ESLint 10.14.0, typescript-eslint 8.72.1, Vue 3.5.45,
Commander 15.1.0, fast-xml-parser 5.12.0, semver 7.8.6 и Inspector 2.14.0
ещё не прошли cooldown. VitePress 2 остаётся prerelease.

Lefthook 2.2.2 блокируется pnpm: публикация потеряла trusted-publisher и
provenance metadata относительно 2.2.1. Это не доказательство компрометации,
но основания отключать проверку отсутствуют. У 2.2.1 проверены provenance,
tarball integrity и официальный tag; exact pin не допускает выбора 2.2.2.
Источники: [2.2.1 registry](https://registry.npmjs.org/lefthook/2.2.1),
[2.2.2 registry](https://registry.npmjs.org/lefthook/2.2.2),
[attestation 2.2.1](https://registry.npmjs.org/-/npm/v1/attestations/lefthook@2.2.1),
[release](https://github.com/evilmartians/lefthook/releases/tag/v2.2.1).

`xunit` 2.x имеет legacy status. Официальный `xunit.v3.mtp-off` сохраняет
VSTest runner без подключения MTP. Test project становится executable,
production DLL и её зависимости не изменены.
[Migration](https://xunit.net/docs/getting-started/v3/migration),
[MTP opt-out](https://xunit.net/docs/getting-started/v3/microsoft-testing-platform),
[4.0.2 release](https://xunit.net/releases/v3/4.0.2).

Actions обновлены: checkout 7.0.1, setup-node 7.1.0, pnpm/action-setup 6.1.0,
setup-dotnet 6.0.0, upload-artifact 7.0.2, configure-pages 6.0.0,
upload-pages-artifact 5.0.0, deploy-pages 5.0.1. Для Pages явно сохранена
загрузка hidden files, включённая по умолчанию в старой v3. Полные SHAs —
в workflows; Node24 actions требуют runner >=2.327.1.

## Проверки и границы

- Linux: workspace build/unit suites — **21/21 tasks**, без cache;
  botest — **149/149**, .NET — **107/107**, installation ZIP — **1/1**,
  реальный Chokidar watcher — **1/1**, MCP tarball smoke — PASS.
- Docs build, syncpack, форматирование tracked/new файлов и locked installs
  npm/NuGet — PASS. ESLint: **0 errors / 11 existing warnings** в bt-ir.
  NuGet vulnerability report не содержит advisories; npm high/critical gate
  проходит с одним унаследованным moderate advisory, описанным ниже.
- Watcher test проверяет ignoreInitial, add/change/unlink, создание и удаление
  вложенной директории, исключения TS/TSX/node_modules/configured exclude/outDir,
  callbacks и естественный выход дочернего процесса после close. IO и watcher
  не замоканы; процесс и ожидания событий ограничены deadlines.
- CI отдельно проверяет watcher и .NET build/test/ZIP на Ubuntu и Windows.
  Результат Windows фиксируется после выполнения CI.
- Для локальной нестандартной установки SDK apphost xUnit v3 требует
  `DOTNET_ROOT`, указывающий на SDK directory, и SDK в `PATH`.
  `actions/setup-dotnet` задаёт переменную автоматически.
- Новых native HCM acceptance runs нет: это обновление зависимостей,
  не новая гарантия runtime semantics или Windows HCM compatibility.

Остаётся унаследованный **moderate**
[GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249)
для minimatch 10.2.6 в ESLint и CLI/archiver graph. MCP runtime его не использует.
Первое исправление 11.0.1 опубликовано **2026-10-27**, поэтому ещё не прошло
cooldown; повторить выбор не раньше **2026-11-10** с проверкой точного времени
публикации, совместимости всех потребителей и актуальных advisories.
High/critical audit gate сохраняется, moderate advisory не скрывается.

При следующих ручных обновлениях повторять inventory registry/release dates,
проверку provenance/совместимости, lockfile refresh, сборку и тесты; смотреть
`pnpm audit` и NuGet vulnerability report, даже если high gate проходит.
