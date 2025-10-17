import fs from 'node:fs';
import path, { dirname, normalize, relative, resolve } from 'node:path';
import ts from 'typescript';
import { logger } from './logger.js';
import { BscCompileOptions } from '../index.js';
import * as babel from '@babel/core';

import { namespacesTransformer } from '../transformers/namespaces.js';
import { enumsToObjectsTransformer } from '../transformers/enumsToObjects.js';
import arrayFunctionalTransformer from '../transformers/arrayFunctional.js';
import arrayGeneralTransformer from '../transformers/arrayGeneral.js';
import stringTransformer from '../transformers/string.js';
import { mathTransformer } from '../transformers/math.js';

interface EmittedFile {
  fileName: string;
  content: string;
}

export function buildTypescriptFiles(configuration: ts.ParsedCommandLine, options: BscCompileOptions): ts.EmitResult | undefined {
  const program = ts.createProgram(configuration.fileNames, configuration.options);
  const host = ts.createCompilerHost(program.getCompilerOptions());

  // Store emitted files in memory for Babel processing
  const emittedFiles: EmittedFile[] = [];

  // Override host.writeFile to capture output instead of writing to disk
  const originalWriteFile = host.writeFile;
  host.writeFile = (fileName: string, text: string, writeByteOrderMark: boolean, onError?: (message: string) => void, sourceFiles?: readonly ts.SourceFile[], data?: ts.WriteFileCallbackData) => {
    if (fileName.endsWith('.js') || fileName.endsWith('.jsx') || fileName.endsWith('.mjs')) {
      emittedFiles.push({ fileName, content: text });
    } else {
      originalWriteFile.call(host, fileName, text, writeByteOrderMark, onError, sourceFiles);
    }
  };

  // Decorate program emit
  const emitResult = decorateProgramEmit(host, program);

  // Log diagnostics
  const diagnostics = [
    ...ts.getPreEmitDiagnostics(program),
    ...(emitResult?.diagnostics || []),
  ];

  diagnostics.forEach(diagnostic => {
    if (diagnostic.file) {
      const { line, character } = ts.getLineAndCharacterOfPosition(diagnostic.file, diagnostic.start!);
      const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
      logger.error(`${diagnostic.file.fileName} (${line + 1},${character + 1}): ${message}`);
    } else {
      logger.error(ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'));
    }
  });

  // console.log('cwd:', process.cwd());
  // console.log('__dirname:', __dirname);

  const babelConfig = {
    presets: [
      [
        require.resolve("@babel/preset-env"),
        {
          targets: "defaults",
          modules: false
        }
      ]
    ],
    plugins: [
      require.resolve("@babel/plugin-transform-numeric-separator"),
      require.resolve("@babel/plugin-transform-logical-assignment-operators"), // не уверен насчет этого
      require.resolve("@babel/plugin-transform-nullish-coalescing-operator"), // TODO: Убрать $ из названия переменной
      require.resolve("@babel/plugin-transform-optional-chaining"), // TODO: нужная вещь но надо подумать
      require.resolve("@babel/plugin-transform-exponentiation-operator"), // TODO: у нас нет Math.pow
      [require.resolve("@babel/plugin-transform-template-literals"), { "loose": true }], // concat нам не подходит, используем +
      // require.resolve("@babel/plugin-transform-literals"), // TODO: не уверен как ведет себя BS и нотацией \u и когда литерал вставлен напрямую
      require.resolve("@babel/plugin-transform-function-name"), // в BS нельзя анонимные функции
      require.resolve("@babel/plugin-transform-arrow-functions"), // TODO: назначать рандомные имена??
      require.resolve("@babel/plugin-transform-shorthand-properties"),
      path.resolve(__dirname, "../plugins/forOfToForIn.js"), // for-of to for-in
      require.resolve("@babel/plugin-transform-unicode-escapes"), // TODO: не уверен как ведет себя BS и нотацией \u и когда литерал вставлен напрямую
      path.resolve(__dirname, "../plugins/spreadArray.js"), // transform-spread-array
      path.resolve(__dirname, "../plugins/spreadObject.js"), // transform-spread-object
      // // path.resolve(__dirname, "../plugins/myPlugin.js" // transform-destructuring

      // require.resolve("@babel/plugin-transform-destructuring"),
      path.resolve(__dirname, "../plugins/destructuring.js"), // TODO throwNotSupported

      require.resolve("@babel/plugin-transform-block-scoping"),
      path.resolve(__dirname, "../plugins/replaceDollar.js"), // удаляет $ из названий переменных
      path.resolve(__dirname, "../plugins/loopHoistVariables.js"), // loopHoisting
      path.resolve(__dirname, "../plugins/removeImportExport.js") // let/const to var
    ],
    sourceMaps: configuration.options.sourceMap, // Enable source maps if TypeScript is configured to use them
    cwd: process.cwd(),
  }

  // Process emitted JavaScript files with Babel
  for (const emittedFile of emittedFiles) {
    try {
      const babelResult = babel.transformSync(emittedFile.content, {
        filename: emittedFile.fileName,
        ...babelConfig,
      });

      if (babelResult?.code) {
        let fileName = emittedFile.fileName;
        let code = babelResult.code;

        // Add spxml inline form tag
        if (code.indexOf('/// @xml-init') !== -1) {
          code = `<?xml version="1.0" encoding="UTF-8"?>\n<SPXML-INLINE-FORM>\n\t<OnInit PROPERTY="1" EXPR="\n${code.split('\n').map(line => "\t\t" + line).join('\n')}\n\t"/>\n</SPXML-INLINE-FORM>`;
          fileName = fileName.replace('.js', '.xml');
        }

        // Add aspnet render tag
        if (code.indexOf('/// @html') !== -1) {
          code = `<%\n${code}\n%>`;
          fileName = fileName.replace('.js', '.html');
        }

        if (options.retainNonAsciiCharacters !== true) {
          // Decode non ASCII characters
          code = code.replace(/\\u[\dA-Fa-f]{4}/g, (match) => {
            return String.fromCharCode(parseInt(match.substr(2), 16));
          });
        }

        code = '\uFEFF' + code;

        // Write the Babel-transformed code to the output file
        originalWriteFile.call(host, fileName, code, false, undefined, undefined);

        // // If source maps are enabled, write the source map
        // if (babelResult.map && configuration.options.sourceMap) {
        //   originalWriteFile.call(host, `${emittedFile.fileName}.map`, JSON.stringify(babelResult.map), false, undefined, undefined);
        // }
      } else {
        logger.warning(`Babel transformation skipped for ${emittedFile.fileName}`);
      }
    } catch (error) {
      // Type guard for error.message
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Babel transformation error for ${emittedFile.fileName}: ${errorMessage}`);
    }
  }

  return emitResult;
}

export function buildNonTypescriptFiles(configuration: ts.ParsedCommandLine, options: BscCompileOptions) {
  if (options.includeNonTsFiles === false) {
    return;
  }

  const { rootDir, outDir } = configuration.options;
  const entries = collectNonTypescriptFiles(configuration);

  entries.forEach(x => {
    const filePath = rootDir ? relative(rootDir, x) : x;
    const outputFilePath = resolve(outDir!, filePath);
    fs.mkdirSync(dirname(outputFilePath), { recursive: true });
    fs.writeFileSync(outputFilePath, fs.readFileSync(resolve(x), 'utf-8'));
  });
}

export function collectNonTypescriptFiles(configuration: ts.ParsedCommandLine) {
  const { outDir } = configuration.options;

  if (outDir === undefined) {
    throw new Error('The outDir option is not set in the tsconfig.json file.');
  }

  if (process.versions.node.split('.')[0] < '22') {
    throw new Error('The watch mode for non TypeScript files is available only since Node.js v22');
  }

  const { exclude, files, include } = configuration.raw;
  const fileNames = configuration.fileNames.map(normalize);
  const normalizedExclude = (exclude ?? []).map(normalize);

  // console.log(fileNames)
  // console.log(normalizedExclude)

  return fs.globSync([...(include ?? []), ...(files ?? [])])
    .map(x => { console.log(x); return x })
    .filter(x => !fileNames.includes(x))
    .filter(x => !normalizedExclude?.includes(x))
    .filter(x => fs.statSync(x).isFile());
}

function reportDiagnostic(diagnostic: ts.Diagnostic) {
  if (diagnostic.file) {
    const { line, character } = ts.getLineAndCharacterOfPosition(diagnostic.file, diagnostic.start!);
    const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
    logger.error(`${diagnostic.file.fileName} (${line + 1},${character + 1}): ${message}`);
  } else {
    logger.error(ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'));
  }
}

function decorateHostWriteFile(host: ts.CompilerHost, options: BscCompileOptions) {
  const originalWriteFile = host.writeFile;

  host.writeFile = (fileName, data, writeByteOrderMark, onError, sourceFiles) => {
    if (fileName.endsWith('.js')) {
      // Convert namespaces
      if (data.indexOf('"META:NAMESPACE:') !== -1) {
        fileName = fileName.replace('.js', '.bs');
      }

      // Add aspnet render tag
      if (data.indexOf('/// @html') !== -1) {
        data = `<%\n// <script>\n${data}\n%>`;
        fileName = fileName.replace('.js', '.html');
      }

      if (options.retainNonAsciiCharacters !== true) {
        // Decode non ASCII characters
        data = data.replace(/\\u[\dA-Fa-f]{4}/g, (match) => {
          return String.fromCharCode(parseInt(match.substr(2), 16));
        });
      }
    }

    originalWriteFile(fileName, data, writeByteOrderMark, onError, sourceFiles);
  };
}

function decorateProgramEmit(host: ts.CompilerHost, program?: ts.SemanticDiagnosticsBuilderProgram | ts.Program) {
  return program?.emit(undefined, host.writeFile, undefined, undefined, {
    before: [
      enumsToObjectsTransformer(),
      arrayFunctionalTransformer(program as ts.Program),
      arrayGeneralTransformer(program as ts.Program),
      stringTransformer(program as ts.Program),
      mathTransformer(),
      namespacesTransformer(),
    ],
  });
}

// function reportWatchStatusChanged(diagnostic: ts.Diagnostic) {
//   console.info(ts.formatDiagnostic(diagnostic, {
//     getCanonicalFileName: path => path,
//     getCurrentDirectory: ts.sys.getCurrentDirectory,
//     getNewLine: () => ts.sys.newLine,
//   }));
// }

// export function watchTypescriptFiles(configuration: ts.ParsedCommandLine) {
//   const host = ts.createWatchCompilerHost(
//     configuration.fileNames,
//     configuration.options,
//     ts.sys,
//     ts.createEmitAndSemanticDiagnosticsBuilderProgram,
//     reportDiagnostic,
//     reportWatchStatusChanged
//   );

//   const origCreateProgram = host.createProgram;

//   host.createProgram = (rootNames: ReadonlyArray<string> = [], options, host, oldProgram) => {
//     decorateHostWriteFile(host!);
//     const program = origCreateProgram(rootNames, options, host, oldProgram);
//     decorateProgramEmit(host!, program);
//     return program;
//   };

//   ts.createWatchProgram(host);
// }

// export function watchNonTypescriptFiles(configuration: ts.ParsedCommandLine) {
//   if (!args.has(ArgsFlags.INCLUDE_NON_TS_FILES)) {
//     return;
//   }

//   const { rootDir, outDir } = configuration.options;
//   const entries = collectNonTypescriptFiles(configuration);

//   entries.forEach(x => {
//     const filePath = rootDir ? relative(rootDir, x) : x;
//     const outputFilePath = resolve(outDir!, filePath);

//     fs.watch(resolve(x), (event: fs.WatchEventType) => {
//       if (event == 'change') {
//         fs.mkdirSync(dirname(outputFilePath), { recursive: true });
//         fs.writeFileSync(outputFilePath, fs.readFileSync(resolve(x), 'utf-8'));
//         logger.success(`🔨 ${new Date().toLocaleTimeString()} File ${x} has been changed`);
//       }
//     });
//   });
// }