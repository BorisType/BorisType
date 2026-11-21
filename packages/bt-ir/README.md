# bt-ir

**IR-based компилятор TypeScript → BorisScript**

bt-ir — бэкенд компиляции для [BorisType](https://github.com/BorisType/BorisType/blob/main/README.md), транспилирующий TypeScript в BorisScript через промежуточное представление (IR).

## Обзор

Поддерживается ограниченный subset TypeScript/JS, не весь ECMAScript.
Актуальные mode-specific ограничения, known miscompilations и отдельные
подтверждения JS/C: [технический контракт](https://github.com/BorisType/BorisType/blob/main/docs/reference/borisscript-constraints.md).

Компилятор использует `bare` по умолчанию.

- **Вход:** TypeScript исходный код
- **Выход:** BorisScript (.js файлы)
- **Метод:** TypeScript AST → IR (Intermediate Representation) → BorisScript

**Зачем IR?** Явные промежуточные формы отделяют TS lowering, target rewrites и emission. Это облегчает проверку; само наличие IR не гарантирует JS equivalence.

## Установка

```bash
pnpm add @boristype/bt-ir typescript@^6.0.3
```

## API

### compile(sourceCode, options?)

Компилирует строку TypeScript исходного кода.

```typescript
import { compile } from "@boristype/bt-ir";

const result = compile(
  `
  const greet = (name: string) => {
    return \`Hello, \${name}!\`;
  };
  greet("World");
`,
  {
    filename: "test.ts",
    mode: "bare",
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
import { compileFile } from "@boristype/bt-ir";

const result = compileFile("./src/index.ts", {
  mode: "bare",
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
import { compileSourceFile } from "@boristype/bt-ir";

const program = ts.createProgram(["src/index.ts"], {});
const sourceFile = program.getSourceFile("src/index.ts")!;

const result = compileSourceFile(sourceFile, program, {
  mode: "bare",
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
  /** Режим компиляции, по умолчанию DEFAULT_COMPILE_MODE */
  mode?: CompileMode;

  /** Имя исходного файла (для функции compile()) */
  filename?: string;

  /** Путь выходного файла (для compileSourceFile) */
  outputPath?: string;
}
```

### CompileResult

```typescript
interface CompileResult {
  /** Результаты компиляции (обычно один файл) */
  outputs: CompileOutput[];

  /** BT diagnostics; compile() также собирает TS diagnostics.
   * compileSourceFile() оставляет TS diagnostics вызывающему consumer. */
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

  /** Source map: поле зарезервировано, генерация пока не реализована */
  map?: string;
}
```

## Режимы компиляции

Доступные значения экспортируются как `COMPILE_MODES`. Параметр `mode`
принимает `CompileMode`. При отсутствии параметра используется
`DEFAULT_COMPILE_MODE` (`bare`).

[Справочник режимов](https://github.com/BorisType/BorisType/blob/main/docs/reference/compile-modes.md).

## Примеры

### Базовое использование

```typescript
import { compile } from "@boristype/bt-ir";

const result = compile(`
  function add(a: number, b: number): number {
    return a + b;
  }
  
  const result = add(2, 3);
  result;
`);

if (result.success) {
  console.log(result.outputs[0].code);
}
```

### С конкретным режимом

```typescript
import { compile } from "@boristype/bt-ir";

// Bare mode - минимальный overhead
const bareResult = compile(
  `
  export function fastHash(str: string): number {
    return str.length;
  }
`,
  { mode: "bare" },
);
```

### Интеграция с TypeScript Watch

```typescript
import ts from "typescript";
import { compileSourceFile } from "@boristype/bt-ir";

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
[IR Passes]          ← structured abrupt completions, hoist
      ↓
[BT Emitter]         ← Генерация BorisScript
      ↓
BorisScript Output
```

Для детальной архитектуры, см.:

- [Текущая карта и основания](https://github.com/BorisType/BorisType/blob/main/refs/compiler/README.md)
- [Ограничения BorisScript](https://github.com/BorisType/BorisType/blob/main/docs/reference/borisscript-constraints.md)

## Ключевые возможности

### Автоматические трансформации

- Стрелочные функции преобразуются в обычные функции.
- Шаблонные литералы преобразуются в конкатенацию строк.
- `for...of` по массиву преобразуется в нативный `for...in` по значениям.
- `let` и `const` эмитятся как `var`.
- Метки и `try-finally` преобразуются общим IR-проходом.
- Catch binding получает уникальное физическое имя.

### Анализ Scope

- Обнаруживает captured переменные в замыканиях
- Вычисляет env chain для реализованных captured-binding путей
- Выполняет variable hoisting; это не полная TDZ/const semantics

### Labels и finalizers

Поддерживаются synchronous labelled statements, chained labels и
`return/throw/break/continue` через вложенные finalizers. Generated output не
содержит labels или native `finally`. Catch patterns пока отклоняются с BT90016;
Annex B labelled functions — с BT90017. Произвольные thrown values сохраняют
ограничения платформы, а iterator closing и async/generators не добавляются.

`tryFinallyDesugarPass` — deprecated alias для `abruptCompletionDesugarPass`.
PassContext теперь требует shared `bindings: BindingManager`. Пользовательские
pipeline должны запускать `forUpdateDesugarPass` перед unified pass, затем
parenthesize/hoist. Comma-операторы в for updates обходятся через first-entry
`while` без helper calls, с сохранением update после continue/finalizers и перед
условием. Simple updates не меняются. Emitter отклоняет surviving comma updates.

`runPasses` проверяет обязательную dependency на `for-update-desugar`, включая
deprecated alias; при прямых вызовах `.run()` порядок обеспечивает вызывающий
код. После новых Error diagnostics manager не запускает последующие passes,
а обе compile entrypoints возвращают `success: false` и пустой `outputs`.
Resolver сообщает каждую ошибку target/duplicate label отдельно с BT90018 и
диапазоном исходника; при отсутствии source/loc диагностика positionless.
`createBtDiagnosticAtLocation` доступен для других IR consumers. Общий
`containsCommaOperator` экспортируется из `ir/index`; старый pass-module export
сохранён как deprecated re-export.

Execution gates обязательны перед merge compiler changes: см.
[pre-merge checklist](https://github.com/BorisType/BorisType/blob/main/refs/research/compiler-control-flow/probes/README.md#обязательный-pre-merge-gate).

Проверка: `pnpm --filter @boristype/bt-ir test`; строгая Node/BS матрица из корня
monorepo: `pnpm test:semantic` (нужны build runtime/botest и предоставленный
`packages/botest/build/borisscript/main.js`). C probe генерируется в
`packages/bt-ir/build/semantic/BtAbruptProbe.js`; ожидается `OK: 60/60`.
Для ограниченной по шагам проверки исправленного check27:
`node packages/bt-ir/test/semantic/check27-diagnostic.mjs`, затем запустить
`packages/bt-ir/build/semantic/Check27Fixed.js` на C, ожидается `0FU1FU2FU|E`.

Оба результата вручную подтверждены пользователем на C 2026-10-07. Это 60
выбранных случаев bare на зафиксированной ревизии. Версия C-платформы не предоставлена.

### Проверка выражений

`pnpm test:expressions` сравнивает результаты Node и BorisScript для каталога
выражений. Конкретный случай выбирается через `--case control-plain-order`, режим
через `--mode bare`. Runner требует предоставленный JS runtime. Исходник, oracle,
IR, output и метрики записываются в `build/semantic/expressions`.

## Разработка и CLI

Из корня checkout, после установки Node/pnpm из project pins:

```sh
pnpm install --frozen-lockfile
pnpm exec turbo run build
pnpm --filter @boristype/bt-ir test
node packages/bt-ir/build/cli.js path/to/file.ts -o output.js
```

[Карта реализации и причины решений](https://github.com/BorisType/BorisType/blob/main/refs/compiler/README.md),
[prerequisites и смысл verification gates](https://github.com/BorisType/BorisType/blob/main/refs/compiler/verification.md).
Сборка не предоставляет vendor runtime. При изменении TS semantics проверяется
поведение и output; один unit test не заменяет native evidence.

## Структура проекта

```
bt-ir/
├── src/
│   ├── index.ts          # Public API
│   ├── pipeline/         # Конвейер компиляции
│   ├── analyzer/         # Анализ scope
│   ├── ir/               # Определения IR нод
│   ├── lowering/         # Трансформация TS AST → IR (statements/, expressions/)
│   ├── passes/           # IR → IR (abrupt completions, target resolver, hoist)
│   └── emitter/          # Генерация IR → BorisScript
├── build/                # Скомпилированный вывод
└── README.md             # Этот файл
```

## Версия TypeScript

Используется TypeScript 6 Compiler API; точный peer range — в [package.json](package.json). TypeScript 7 не является совместимой заменой API.

## Лицензия

MIT

## См. также

- [Основной проект BorisType](..)
- [Компилятор btc](https://github.com/BorisType/BorisType/tree/main/packages/bt-cli)
- [Справка по режимам компиляции](https://github.com/BorisType/BorisType/blob/main/docs/reference/compile-modes.md)
- [Ограничения BorisScript](https://github.com/BorisType/BorisType/blob/main/docs/reference/borisscript-constraints.md)
- [Текущая карта и основания](https://github.com/BorisType/BorisType/blob/main/refs/compiler/README.md)
