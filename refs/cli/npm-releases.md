# Независимые npm-релизы

Один общий PR готовит версии и changelogs через Changesets. Публикация выполняется
отдельно: тег `@boristype/<package>@<version>` выбирает ровно один npm-пакет.
Merge release PR сам по себе ничего не публикует.

| Пакеты                                   | Версионирование                                     | Поставка                                     |
| ---------------------------------------- | --------------------------------------------------- | -------------------------------------------- |
| bt-cli, runtime, eslint-plugin           | Существующая fixed group, одинаковые номера         | Отдельный тег каждого пакета                 |
| mcp-server, ws-client, ws-version, bt-ir | Независимые версии с учётом внутренних dependencies | Отдельный тег каждого пакета                 |
| .NET workspace, tests, examples          | Исключены из npm release                            | Собственные процессы                         |
| Будущее расширение VS Code               | Собственная числовая версия                         | Отдельный VSIX publisher, пока не реализован |

Конфигурация группы не менялась. Общий release PR может поднять CLI вслед за
ws-client и вслед за ним всю fixed group. Это допустимо: версия в git и публикация
в registry — разные шаги. Mixed changesets не нужно разрезать. `changeset version
--ignore` поверх заполненного config.ignore не поддерживается текущим Changesets.

## Подготовка общего PR

Для пользовательских изменений пакета добавляется обычный changeset:

```sh
pnpm exec changeset
pnpm exec changeset status
```

На `main` запускается [Prepare package releases](../../.github/workflows/prepare-release.yml):

```sh
gh workflow run prepare-release.yml --ref main -f channel=alpha
```

`alpha` — default: helper явно входит в prerelease mode, если его ещё нет.
Суффикс alpha в manifest сам по себе не включает режим. `stable` выходит
из активного prerelease mode и выпускает стабильные версии **всех** его участников.

Helper обновляет manifests/changelogs и lockfile, затем синхронизирует установку
через frozen install: `pnpm exec` должен работать с `verifyDepsBeforeRun:error`
сразу после изменения версий. Workflow форматирует результат,
проверяет syncpack и открывает обычный PR из уникальной `release/versions-…` ветки.
Следующая подготовка разрешена после merge/закрытия предыдущего PR.
Перед merge проверить состав версий, внутренние dependencies и обычный CI.
Fixed group не доказывает runtime ABI.

Changesets auto-format отключён через `format:false`: его вызов `pnpm exec prettier`
после изменения manifests конфликтовал с `verifyDepsBeforeRun:error` до обновления
lockfile. Явное форматирование выполняется после refresh; проверки зависимостей
и остальные supply-chain настройки остаются включены.

Локальный эквивалент, изменяющий рабочую копию:

```sh
node tools/prepare-release.mjs alpha
pnpm exec prettier --write .changeset packages/*/package.json packages/*/CHANGELOG.md
pnpm check-versions
```

## Публикация выбранного пакета

После merge release PR выбрать его коммит на `main` и взять версию из manifest:

```sh
git switch main
git pull --ff-only origin main
git tag '@boristype/ws-client@<version-from-manifest>'
git push origin 'refs/tags/@boristype/ws-client@<version-from-manifest>'
```

`<version-from-manifest>` — placeholder, заменяемый настоящей версией.
Для обновлённого MCP сначала публикуется нужный ws-client, затем MCP. Для CLI сначала
bt-ir/ws-client/ws-version, если их версии ещё отсутствуют в npm. Дождаться
успеха предыдущей публикации, а затем пушить тег потребителя.

[Publish npm package](../../.github/workflows/publish-package.yml):

1. Принимает только семь публичных пакетов из allowlist в
   [release.mjs](../../tools/release.mjs), строгую semver без build metadata,
   совпадающую с manifest. Private packages запрещены.
2. Проверяет commit тега, checkout, принадлежность истории `origin/main`
   и совпадение локального tag object с remote. Поддерживаются lightweight и annotated tags.
3. Собирает пакет и workspace dependency closure, запускает доступные package tests.
   Lifecycle scripts выключены; build выполняется явно.
4. Один раз упаковывает `.tgz`, проверяет manifest, build, entry points и верхний
   состав архива. Это не аудит содержимого JS.
5. Проверяет доступность ожидаемых текущих версий внутренних dependencies из packed
   manifest в npm и их tarballs. `workspace:`/`file:` и несовместимые ranges запрещены.
   Устанавливает архив во временный consumer project вместе с required peers
   (совместимыми dev ranges, например TypeScript из quick start), проверяет импорт/справку CLI.
6. Передаёт тот же архив через Actions artifact в отдельный `publish` job,
   сверяет SHA512 с output упаковки, повторяет проверки тега/dependencies.
   Публикует prebuilt `.tgz` через pnpm native OIDC с provenance.

Consumer smoke использует cooldown, trust, overrides, integrity и запрет scripts
из workspace. Только отсутствие неприменимых patches разрешено через
`allowUnusedPatches`: например, ws-client не зависит от saxes. Применимые patches
сохраняются. Это packaging smoke; он не подтверждает работу HCM/C-runtime или
непатченного внешнего TypeScript consumer.

Prerelease идёт в `next`, stable — в `latest`. Публикации одного пакета стоят
в очереди без отмены активного job; разные пакеты независимы.
Старая версия, которая откатила бы channel назад, отклоняется. Это защита внутри
данного CI; внешняя ручная публикация может гоняться с проверкой.

После неясного результата upload helper перечитывает registry и сравнивает SHA512.
Повторная загрузка автоматически не выполняется. Уже существующая версия считается
успешной только при точном совпадении integrity; её dist-tags не меняются.
401/403/429/5xx не трактуются как отсутствие версии. При остановке проверить npm
и повторить **тот же Actions run**; не двигать тег и не перезаписывать версию.
Истёкший artifact потребует повторного запуска всего workflow. Если повторная
сборка дала другой архив для уже опубликованной версии, исследовать причину.

Global `changeset publish`/recursive publish здесь не используются. Теги пушатся
человеком. Для будущего автоматического создания тегов обычный GITHUB_TOKEN
не запустит downstream push workflow; нужны App/PAT или явный dispatch.

## Однократная настройка владельцем

- GitHub secret `RELEASE_PR_TOKEN`: fine-grained PAT только этого repository с
  Contents и Pull requests write. Используется для push preparation branch и PR,
  чтобы события запустили обычный CI. npm credentials ему не нужны.
- GitHub environment `npm`: ограничить release tags, при необходимости включить
  reviewers. Для `@boristype/**` настроить tag ruleset: запретить update/delete,
  разрешить создание ответственным за релизы. Проверка remote — снимок состояния,
  а не атомарный запрет изменения тега во время job.
- В npm настроить trusted publisher **для каждого** package: owner `BorisType`,
  repository `BorisType`, workflow `publish-package.yml`, environment `npm`.
  Явно разрешить direct publish: stage-only trust не подходит этому workflow.
  Проверить срок действия ещё не валидированной конфигурации: по текущей
  документации она истекает через два дня. NPM_TOKEN в штатном CI не нужен.
- GitHub-hosted runner имеет `id-token:write`; публичные repo/packages и
  `repository.url` соответствуют источнику provenance.

Новый package сначала должен существовать в npm для настройки trust. Для bootstrap
владелец скачивает `npm-release` artifact прошедшего package job, сверяет SHA512
из лога и публикует **этот** `.tgz` с собственной npm-аутентификацией. Для alpha:

```sh
pnpm publish /path/to/artifact/package.tgz --no-git-checks --config.ignore-scripts=true --access public --tag next
```

Первая ручная публикация не получает provenance этого OIDC workflow. После создания
package настроить trust и повторить failed publish job: identical integrity даст
skip, следующая версия уже пойдёт через OIDC. Не rebuild/repack для bootstrap.
Если package уже опубликован с другими bytes той же версии, нужна новая версия
через следующий release PR.

## Будущее расширение VS Code

ws-client остаётся обычной npm dependency; исправление клиента попадёт к пользователю
расширения с новым VSIX. Версии расширения независимы от CLI/MCP. Marketplace требует
числовой `major.minor.patch`; prerelease обозначается флагом `vsce --pre-release`,
а не semver suffix. Глобальный Changesets alpha mode нельзя автоматически
распространить на extension manifest. Пока npm находится в alpha, числовая версия
расширения потребует отдельного шага; решение принимается при добавлении пакета.
Нужны проверенный VSIX и отдельный workflow/credentials. Placeholder и VSIX CI нет.

## Основания и проверка

Локальная проверка включает release-helper regressions с настоящим Changesets,
строгой проверкой manifests/lockfile и detached pnpm publish **dry-run**, упаковку
семи публичных пакетов и изолированные consumer installs. Реальная npm/OIDC
публикация и настройки GitHub environment/trust локально не проверяются.
Новый пакет требует обновления allowlist, package checks и npm trust.

Первичные источники, сверены 2026-11-11:

- [Changesets CLI](https://changesets.dev/guide/cli),
  [config](https://changesets.dev/guide/config),
  [prereleases](https://changesets.dev/guide/prereleases),
  [fixed packages](https://changesets.dev/guide/fixed-packages).
- [pnpm pack](https://pnpm.io/cli/pack), [publish](https://pnpm.io/cli/publish),
  [workspace publication](https://pnpm.io/workspaces#publishing-workspace-packages).
  Timeout registry может наступить после принятого upload.
- [npm trusted publishers](https://docs.npmjs.com/trusted-publishers/),
  [npm trust](https://docs.npmjs.com/cli/v11/commands/npm-trust/),
  [provenance](https://docs.npmjs.com/generating-provenance-statements/).
- [GitHub workflow triggering](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow),
  [concurrency](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency).
- [VS Code publication](https://code.visualstudio.com/api/working-with-extensions/publishing-extension),
  [bundling](https://code.visualstudio.com/api/working-with-extensions/bundling-extension).
