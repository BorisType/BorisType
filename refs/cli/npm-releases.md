# Подготовка и публикация npm-релизов

Один общий PR готовит версии и changelogs через Changesets. Публикация выполняется
отдельно: тег `@boristype/<package>@<version>` выбирает ровно один npm-пакет.
Merge release PR сам по себе ничего не публикует.

Обычный путь: добавить changeset вместе с изменением → merge в `main` → запустить
подготовку версий → проверить и merge release PR → отправить отдельные теги нужных
пакетов в порядке dependencies → дождаться успешного `verify` каждого пакета.
Команды ниже выполняются из корня checkout; shell-примеры используют Bash/Git Bash.

## Группы версий и зависимости

| Пакеты                                   | Версионирование                                     | Поставка                                     |
| ---------------------------------------- | --------------------------------------------------- | -------------------------------------------- |
| bt-cli, runtime, eslint-plugin           | Fixed group, одинаковые номера при подготовке       | Отдельный тег каждого пакета                 |
| mcp-server, ws-client, ws-version, bt-ir | Независимые версии с учётом внутренних dependencies | Отдельный тег каждого пакета                 |
| .NET workspace, tests, examples          | Исключены из npm release                            | Собственные процессы                         |
| Будущее расширение VS Code               | Собственная числовая версия                         | Отдельный VSIX publisher, пока не реализован |

Источник правил — [.changeset/config.json](../../.changeset/config.json).
`fixed` означает, что при включении одного участника в release plan Changesets
синхронизирует версии всей группы. Это существующая стратегия CLI/runtime/ESLint;
она не доказывает совместимость runtime ABI. `linked` в конфигурации пуст.

Независимые пакеты не обязаны получать одинаковые версии между собой или с группой.
При этом Changesets учитывает внутренние зависимости: обновление ws-client может
включить в план его потребителей, в том числе CLI, а через CLI — всю fixed group.
`updateInternalDependencies:patch` разрешает обновлять range внутренней зависимости
уже при её patch-изменении, если потребитель сам входит в release plan. Эта настройка
не требует всегда выпускать всех потребителей; точный состав проверяется в release PR.
Обновление одного пакета не требует вручную поднимать все семь версий.

Группа управляет **версиями в git**, а тег — **публикацией одного пакета**.
Можно подготовить общие версии и опубликовать только MCP и необходимые ему
dependencies, оставив версии CLI/runtime/ESLint для последующей публикации.
Уже существующие версии dependencies повторно публиковать не нужно.
Mixed changesets не нужно разрезать. `changeset version --ignore` поверх
заполненного `config.ignore` не поддерживается текущим Changesets.

Внутренние npm-зависимости текущих пакетов:

| Публикуемый пакет          | Manifest                                                       | Что должно быть доступно в npm до его публикации                                          |
| -------------------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `@boristype/ws-client`     | [ws-client](../../packages/ws-client/package.json)             | Внутренних npm dependencies нет                                                           |
| `@boristype/ws-version`    | [ws-version](../../packages/ws-version/package.json)           | Внутренних npm dependencies нет                                                           |
| `@boristype/bt-ir`         | [bt-ir](../../packages/bt-ir/package.json)                     | Внутренних npm dependencies нет                                                           |
| `@boristype/runtime`       | [builtin-runtime](../../packages/builtin-runtime/package.json) | Внутренних npm dependencies нет; CLI/ws-version нужны для workspace-сборки                |
| `@boristype/eslint-plugin` | [eslint-plugin](../../packages/eslint-plugin/package.json)     | Внутренних npm dependencies нет                                                           |
| `@boristype/mcp-server`    | [mcp-server](../../packages/mcp-server/package.json)           | Подготовленная версия `@boristype/ws-client`                                              |
| `@boristype/bt-cli`        | [bt-cli](../../packages/bt-cli/package.json)                   | Подготовленные версии `@boristype/bt-ir`, `@boristype/ws-client`, `@boristype/ws-version` |

Это разные графы: dev dependency для сборки не требует предварительной публикации
в npm. Например, runtime собирается с workspace CLI, но это не создаёт npm-цикл
публикации CLI ↔ runtime. CI определяет обязательные опубликованные версии по
`dependencies`, `optionalDependencies` и `peerDependencies` упакованного manifest.

В CLI внутренние prod dependencies используют `workspace:*`, который при упаковке
становится точной версией; MCP использует `workspace:^` для ws-client.
Правила workspace ranges закреплены в [.syncpackrc.json](../../.syncpackrc.json).
Publisher проверяет доступность именно текущей подготовленной workspace-версии,
даже если range допускает более старую: одного факта «какая-то версия есть в npm» мало.

При изменении manifests или состава пакетов обновить эту таблицу; источники истины —
manifests, Changesets config и allowlist [release.mjs](../../tools/release.mjs).

## Подготовка общего PR

### 1. Записать изменения пакетов

Для пользовательских изменений публичного пакета добавить обычный changeset
в той же рабочей ветке, где находится изменение:

```sh
pnpm exec changeset
pnpm exec changeset status
```

В интерактивном диалоге выбрать затронутые пакеты и тип изменения:

| Тип     | Когда выбирать                                                                                                                |
| ------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `patch` | Исправление без намеренного несовместимого изменения публичного контракта                                                     |
| `minor` | Новая совместимая возможность                                                                                                 |
| `major` | Намеренно несовместимое изменение; для экспериментальных `0.x` отдельно согласовать ожидаемую версию и проверить release plan |

Текст changeset описывает изменение для пользователя и попадает в changelog.
Например, `.changeset/mcp-query-timeout.md` может содержать:

```markdown
---
"@boristype/mcp-server": patch
---

Correct timeout reporting when an XQuery request is interrupted.
```

Этот файл коммитится вместе с кодом и проходит обычный review. Номер версии вручную
не задаётся: его вычисляет Changesets при подготовке. Исправление внутреннего CI
или документации без изменения поставляемого пакета само по себе не требует
changeset или новой npm-версии. Само создание changeset ничего не публикует.

### 2. Запустить подготовку на main

После merge изменений обновить чистый checkout:

```sh
git switch main
git pull --ff-only origin main
pnpm install --frozen-lockfile
pnpm exec changeset status
```

На `main` запускается [Prepare package releases](../../.github/workflows/prepare-release.yml):

```sh
gh workflow run prepare-release.yml --ref main -f channel=alpha
```

В интерфейсе GitHub это **Actions → Prepare package releases → Run workflow**,
ветка `main`, канал `alpha`. Workflow запускается вручную: обычный push/merge в
`main` автоматически release PR не создаёт. Для наблюдения:

```sh
gh run list --workflow prepare-release.yml --limit 5
gh pr list --base main --state open
```

`alpha` — default: helper явно входит в prerelease mode, если его ещё нет.
Суффикс alpha в manifest сам по себе не включает режим. `stable` выходит
из активного prerelease mode и подготавливает стабильные версии **всех** его участников.
Для намеренного перехода выполнить:

```sh
gh workflow run prepare-release.yml --ref main -f channel=stable
```

Это общее завершение активного prerelease-цикла при подготовке версий, а не команда
«перенести один MCP из next в latest». После merge по-прежнему публикуются только
пакеты, для которых отправлены теги. Следующий `alpha` снова явно входит в prerelease mode.
Состояние prerelease хранится в `.changeset/pre.json`; его не нужно править или
удалять вручную. После завершения цикла файл может отсутствовать. Base version и alpha-счётчик определяет Changesets,
поэтому не стоит вычислять следующий номер простым прибавлением к текущему суффиксу.

Helper обновляет manifests/changelogs и lockfile, затем синхронизирует установку
через frozen install: `pnpm exec` должен работать с `verifyDepsBeforeRun:error`
сразу после изменения версий. Workflow форматирует результат,
проверяет syncpack и открывает обычный PR из уникальной `release/versions-…` ветки.
Следующая подготовка разрешена после merge/закрытия предыдущего PR.
Перед merge проверить состав версий, внутренние dependencies и обычный CI.

### 3. Проверить и merge release PR

Проверить diff manifests, changelogs, `.changeset` state и lockfile:

- новые версии соответствуют изменениям и выбранному prerelease/stable каналу;
- участники fixed group согласованы; неожиданное включение потребителя объясняется dependencies;
- внутренние ranges соответствуют подготовленным версиям; CI и `pnpm check-versions` проходят;
- в PR нет исходных изменений, не относящихся к подготовке релиза.

Merge этого PR фиксирует подготовленные версии в `main`. При отсутствии новых
изменений подготовка может завершиться без release PR; смотреть summary workflow.
Следующий шаг — теги выбранных пакетов. Встроенные workflows не создают GitHub Release
и не отправляют release tags автоматически.

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

После merge release PR выбрать один source commit из истории `main`, содержащий
подготовленные версии; обычно это merge/squash commit release PR.
Все теги одного набора удобно привязывать к нему. Начать из чистого checkout:

```sh
git switch main
git pull --ff-only origin main
release_commit=$(git rev-parse HEAD)
```

Если после release PR в `main` уже появились другие изменения, выбрать нужный
commit явно и читать manifests именно из него. Не ставить теги по версиям
из другой ветки или рабочей копии с неподготовленными изменениями.

Например, для ws-client читать версию непосредственно из выбранного commit:

```sh
package_name='@boristype/ws-client'
package_version=$(git show "$release_commit:packages/ws-client/package.json" | node -p 'JSON.parse(require("node:fs").readFileSync(0, "utf8")).version')
release_tag="$package_name@$package_version"
git ls-remote --tags origin "refs/tags/$release_tag"
```

Если remote tag уже существует, открыть его Actions run и проверить состояние;
существующий tag не перемещать. Если версия новая и тег ещё не создан:

```sh
git tag "$release_tag" "$release_commit"
git push origin "refs/tags/$release_tag"
gh run list --workflow publish-package.yml --limit 10
```

Найти запуск с этим tag. `gh run watch --exit-status` позволяет выбрать run
интерактивно и дождаться результата; тот же запуск доступен в GitHub Actions.
Успех означает прохождение `package`, `publish` и завершающего `verify`.

Для обновлённого MCP сначала публикуется нужный ws-client, затем MCP. Для CLI сначала
bt-ir/ws-client/ws-version, если их версии ещё отсутствуют в npm. Дождаться
успеха предыдущей публикации, а затем пушить тег потребителя.

Для полного набора допустим такой порядок: ws-client → ws-version → bt-ir →
eslint-plugin → runtime → mcp-server → bt-cli. Это один из подходящих порядков;
независимые пакеты могут идти параллельно. Для релиза только MCP достаточно
ws-client, если его подготовленной версии ещё нет в registry, а затем MCP.
Остальным пакетам теги не нужны только из-за того, что они присутствуют в release PR.

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

Версия `0.1.0-alpha.N` и dist-tag `next` — разные сущности: версия неизменяема,
dist-tag указывает на одну из версий. Установка `@boristype/mcp-server@next`
выбирает prerelease-канал; установка без суффикса обычно выбирает `latest`, который
у существующих пакетов alpha-публикация не продвигает. Проверить опубликованные metadata:

```sh
npm view "$package_name@$package_version" version dist.integrity --json --registry=https://registry.npmjs.org
npm view "$package_name" dist-tags --json --registry=https://registry.npmjs.org
```

Эти команды показывают состояние registry; проверку самих bytes выполняет `verify`.
Релиз выбранного набора завершён, когда все нужные package workflows зелёные,
их точные версии доступны для установки и dist-tags соответствуют выбранному каналу.

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

```sh
gh run list --workflow publish-package.yml --limit 20
# Взять RUN_ID нужного упавшего запуска из предыдущей команды:
gh run rerun RUN_ID --failed
gh run watch RUN_ID --exit-status
```

`RUN_ID` здесь заменяется настоящим числовым ID; это существующий run, а не новый tag.

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

Она требуется при подключении репозитория/нового пакета, а не для каждого релиза.
При обычном выпуске не нужно получать npm token или заново настраивать trust.

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

`RELEASE_PR_TOKEN` связывает workflow подготовки с GitHub: он нужен для создания
ветки/PR и запуска CI от этих событий. Публикацию в npm разрешает отдельная
Trusted Publisher связь package ↔ GitHub repository/workflow/environment через OIDC.
Это разные назначения; npm token в `RELEASE_PR_TOKEN` не подходит.

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

При добавлении ещё одного публичного workspace package обновить Changesets config
при необходимости, allowlist и проверки release helper, эту инструкцию и npm trust.
Одного `private:false` в manifest недостаточно для допуска в publisher.

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
  Смысл `fixed` и `updateInternalDependencies` дополнительно сверен 2026-11-13.
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
