# Режимы компиляции

## Обзор

bt-ir компилирует TypeScript в одном из трёх режимов:
- **bare** — минимальный, для runtime, критических секций без семантических преобразований
- **script** — полная поддержка функциональности, режим для работы агентов, выборок и других исполняемых объектов
- **module** — полная поддержка функциональности, режим по умолчанию для всех модулей

## Выбор режима

### Приоритет (от высокого к низкому)

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
