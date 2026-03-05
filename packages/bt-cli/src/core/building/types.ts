/**
 * Типы для Build Pipeline
 * @module build/types
 */

import type ts from 'typescript';

/**
 * Информация об исполняемом объекте, найденном в исходном файле
 */
export type ExecutableObjectSourceFileInfo = {
  packageName: string;
  packageVersion: string;
  filePath: string;
};

// ─── Compile options ────────────────────────────────────────────

/** Режим транспиляции: bare | script | module */
export type CompileMode = 'bare' | 'script' | 'module';

/**
 * Опции компиляции btc
 */
export type BtcCompileOptions = {
  /** Директория для сохранения обработанных файлов */
  outDir?: string;
  /** Обрабатывать файлы, не являющиеся TypeScript */
  includeNonTsFiles?: boolean;
  /** Сохранять не-ASCII символы в исходных файлах */
  retainNonAsciiCharacters?: boolean;
  /** Удалять комментарии из исходных файлов */
  removeComments?: boolean;
  /** Режим транспиляции (default: module). bare — для системных библиотек. */
  compileMode?: CompileMode;
};

/**
 * Полная конфигурация для btc
 */
export type BtcConfiguration = {
  /** Конфигурация TypeScript */
  tsConfig: ts.ParsedCommandLine;
  /** Конфигурация btconfig.json (опционально) */
  btConfig?: any;
  /** Опции компиляции */
  btOptions: BtcCompileOptions;
  /** Список файлов для обработки */
  files: string[];
};

/**
 * Режим сборки
 */
export type BuildMode = 'single' | 'watch';

/**
 * Контекст сборки - хранит состояние между компиляциями
 * В watch mode переиспользуется между инкрементальными сборками
 */
export interface BuildContext {
  /** Режим сборки */
  readonly mode: BuildMode;
  /** Конфигурация TypeScript */
  readonly tsConfig: ts.ParsedCommandLine;
  /** Опции btc */
  readonly options: BtcCompileOptions;
  /** Список файлов для обработки (пустой = все) */
  readonly files: string[];
  /** Рабочая директория */
  readonly cwd: string;
}

/**
 * Результат сборки
 */
export interface BuildResult {
  /** Успешно ли завершилась сборка */
  readonly success: boolean;
  /** Результат emit от TypeScript */
  readonly emitResult?: ts.EmitResult;
  /** Информация об исполняемых объектах */
  readonly executables: ExecutableObjectSourceFileInfo[];
  /** Диагностика (ошибки и предупреждения) */
  readonly diagnostics: readonly ts.Diagnostic[];
  /** Время сборки в миллисекундах */
  readonly duration: number;
  /** Список emitted файлов (абсолютные пути в build/) — для инкрементальной линковки */
  readonly emittedFiles: string[];
}

/**
 * Опции для создания контекста
 */
export interface CreateContextOptions {
  /** Конфигурация TypeScript */
  tsConfig: ts.ParsedCommandLine;
  /** Опции btc */
  options: BtcCompileOptions;
  /** Список файлов для обработки */
  files?: string[];
  /** Режим сборки */
  mode?: BuildMode;
  /** Рабочая директория (по умолчанию process.cwd()) */
  cwd?: string;
}

/**
 * Создаёт контекст сборки
 */
export function createBuildContext(opts: CreateContextOptions): BuildContext {
  return {
    mode: opts.mode ?? 'single',
    tsConfig: opts.tsConfig,
    options: opts.options,
    files: opts.files ?? [],
    cwd: opts.cwd ?? process.cwd(),
  };
}
