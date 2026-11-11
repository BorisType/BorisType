# @boristype/bt-cli

CLI `btc` компилирует ограниченное подмножество TypeScript в BorisScript для
WebSoft HCM. Он не гарантирует полную JS/npm-совместимость.

Текущее направление разработки — **bare**; `script/module` заморожены до решения
стратегии памяти C-runtime. Реализации и regression tests сохранены.
**Default CLI остаётся `module`**: выбирайте bare явно.
[Режимы и ограничения](https://boristype.github.io/BorisType/reference/compile-modes).

## Установка и первая сборка

Нужен Node.js >=24 и TypeScript 6 Compiler API:

```sh
npm install -D @boristype/bt-cli @boristype/types typescript@^6.0.3
npx btc init
```

`init` создаёт только отсутствующий `tsconfig.json`. Добавьте `src/index.ts`:

```typescript
/// @bt-mode bare
var message = "Hello from BorisType";
alert(message);
```

```sh
npx btc build --compile-mode bare
```

Сгенерированный BorisScript находится в `build/` при настройках `init`; он
предназначен для целевой платформы, не обычного Node.js. Bare не предоставляет
общую эмуляцию closures/modules/polyfills. Полное руководство:
[быстрый старт](https://boristype.github.io/BorisType/guides/getting-started).

## CLI-команды

| Команда                | Действие                                                     |
| ---------------------- | ------------------------------------------------------------ |
| `btc init`             | Создать tsconfig, не трогая существующий                     |
| `btc build`            | Компиляция по tsconfig; ресурсы с `--include-non-ts-files`   |
| `btc link --clean`     | Собрать готовые пакеты в dist, очистив старые dist/cache     |
| `btc artifact --clean` | Один artifact/main.zip со всем dist, включая components      |
| `btc push`             | Загрузить готовый dist и выполнить initialization на HCM     |
| `btc dev --no-push`    | Watch/build/link локально; без этого флага auto-push включён |

`link/dev/push` обслуживают существующий экспериментальный module pipeline;
для него отдельно устанавливается совместимый `@boristype/runtime`.
У `dev` нет `--compile-mode`; директива файла выше CLI default.
`link`/`push`/`artifact` не компилируют пакеты автоматически.
Сборка может оставить partial/stale output: проверяйте diagnostics/exit status.
После удаления исходников очистите старые файлы build перед `link --clean`.

[Линковка и кэш](https://boristype.github.io/BorisType/guides/linking),
[watch ограничения](https://boristype.github.io/BorisType/guides/dev-mode),
[push/HTTPS configuration](https://boristype.github.io/BorisType/guides/push-deploy).
Все зарегистрированные flags: `npx btc <command> --help`.

## Разработка CLI

[Внутренняя архитектура и причины](https://github.com/BorisType/BorisType/blob/main/refs/cli/README.md).
В checkout используйте Node/pnpm из root pins, `pnpm install --frozen-lockfile`
и `pnpm exec turbo run build`. Package README не требует наличия этого checkout
для установки опубликованного CLI.
