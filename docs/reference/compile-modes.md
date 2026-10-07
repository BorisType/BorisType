# Режимы компиляции

## Обзор

bt-ir компилирует TypeScript в одном из трёх режимов:

- **bare** — без общей env/descriptor/property/polyfill инфраструктуры; для runtime и низкоуровневого кода. Обязательные control-flow/parser-safety passes остаются.
- **script** — семантические runtime wrappers для агентов, выборок и других исполняемых объектов, без module export ABI.
- **module** — wrappers плюс собственные require/exports и `__init`; режим по умолчанию.

Ни один режим не гарантирует полную ECMAScript-семантику. `bare` не является
обычным JS emit, а `script`/`module` не добавляют всю стандартную библиотеку.
См. [ограничения BorisType и контракт JS/C runtime](./borisscript-constraints).

## Выбор режима

### Приоритет (от высокого к низкому)

Этот выбор выполняет **btc**. При прямом вызове API bt-ir режим задаётся
`options.mode`; правила по расширению файла и директиве автоматически не применяются.

1. **Директива `/// @bt-mode`** в файле
2. **Расширение `.test.ts`** → script
3. **Импорты исполняемых объектов** → script
4. **Опция CLI `--compile-mode`**

### Директива @bt-mode

Добавьте в начало файла:

```typescript
/// @bt-mode bare

// Этот файл компилируется в режиме bare
export function myFunction() { ... }
```

**Поддерживаемые значения:** `bare`, `script`, `module`

**Использование:**

- Добавляйте перед любыми импортами или кодом
- Используется только первая директива `/// @bt-mode`
- Регистр важен

### Исполняемые объекты

Файлы, импортирующие следующие типы из `@boristype/types`, автоматически используют режим `script`:

- `remoteAction`
- `remoteCollection`
- `systemEventHandler`
- `serverAgent`
- `codeLibrary`
- `statisticRec`

**Пример:**

```typescript
import { remoteAction } from "@boristype/types";

// Автоматически компилируется в режиме script
export const myAction = remoteAction({
  // ...
});
```

## См. также

- [Ограничения BorisScript](./borisscript-constraints)
- [Архитектура IR](https://github.com/BorisType/BorisType/blob/main/ref/architecture/ir-pipeline.md)
- [README bt-ir](https://github.com/BorisType/BorisType/blob/main/packages/bt-ir/README.md)
