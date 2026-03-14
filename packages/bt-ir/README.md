# bt-ir

**IR-based компилятор TypeScript → BorisScript**

bt-ir — бэкенд компиляции для [BorisType](../README.md), транспилирующий TypeScript в BorisScript через промежуточное представление (IR).

## Обзор

- **Вход:** TypeScript исходный код
- **Выход:** BorisScript (.js файлы)
- **Метод:** TypeScript AST → IR (Intermediate Representation) → BorisScript

**Зачем IR?** Проще, легче поддерживать и корректнее, чем предыдущий подход на основе трансформеров.

## Установка

```bash
npm install bt-ir
```

## API

### compile(sourceCode, options?)

Компилирует строку TypeScript исходного кода.

```typescript
import { compile } from "bt-ir";

const result = compile(
  `
  const greet = (name: string) => {
    alert(\`Hello, \${name}!\`);
  };
  greet("World");
`,
  {
    filename: "test.ts",
    mode: "script",
  },
);

console.log(result.outputs[0].code);
```

**Параметры:**

- `sourceCode: string` — TypeScript код для компиляции
- `options?: CompileOptions` — Опции компиляции

**Возвращает:** `CompileResult`

### compileFile(filePath, options?)

Компилирует TypeScript файл.

```typescript
import { compileFile } from "bt-ir";

const result = compileFile("./src/index.ts", {
  mode: "module",
});

console.log(result.outputs[0].code);
```

**Параметры:**

- `filePath: string` — Путь к TypeScript файлу
- `options?: CompileOptions` — Опции компиляции

**Возвращает:** `CompileResult`

### compileSourceFile(sourceFile, program, options?)

Компилирует TypeScript SourceFile (для интеграции с существующим TypeScript Program).

```typescript
import ts from "typescript";
import { compileSourceFile } from "bt-ir";

const program = ts.createProgram(["src/index.ts"], {});
const sourceFile = program.getSourceFile("src/index.ts")!;

const result = compileSourceFile(sourceFile, program, {
  mode: "module",
});

console.log(result.outputs[0].code);
```

**Параметры:**

- `sourceFile: ts.SourceFile` — TypeScript SourceFile для компиляции
- `program: ts.Program` — Экземпляр TypeScript Program
- `options?: CompileOptions` — Опции компиляции

**Возвращает:** `CompileResult`

## Типы

### CompileOptions

```typescript
interface CompileOptions {
  /** Режим компиляции: bare, script или module */
  mode?: "bare" | "script" | "module";

  /** Имя исходного файла (для функции compile()) */
  filename?: string;

  /** Путь выходного файла (для compileSourceFile) */
  outputPath?: string;

  /** Дополнительные опции (fileKey, currentFileJs для script/module) */
}
```

### CompileResult

```typescript
interface CompileResult {
  /** Результаты компиляции (обычно один файл) */
  outputs: CompileOutput[];

  /** Диагностика TypeScript (ошибки/предупреждения) */
  diagnostics: ts.Diagnostic[];

  /** Флаг успеха */
  success: boolean;
}
```

### CompileOutput

```typescript
interface CompileOutput {
  /** Путь к выходному файлу (относительно входного) */
  path: string;

  /** Сгенерированный BorisScript код */
  code: string;

  /** Source map (если включено) */
  map?: string;
}
```

## Режимы компиляции

bt-ir поддерживает три режима компиляции:

| Режим      | Назначение                           | Возможности                                    |
| ---------- | ------------------------------------ | ---------------------------------------------- |
| **bare**   | Runtime polyfills, встроенные модули | Минимальный вывод, нет bt.\* обёрток           |
| **script** | Тестовые файлы, executable объекты   | Полные возможности с bt.getProperty, polyfills |
| **module** | Codelibrary пакеты (по умолчанию)    | Обёрнуто в \_\_init(), hoisting переменных     |

См. [Справка по режимам компиляции](../docs/reference/compile-modes.md) для деталей.

## Примеры

### Базовое использование

```typescript
import { compile } from "bt-ir";

const result = compile(`
  function add(a: number, b: number): number {
    return a + b;
  }
  
  const result = add(2, 3);
  alert(result);
`);

if (result.success) {
  console.log(result.outputs[0].code);
}
```

### С конкретным режимом

```typescript
import { compile } from "bt-ir";

// Bare mode - минимальный overhead
const bareResult = compile(
  `
  export function fastHash(str: string): number {
    return str.length;
  }
`,
  { mode: "bare" },
);

// Script mode - полные возможности
const scriptResult = compile(
  `
  const obj = { foo: "bar" };
  alert(obj.foo);
`,
  { mode: "script" },
);

// Module mode - codelibrary
const moduleResult = compile(
  `
  export function greet(name: string) {
    alert("Hello " + name);
  }
`,
  { mode: "module" },
);
```

### Интеграция с TypeScript Watch

```typescript
import ts from "typescript";
import { compileSourceFile } from "bt-ir";

const host = ts.createWatchCompilerHost(
  "tsconfig.json",
  { noEmit: true }, // TypeScript только для диагностики
  ts.sys,
  ts.createProgram,
  (diagnostic) => console.log(diagnostic.messageText),
);

const originalAfterProgramCreate = host.afterProgramCreate;
host.afterProgramCreate = (program) => {
  originalAfterProgramCreate?.(program);

  // Emit через bt-ir
  for (const sourceFile of program.getSourceFiles()) {
    if (!sourceFile.isDeclarationFile) {
      const result = compileSourceFile(sourceFile, program);
      // Записать result.outputs[0].code на диск
    }
  }
};

ts.createWatchProgram(host);
```

## Архитектура

```
TypeScript Source
      ↓
[TypeScript Parser]  ← TypeScript Compiler API
      ↓
[Scope Analyzer]     ← Анализ captured переменных
      ↓
[IR Lowering]        ← Преобразование TS AST → IR
      ↓
[IR Passes]          ← try-finally desugar, hoist
      ↓
[BT Emitter]         ← Генерация BorisScript
      ↓
BorisScript Output
```

Для детальной архитектуры, см.:

- [Архитектура IR Pipeline](../ref/architecture/ir-pipeline.md)
- [Ограничения BorisScript](../docs/reference/borisscript-constraints.md)

## Ключевые возможности

### Автоматические трансформации

- **Стрелочные функции** → Обычные функции с env/desc
- **Шаблонные литералы** → Конкатенация строк
- **for...of** → for...in (массивы BorisScript)
- **let/const** → var с hoisting
- **Замыкания** → цепочка \_\_env для captured переменных
- **Доступ к свойствам** → bt.getProperty() (script/module mode)
- **Вызовы методов** → bt.callFunction() (script/module mode)

### Polyfills

Автоматическое внедрение polyfill для:

- Методы массивов: map, filter, reduce, forEach, ...
- Методы строк: split, trim, substring, ...
- Методы чисел: toFixed, toString, ...

### Анализ Scope

- Обнаруживает captured переменные в замыканиях
- Генерирует минимальную цепочку \_\_env
- Правильный variable hoisting

## CLI (Разработка)

bt-ir включает CLI для тестирования:

```bash
# После сборки
npm run build
node build/cli.js path/to/file.ts

# С выводом в файл
node build/cli.js path/to/file.ts -o output.js
```

## Разработка

```bash
# Установить зависимости
npm install

# Собрать
npm run build

# Запустить тесты
npm test

# Разработка
npm run build && node build/cli.js path/to/your/file.ts
```

## Структура проекта

```
bt-ir/
├── src/
│   ├── index.ts          # Public API
│   ├── pipeline/         # Конвейер компиляции
│   ├── analyzer/         # Анализ scope
│   ├── ir/               # Определения IR нод
│   ├── lowering/         # Трансформация TS AST → IR (statements/, expressions/)
│   ├── passes/           # IR → IR (try-finally desugar, hoist)
│   └── emitter/          # Генерация IR → BorisScript
├── build/                # Скомпилированный вывод
└── README.md             # Этот файл
```

## Версия TypeScript

Требуется TypeScript 5.0+

## Лицензия

MIT

## См. также

- [Основной проект BorisType](../)
- [Компилятор btc](../btc/)
- [Справка по режимам компиляции](../docs/reference/compile-modes.md)
- [Ограничения BorisScript](../docs/reference/borisscript-constraints.md)
- [Архитектура IR Pipeline](../ref/architecture/ir-pipeline.md)
