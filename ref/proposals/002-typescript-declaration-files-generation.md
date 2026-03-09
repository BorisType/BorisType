# 002: Генерация TypeScript Declaration Files (.d.ts)

**Дата:** 2026-02-26  
**Статус:** Реализовано (2026-02-27)  
**Связанные компоненты:** bt-cli (compiler.ts)

## Контекст

BorisType использует TypeScript Compiler API для диагностики и type checking, но генерацию JS выполняет через собственный bt-ir pipeline. Ранее компилятор запускался с `noEmit: true` — tsc не генерировал никаких файлов, включая `.d.ts`.

Это означало, что `"declaration": true` в tsconfig.json игнорировался, и библиотеки (runtime, botest-builtins, пользовательские) не могли публиковать типы.

## Решение

Единый `ts.Program` instance используется и для диагностики, и для генерации d.ts, и для bt-ir emit. Ключевая идея — разделение ответственности через compiler options:

| `declaration` в tsconfig | Compiler options                                   | tsc делает                    | bt-ir делает  |
| ------------------------ | -------------------------------------------------- | ----------------------------- | ------------- |
| `false`                  | `noEmit: true`                                     | Только диагностика            | Генерация .js |
| `true`                   | `emitDeclarationOnly: true`, `noEmitOnError: true` | Диагностика + генерация .d.ts | Генерация .js |

Флаг `noEmitOnError: true` гарантирует, что tsc не сгенерирует d.ts при наличии ошибок.

### Реализация в `compile()` (обычная сборка)

```typescript
function buildCompilerOptions(tsOptions: ts.CompilerOptions): ts.CompilerOptions {
  return {
    ...tsOptions,
    noEmitOnError: true,
    ...(tsOptions.declaration ? { emitDeclarationOnly: true } : { noEmit: true }),
  };
}
```

```typescript
const compilerOptions = buildCompilerOptions(tsConfig.options);
const program = ts.createProgram(fileNames, compilerOptions);
const diagnostics = ts.getPreEmitDiagnostics(program);

// 1. JS через bt-ir
const emittedFiles = emitSourceFiles(sourceFiles, program, options, executablePaths);

// 2. d.ts через tsc (noEmitOnError предотвратит emit при ошибках)
if (tsConfig.options.declaration) {
  program.emit();
}
```

### Реализация в `createWatchProgram()` (watch mode)

Те же `buildCompilerOptions()` передаются в `ts.createWatchCompilerHost`. Поскольку `emitDeclarationOnly: true` установлен на уровне compiler options, стандартный tsc watch emit автоматически генерирует только d.ts файлы. JS по-прежнему эмитится через bt-ir в хуке `afterProgramCreate`.

### Общие хелперы

В ходе рефакторинга выделены:

- `buildCompilerOptions()` — формирование compiler options (общее для compile и watch)
- `filterUserSourceFiles()` — фильтрация declaration/node_modules файлов
- `emitSourceFiles()` — bt-ir emit цикл (ранее дублировался)

## Рассмотренные альтернативы

### Две Program instance

Создавать отдельный `ts.Program` с `emitDeclarationOnly` для d.ts. Отклонено — лишний overhead по памяти и времени, один program справляется.

### Custom writeFile в program.emit()

Передавать custom `writeFile` callback, фильтрующий только d.ts. Не нужно — `emitDeclarationOnly` делает то же самое нативно.

### Внешний tsc процесс

Запускать `tsc --emitDeclarationOnly` как subprocess. Отклонено — spawn overhead, сложная интеграция с watch mode, дублирование парсинга конфигурации.

## Поддерживаемые tsconfig.json опции

```json
{
  "compilerOptions": {
    "declaration": true, // ✅ включает генерацию .d.ts
    "declarationMap": true, // ✅ генерирует .d.ts.map
    "stripInternal": true, // ✅ скрывает @internal из .d.ts
    "declarationDir": "./types" // ✅ отдельная директория для .d.ts
  }
}
```

`emitDeclarationOnly` переопределяется bt-cli автоматически — пользователю не нужно его указывать.

## Статус тестирования

- [x] `btc build` с `"declaration": true` — d.ts генерируются корректно
- [ ] `btc dev` (watch mode) — d.ts в watch mode
- [ ] Linking — копирование d.ts в dist/
- [ ] Multi-package — типы между пакетами

## Ссылки

- [compiler.ts](../../packages/bt-cli/src/core/building/compiler.ts) — реализация
- [TypeScript Handbook - Declaration Files](https://www.typescriptlang.org/docs/handbook/declaration-files/introduction.html)
