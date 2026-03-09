# CI/CD Template для BorisType monorepo

> Шаблон для будущего `.github/workflows/ci.yml`.
> Пока CI не настроен — сохраняем здесь для быстрого подключения.

## GitHub Actions Workflow

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  build-and-test:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout
        uses: actions/checkout@v4
        # with:
        #   submodules: recursive  # раскомментировать если добавим @boristype/types как submodule

      - name: Setup pnpm
        uses: pnpm/action-setup@v4
        with:
          version: 9

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Check dependency versions
        run: pnpm run lint:deps

      - name: Build all packages
        run: pnpm run build

      - name: Run tests
        run: pnpm run test

      # Проверка что changesets добавлены при изменении публикуемых пакетов
      - name: Check changesets
        if: github.event_name == 'pull_request'
        run: pnpm changeset status --since=origin/main
```

## Ключевые моменты

- **Node.js 22+** — требуется для `fs.globSync` и других API
- **pnpm 9** — workspace protocol, strict node_modules
- **`--frozen-lockfile`** — CI не должен менять lockfile
- **Порядок:** install → lint:deps → build → test → changeset status
- **concurrency** — отменяет предыдущие запуски при новых push в тот же PR

## Что добавить позже

- [ ] Кэширование Turborepo (`turbo-cache`)
- [ ] Release workflow с `changeset publish`
- [ ] Matrix testing (разные версии Node.js если нужно)
- [ ] Проверка линковки на примерах
