# Архитектура конвейера сборки

## Обзор

BuildPipeline оркестрирует компиляцию TypeScript, копирование файлов и watch mode.

**Расположение:** [btc/src/core/building/](../../btc/src/core/building/)

## Компоненты

```
building/
├── index.ts             — BuildPipeline facade
├── compiler.ts          — TypeScript compilation via bt-ir
├── files.ts             — Копирование не-TS файлов
├── coordinator.ts       — DevCoordinator для мультипакетных проектов
├── compile-mode.ts      — Определение CompileMode
└── types.ts             — TypeScript типы
```

## Архитектура

```
┌────────────────┐
│ BuildPipeline  │ Facade
└────────┬───────┘
         │
         ├──> compile() ──> bt-ir compileSourceFile()
         ├──> copyFiles() ─> Не-TS файлы в build/
         └──> watch() ─────> ts.createWatchProgram + chokidar
```

## API BuildPipeline

### run() - Однократная сборка

```typescript
const result = await BuildPipeline.run(packagePath, options);
```

**Процесс:**

1. Загрузка tsconfig.json
2. Создание TypeScript Program
3. Получение диагностики (ошибки/предупреждения)
4. Компиляция каждого SourceFile через bt-ir
5. Копирование не-TS файлов (assets, .json и т.д.)
6. Запись .executables.json при необходимости
7. Возврат BuildResult со списком emittedFiles

### watch() - Watch Mode

```typescript
await BuildPipeline.watch(packagePath, options, onChange);
```

**Процесс:**

1. Создание ts.createWatchProgram (noEmit: true)
2. Настройка chokidar для не-TS файлов
3. При изменении TypeScript:
   - Получение изменённых SourceFiles
   - Компиляция через bt-ir (инкрементальный Program)
   - Вызов onChange(emittedFiles)
4. При изменении не-TS файла:
   - Копирование файла в build/
   - Вызов onChange([changedFile])

**Важно:** Использует `noEmit: true` в watch program, затем отдельный инкрементальный Program для emit.

## Определение CompileMode

**Расположение:** [compile-mode.ts](../../btc/src/core/building/compile-mode.ts)

### Приоритет

1. **Директива `/// @bt-mode`** в файле (высший)
2. **Расширение `.test.ts`** → script
3. **Импорт executable объектов** → script
4. **CLI опция `--compile-mode`** (низший)

### Определение Executable объектов

Проверяет импорты из `@boristype/types`:

```typescript
const EXECUTABLE_OBJECTS = new Set([
  "remoteAction",
  "remoteCollection",
  "systemEventHandler",
  "serverAgent",
  "codeLibrary",
  "statisticRec",
]);
```

Если найдено → устанавливает CompileMode в `script`

Генерирует `.executables.json`:

```json
{
  "myAction.js": "remoteAction",
  "myHandler.js": "systemEventHandler"
}
```

### Парсинг директив

```typescript
/// @bt-mode bare
/// @bt-mode script
/// @bt-mode module
```

Первая строка, начинающаяся с `/// @bt-mode`, побеждает.

## DevCoordinator - Мультипакетная координация

**Расположение:** [coordinator.ts](../../btc/src/core/building/coordinator.ts)

### Назначение

Координирует сборку для monorepo с несколькими пакетами.

### Рабочий процесс

```
Start Dev Mode
  │
  ├─> Запуск watch для каждого пакета (параллельно)
  │    └─> BuildPipeline.watch()
  │
  ├─> Ожидание начальной сборки (все пакеты)
  │    └─> Отслеживание завершения через Promise.all
  │
  ├─> Выполнение полной линковки
  │    └─> LinkingPipeline.link()
  │
  ├─> Начальный push (если включён)
  │    └─> DeploySession.push()
  │
  └─> Отслеживание изменений
       │
       ├─> Пакет пересобран (инкрементально)
       ├─> Инкрементальная линковка (только изменённые файлы)
       └─> Debounced push (500мс)
```

### Фильтрация пакетов

Отслеживаются только пакеты с:

- Полем `ws:package` в package.json
- НЕ library тип

```typescript
const packagesToWatch = packages.filter((pkg) => pkg.wsPackage !== undefined && pkg.type !== "library");
```

### Инкрементальная линковка

После начальной сборки:

- Только изменённые файлы из BuildResult.emittedFiles
- Пропуск копирования node_modules (уже сделано)
- Быстрая relink (~10x быстрее)

## File Watching

### TypeScript Files

Uses `ts.createWatchProgram`:

```typescript
const host = ts.createWatchCompilerHost(
  tsconfig.path,
  { noEmit: true }, // No emit in watch program
  ts.sys,
  createProgram,
  reportDiagnostic,
);

const watchProgram = ts.createWatchProgram(host);
```

**On change:**

1. Watch program reports changed files
2. Create incremental Program (for emit only)
3. Compile changed SourceFiles via bt-ir
4. Return emittedFiles

### Non-TypeScript Files

Uses chokidar:

```typescript
const watcher = chokidar.watch("src/**/*", {
  ignored: ["**/*.ts", "**/*.tsx"],
});

watcher.on("change", (path) => {
  copyFile(path, buildDir);
  onChange([path]);
});
```

**Watched:**

- .json (except tsconfig)
- .js (if any)
- .bs (BorisScript)
- Assets (images, etc.)

## Интеграция с bt-ir

Каждый SourceFile компилируется через:

```typescript
import { compileSourceFile } from "bt-ir";

const result = compileSourceFile(sourceFile, program, {
  compileMode: resolveCompileMode(sourceFile, options),
  cwd: packagePath,
});

// result.outputs[0].code → запись в build/
```

**CompileMode**, переданный в bt-ir, определяет:

- bare: минимальный вывод
- script: env/desc + polyfills
- module: \_\_init обёртка

## Build Result

```typescript
interface BuildResult {
  success: boolean;
  diagnostics: ts.Diagnostic[];
  emittedFiles: string[]; // Относительные пути
  executables?: ExecutablesMap; // Содержимое .executables.json
}
```

**emittedFiles** используются для инкрементальной линковки.

## Авто-Push в Dev Mode

Использует `DebouncedPushQueue` из pushing модуля:

```typescript
const queue = new DebouncedPushQueue(deploySession, 500);

coordinator.on("linked", () => {
  queue.schedulePush(distPath, btconfig);
});
```

**Debounce:** Множество быстрых изменений → один push через 500мс

**Постоянная сессия:** Одна DeploySession на весь dev mode

## Обработка ошибок

### Ошибки компиляции

- Логируются через ts.formatDiagnostic
- Сборка продолжается (частичный emit)
- BuildResult.success = false

### Ошибки копирования файлов

- Логируются как warning
- Сборка продолжается
- Отсутствующие файлы не в emittedFiles

### Ошибки отслеживания

- Ошибки Program → report diagnostic
- Ошибки файловой системы → лог-warning
- Отслеживание продолжается

## Оптимизации производительности

### Инкрементальная компиляция

- Инкрементальный режим TypeScript
- Перекомпилируются только изменённые файлы
- Повторное использование результатов проверки типов

### Селективное копирование

- Копируются только изменённые файлы
- node_modules копируются один раз (начальная сборка)
- Glob-паттерны кешируются

### Параллельные сборки

- Мультипакетные сборки выполняются параллельно
- Компиляция отдельных файлов параллелизуема (будущее)

## Конфигурация

### tsconfig.json

BuildPipeline учитывает:

- `compilerOptions.outDir` (но переопределяет на build/)
- `include` / `exclude` паттерны
- Список `files`

### Build Options

```typescript
interface BuildOptions {
  compileMode?: "bare" | "script" | "module";
  watch?: boolean;
  incremental?: boolean;
}
```

## Файлы

| Файл                                                           | Назначение           | Строк |
| -------------------------------------------------------------- | -------------------- | ----- |
| [index.ts](../../btc/src/core/building/index.ts)               | BuildPipeline facade | ~150  |
| [compiler.ts](../../btc/src/core/building/compiler.ts)         | TS compilation       | ~200  |
| [files.ts](../../btc/src/core/building/files.ts)               | Копирование файлов   | ~100  |
| [coordinator.ts](../../btc/src/core/building/coordinator.ts)   | DevCoordinator       | ~300  |
| [compile-mode.ts](../../btc/src/core/building/compile-mode.ts) | Определение режима   | ~150  |

## См. также

- [Руководство: Dev Mode](../../docs/guides/dev-mode.md)
- [Архитектура системы Push](push-system.md)
- [Архитектура IR Pipeline](ir-pipeline.md)
- [Внутреннее устройство Linking](linking-internals.md)
