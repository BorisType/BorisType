# Режимы компиляции

## Текущий статус поддержки

С 2026-11-05 поддерживаемое направление разработки — **bare**. Развитие
**script/module приостановлено** до решения стратегии памяти на C: сильные
циклы environment/descriptor/receiver удерживаются reference counting без
сборщика циклов (по сообщению пользователя). Реализации и regression tests
остаются; эти режимы доступны как экспериментальные.

Default `module` и правила автоматического выбора `script` пока сохранены.
Для bare выбирайте режим явно: `btc build --compile-mode bare`, либо директива
`/// @bt-mode bare`, имеющая приоритет над `.test.ts`/executable detection.
Bare не добавляет общую эмуляцию closures/modules/polyfills и не гарантирует
освобождение пользовательских циклов или platform handles.
См. [контракт памяти](./borisscript-constraints#память-и-граница-поддержки) и
[ADR](https://github.com/BorisType/BorisType/blob/main/refs/decisions/2026-11-05-script-module-memory-freeze.md).

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

**Распознаваемые значения:** `bare`, `script`, `module` (статус развития см. выше)

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
- [Архитектура IR](https://github.com/BorisType/BorisType/blob/main/refs/archive/compiler/architecture/ir-pipeline.md)
- [README bt-ir](https://github.com/BorisType/BorisType/blob/main/packages/bt-ir/README.md)
