# @boristype/eslint-plugin

ESLint плагин с кастомными правилами для разработки на BorisType/BorisScript.

## Описание

Плагин проверяет выбранные ограничения исходного TypeScript для целевого BorisScript.
Это консервативный subset: частичный compiler lowering классов не означает, что
recommended rules разрешают их. Успех ESLint не доказывает семантическую
корректность output или совместимость C-runtime. Развитие script/module заморожено;
[актуальный контракт](https://boristype.github.io/BorisType/reference/borisscript-constraints).

## Установка

```bash
npm install --save-dev @boristype/eslint-plugin eslint @typescript-eslint/parser
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

| Правило                                                                                                                                  | Описание                                   | Рекомендовано    |
| ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | ---------------- |
| [no-async-await](https://github.com/BorisType/BorisType/blob/main/packages/eslint-plugin/docs/rules/no-async-await.md)                   | Запрещает async/await                      | ✅               |
| [no-break-in-try-finally](https://github.com/BorisType/BorisType/blob/main/packages/eslint-plugin/docs/rules/no-break-in-try-finally.md) | Устаревший компилятор: jumps через finally | Нет (deprecated) |
| [no-generators](https://github.com/BorisType/BorisType/blob/main/packages/eslint-plugin/docs/rules/no-generators.md)                     | Запрещает генераторы и yield               | ✅               |
| [no-prototype](https://github.com/BorisType/BorisType/blob/main/packages/eslint-plugin/docs/rules/no-prototype.md)                       | Запрещает prototype в любом виде           | ✅               |
| [no-class-declaration](https://github.com/BorisType/BorisType/blob/main/packages/eslint-plugin/docs/rules/no-class-declaration.md)       | Запрещает объявление классов               | ✅               |

## Разработка

Package содержит build и README; подробные rule pages доступны по GitHub-ссылкам
выше. Встроенный `configs.recommended` использует legacy plugins array; для flat
config используйте явную регистрацию, показанную выше.

### Сборка

```bash
pnpm run build
```

### Тестирование

```bash
pnpm test
```
