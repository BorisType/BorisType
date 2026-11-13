# Changesets

Добавляйте changeset через `pnpm exec changeset` для пользовательских изменений
публичных пакетов. CLI/runtime/eslint-plugin остаются fixed group, остальные
публичные npm-пакеты версионируются независимо.

Общий release PR готовится вручную запущенным `prepare-release.yml` с каналом
alpha/stable. После merge каждый пакет публикуется отдельным package-version tag.
Полная инструкция: [подготовка и публикация npm-релизов](../refs/cli/npm-releases.md).
В ней описаны fixed group и влияние dependencies, выбор patch/minor/major,
alpha/stable и next/latest, проверка release PR, порядок отправки тегов,
ручное восстановление и настройка нового пакета. Сам changeset и merge release PR
ничего не публикуют; опубликованные версии повторно поднимать для rerun не нужно.
