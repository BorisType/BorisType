# ADR 004: Инкрементальная линковка для dev mode

**Дата:** 2024-12  
**Статус:** Принято и реализовано ✅

## Контекст

В dev mode при каждом изменении файла происходила полная перелинковка — копирование всей директории `build/` в `dist/`. Это было медленно и неэффективно, особенно для больших проектов.

## Решение

Оптимизировать dev mode: копировать только изменённые файлы вместо всей директории `build/`.

## Текущий flow (было)

```
TS файл изменился → BuildPipeline.watch → emit в build/ → relinkPackage() → копирует ВСЮ build/ в dist/
```

## Новый flow (стало)

```
TS файл изменился → BuildPipeline.watch → emit в build/ (+ emittedFiles) → processPackagesLinking(devMode) → копирует ТОЛЬКО изменённые файлы
```

---

## Реализованные изменения

### 1. Добавить `emittedFiles` в `BuildResult`

**Файл:** `btc/src/core/building/types.ts`

```typescript
interface BuildResult {
  readonly success: boolean;
  readonly emitResult?: ts.EmitResult;
  readonly executables: ExecutableObjectSourceFileInfo[];
  readonly diagnostics: readonly ts.Diagnostic[];
  readonly duration: number;
  /** Список emitted файлов (абсолютные пути в build/) - для инкрементальной линковки */
  readonly emittedFiles: string[];
}
```

### 2. Собирать emittedFiles в compiler.ts

**Файл:** `btc/src/core/building/compiler.ts`

В `createWatchProgram`:

- В `customWriteFile` собирать все записанные `.js` файлы в массив
- Передавать `emittedFiles` в `onRebuild` callback

```typescript
// В afterProgramCreate:
const emittedFiles: string[] = [];

const customWriteFile: ts.WriteFileCallback = (fileName, text, ...) => {
  if (fileName.endsWith('.js')) {
    const { fileName: newFileName, content: newContent } = transformOutput(fileName, text, options);
    ts.sys.writeFile(newFileName, newContent, writeByteOrderMark);
    emittedFiles.push(newFileName);  // <-- собираем
  } else {
    ts.sys.writeFile(fileName, text, writeByteOrderMark);
  }
};

// В onRebuild callback:
onRebuild({
  success: !hasErrors,
  emittedFiles,  // <-- передаём
  // ...
});
```

### 3. Добавить опции в LinkingOptions

**Файл:** `btc/src/core/linking/types.ts`

```typescript
interface LinkingOptions {
  // ... существующие опции

  /** Режим dev (инкрементальная линковка) */
  devMode?: boolean;
  /** Изменённые файлы (абсолютные пути в build/) — только для devMode */
  changedFiles?: string[];
}
```

### 4. Добавить helper `writeIfChanged`

**Файл:** `btc/src/core/linking/utils/write.ts` (новый)

```typescript
/**
 * Записывает файл только если содержимое изменилось
 *
 * @param filePath - Путь к файлу
 * @param content - Новое содержимое
 * @returns true если файл был записан, false если содержимое не изменилось
 */
export function writeIfChanged(filePath: string, content: string): boolean {
  if (fs.existsSync(filePath)) {
    const existing = fs.readFileSync(filePath, "utf-8");
    if (existing === content) {
      return false;
    }
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf-8");
  return true;
}
```

### 5. Изменить линкеры

**Файлы:**

- `btc/src/core/linking/linkers/standalone.ts`
- `btc/src/core/linking/linkers/component.ts`

Добавить логику для `devMode`:

```typescript
link(pkg: PackageInfo, ctx: LinkingContext): LinkedPackage {
  const { devMode, changedFiles } = ctx;

  // 1. Копирование файлов
  if (devMode && changedFiles && changedFiles.length > 0) {
    // Инкрементальное копирование
    for (const srcFile of changedFiles) {
      const relativePath = path.relative(sourceDir, srcFile);
      const dstFile = path.join(fullTargetPath, relativePath);
      fs.mkdirSync(path.dirname(dstFile), { recursive: true });
      fs.copyFileSync(srcFile, dstFile);
    }
  } else {
    // Полное копирование
    copyRecursive(sourceDir, fullTargetPath);
  }

  // 2. node_modules — только при полной линковке
  if (!devMode) {
    copyNodeModulesWithCache(...);
  }

  // 3. Генерация файлов — всегда, но с writeIfChanged
  if (mainFile && !initXmlExists) {
    const initXmlContent = buildInitXml(mainFile, rootUrl);
    if (writeIfChanged(initXmlPath, initXmlContent)) {
      generatedFiles.push('init.xml');
    }
  }

  // 4. .filemap.json — всегда с writeIfChanged
  if (executables.size > 0) {
    const filemapContent = generateFilemapJson(executables);
    if (writeIfChanged(path.join(fullTargetPath, '.filemap.json'), filemapContent)) {
      generatedFiles.push('.filemap.json');
    }
  }
}
```

### 6. Передать devMode в контекст

**Файл:** `btc/src/core/linking/context.ts`

```typescript
interface CreateContextOptions {
  // ... существующие
  devMode?: boolean;
  changedFiles?: string[];
}

interface LinkingContext {
  // ... существующие
  devMode: boolean;
  changedFiles: string[];
}
```

### 7. Изменить dev.ts

**Файл:** `btc/src/cli/commands/dev.ts`

```typescript
onRebuild: (result) => {
  if (result.success) {
    logger.success(`✅ [${pkg.wsName}] Build successful (${result.duration}ms)`);

    // Инкрементальная линковка
    processPackagesLinking(
      projectPath,
      [
        {
          name: pkg.name,
          // source/target определятся автоматически из package.json
        },
      ],
      {
        devMode: true,
        changedFiles: result.emittedFiles,
      },
    );
  }
};
```

---

## Что НЕ делаем (TODO на будущее)

- [ ] Удаление файлов из dist при удалении из src (используем clean build)
- [ ] Отслеживание изменений в library пакетах
- [ ] Инкрементальная загрузка на сервер (пока загружаем всё)

---

## Порядок реализации

1. ✅ `types.ts` — добавить `emittedFiles` в `BuildResult`
2. ✅ `compiler.ts` — собирать и передавать `emittedFiles`
3. ✅ `linking/types.ts` — добавить `devMode`, `changedFiles`
4. ✅ `linking/utils/write.ts` — создать `writeIfChanged`
5. ✅ `linking/context.ts` — расширить контекст
6. ✅ `linkers/standalone.ts` — добавить инкрементальную логику
7. ✅ `linkers/component.ts` — добавить инкрементальную логику
8. ✅ `dev.ts` — использовать новый API
9. ✅ Удалить `relinkPackage` из `linking/index.ts` (больше не нужен)
