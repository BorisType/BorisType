# @boristype/eslint-plugin

ESLint плагин с кастомными правилами для разработки на BorisType/BorisScript.

## Описание

BorisScript — это ограниченное подмножество JavaScript с собственными ограничениями платформы. Этот плагин помогает выявлять неподдерживаемые конструкции ещё на этапе написания TypeScript-кода, до транспиляции.

## Установка

```bash
npm install --save-dev @boristype/eslint-plugin
```

## Конфигурация

### Flat Config (ESLint 9+)

```js
// eslint.config.js
import boristypePlugin from "@boristype/eslint-plugin";
import tsParser from "@typescript-eslint/parser";

export default [
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parser: tsParser,
    },
    plugins: {
      "@boristype": boristypePlugin,
    },
    rules: {
      "@boristype/no-async-await": "error",
      "@boristype/no-generators": "error",
      "@boristype/no-prototype": "error",
      "@boristype/no-class-declaration": "error",
    },
  },
];
```

## Правила

| Правило                                                            | Описание                         | Рекомендовано |
| ------------------------------------------------------------------ | -------------------------------- | ------------- |
| [no-async-await](./docs/rules/no-async-await.md)                   | Запрещает async/await            | ✅            |
| [no-break-in-try-finally](./docs/rules/no-break-in-try-finally.md) | break/continue в try с finally   | ⚠️ warn       |
| [no-generators](./docs/rules/no-generators.md)                     | Запрещает генераторы и yield     | ✅            |
| [no-prototype](./docs/rules/no-prototype.md)                       | Запрещает prototype в любом виде | ✅            |
| [no-class-declaration](./docs/rules/no-class-declaration.md)       | Запрещает объявление классов     | ✅            |

## Разработка

### Сборка

```bash
pnpm run build
```

### Тестирование

```bash
pnpm test
```
