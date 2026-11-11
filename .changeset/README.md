# Changesets

Добавляйте changeset через `pnpm exec changeset` для пользовательских изменений
публичных пакетов. CLI/runtime/eslint-plugin остаются fixed group, остальные
публичные npm-пакеты версионируются независимо.

Общий release PR готовится вручную запущенным `prepare-release.yml` с каналом
alpha/stable. После merge каждый пакет публикуется отдельным package-version tag.
Полный порядок и однократная настройка: [npm-релизы](../refs/cli/npm-releases.md).
