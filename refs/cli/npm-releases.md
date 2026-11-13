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

Каждый release tag отправлять отдельным `git push`. GitHub не создаёт `push`
events, если одновременно отправлено больше трёх тегов: успешный push пяти тегов
на этом workflow не запустил ни одной публикации. Не использовать `git push --tags`
или общий push большого набора refs. После каждого push проверить появление
Actions run. [Ограничение GitHub](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#push).

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
   До обращения к publish endpoint сохраняет artifact с intent: package/version,
   SHA512, source commit и номер попытки. Публикует prebuilt `.tgz` через pnpm native
   OIDC с provenance; ожидание доступности внутри `pnpm publish` отключено.
7. Отдельный `verify` job без `id-token:write` до 30 минут ждёт точную версию
   в install metadata и скачивает её tarball. Проверяет размер и SHA512
   скачанных bytes против исходного artifact, включая уже опубликованные версии.
   Metadata и tarball могут появиться в разное время. Пересборки и upload здесь нет.

Consumer smoke использует cooldown, trust, overrides, integrity и запрет scripts
из workspace. Только отсутствие неприменимых patches разрешено через
`allowUnusedPatches`: например, ws-client не зависит от saxes. Применимые patches
сохраняются. Это packaging smoke; он не подтверждает работу HCM/C-runtime или
непатченного внешнего TypeScript consumer.

Prerelease идёт в `next`, stable — в `latest`. Публикации одного пакета стоят
в очереди без отмены активного job; разные пакеты независимы.
Старая версия, которая откатила бы channel назад, отклоняется. Это защита внутри
данного CI; внешняя ручная публикация может гоняться с проверкой.

## Задержки npm и ручное восстановление

npm может принять upload до доступности пакета: официальное описание
[publish-time scanning](https://github.blog/changelog/2026-07-28-npm-publish-time-malware-scanning-and-dual-use-metadata/)
указывает обычно около пяти минут, иногда 15 минут и больше, без SLA.
Это возможная причина задержки; по одному 404 нельзя определить статус сканирования,
ручной проверки или отказа конкретного пакета. При валидации первых trusted publishers
upload был принят, но наш `--publish-wait-timeout=120000` неоднократно истекал.
Две минуты и дополнительные шесть lookup с паузами по пять секунд оказались недостаточны.

Теперь чтение registry имеет общий deadline 30 минут, backoff 5–30 секунд
и ограничение длительности каждого HTTP-запроса оставшимся временем.
Сетевые сбои, 408, 429 и 5xx повторяются; учитывается `Retry-After`.
401/403, некорректные metadata и несовпадение архива завершают проверку сразу.
Tarball должен оставаться на том же registry origin; redirects не принимаются.
Истечение deadline означает «доступность не подтверждена; upload мог быть принят».
Проверка не становится успешной только из-за принятого upload.

Для восстановления использовать **Re-run failed jobs** того же Actions run:

| Где произошёл сбой                                                                                  | Что делает повторный запуск                                                 |
| --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Build, tests или readiness зависимостей до upload                                                   | Повторяет незавершённые проверки; upload ещё не разрешён                    |
| `verify` после принятого или неизвестного результата upload                                         | Повторяет только чтение registry и проверку исходного архива                |
| `publish`, версия уже видна с тем же integrity                                                      | Пропускает upload, затем скачивает и проверяет архив; dist-tags не меняет   |
| `publish`, прежний intent есть, но результата нет или он неизвестен                                 | Только проверяет доступность: runner мог завершиться после принятия upload  |
| npm явно отклонил PUT                                                                               | Разрешает новую попытку для этого пакета после повторных preflight проверок |
| Evidence отсутствует после начавшегося upload, истёк, повреждён или относится к другим bytes/commit | Останавливается; требует исследования состояния npm                         |

Распознавание явного отказа ограничено диагностикой `ERR_PNPM_FAILED_TO_PUBLISH`
закреплённого pnpm: HTTP 400/401/403/413/422 для точного package/version.
Контракт этой диагностики проверяется настоящим pnpm против локального HTTP fixture.
Conflict, 5xx, потеря ответа и остальные неоднозначные ошибки не разрешают повторный upload.
Intent сохраняется **до** побочного эффекта; result — отдельным artifact даже при отказе.
При восстановлении helper также смотрит историю upload step, чтобы удалённый artifact
не выглядел как доказательство отсутствия предыдущей попытки. После download сверяет
полноту восстановленных receipts с исходным списком: частичный download не разрешает upload.

Архив и receipts хранятся 30 дней — в пределах поддерживаемого GitHub окна rerun.
Полный rerun может повторить сборку, но receipts и опубликованная integrity должны
совпасть с полученными bytes; при отличии требуется исследование, а не новый upload.
Не удалять evidence для обхода защиты, не двигать тег и не перезаписывать версию.
Если неизвестная попытка так и не появилась, сначала выяснить её исход в npm;
отсутствие версии само по себе не разрешает повторную загрузку.

Единица восстановления остаётся отдельным package workflow. Исправить упавшие
публикации зависимостей, затем повторить workflows потребителей; успешно
проверенные пакеты повторно отправлять не нужно. Проверка всех требуемых внутренних
dependencies использует одно общее окно ожидания, затем smoke устанавливает consumer.
Перед upload readiness dependencies проверяется повторно. Helper не создаёт их теги
и не запускает их публикацию автоматически.

Изменение workflow применяется к новым release commits. GitHub rerun сохраняет
исходные `GITHUB_SHA`/`GITHUB_REF`, поэтому старый run не получает новый helper
просто после merge этого исправления в main.

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

Проверки восстановления используют локальный HTTP server для metadata/tarball,
управляемое время для многоминутных задержек, настоящие receipt files и отдельный
ограниченный запуск pnpm с фиктивной аутентификацией на localhost. Они не публикуют
пакеты в npm и не подтверждают причину задержки конкретной production-публикации.

Первичные источники, сверены 2026-11-11:

- [Changesets CLI](https://changesets.dev/guide/cli),
  [config](https://changesets.dev/guide/config),
  [prereleases](https://changesets.dev/guide/prereleases),
  [fixed packages](https://changesets.dev/guide/fixed-packages).
- [pnpm pack](https://pnpm.io/cli/pack), [publish](https://pnpm.io/cli/publish),
  [workspace publication](https://pnpm.io/workspaces#publishing-workspace-packages).
  Timeout registry может наступить после принятого upload.
- [npm publish-time scanning](https://github.blog/changelog/2026-07-28-npm-publish-time-malware-scanning-and-dual-use-metadata/)
  и [rerun semantics GitHub](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/re-run-workflows-and-jobs),
  дополнительно сверены 2026-11-13.
- [npm trusted publishers](https://docs.npmjs.com/trusted-publishers/),
  [npm trust](https://docs.npmjs.com/cli/v11/commands/npm-trust/),
  [provenance](https://docs.npmjs.com/generating-provenance-statements/).
- [GitHub workflow triggering](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow),
  [concurrency](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency).
- [VS Code publication](https://code.visualstudio.com/api/working-with-extensions/publishing-extension),
  [bundling](https://code.visualstudio.com/api/working-with-extensions/bundling-extension).
