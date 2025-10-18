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
import { createConfig } from './babel.js';

export function buildTypescriptFiles(configuration: ts.ParsedCommandLine, options: BscCompileOptions): ts.EmitResult | undefined {
  const program = ts.createProgram(configuration.fileNames, configuration.options);
  const host = ts.createCompilerHost(program.getCompilerOptions());

  const babelConfig = createConfig({ sourceMaps: configuration.options.sourceMap, cwd: process.cwd() });

  decorateHostWriteFile(host, options, configuration, babelConfig);
  const emitResult = decorateProgramEmit(host, program);

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

  return fs.globSync([...(include ?? []), ...(files ?? [])])
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

function decorateHostWriteFile(host: ts.CompilerHost, options: BscCompileOptions, configuration: ts.ParsedCommandLine, babelConfig: babel.TransformOptions) {
  const originalWriteFile = host.writeFile;

  host.writeFile = (fileName, text, writeByteOrderMark, onError, sourceFiles, data) => {
    if (fileName.endsWith('.js')) {
      const result = transformWithBabel(text, fileName, babelConfig);

      const transformedContent = result?.code;
      const sourceMap = result?.map;

      if (transformedContent != null && transformedContent !== undefined) {
        const { newFileName, newFileContent } = transformOutput(fileName, transformedContent, options);
        originalWriteFile.call(host, newFileName, newFileContent, writeByteOrderMark, onError, sourceFiles);

        if (sourceMap && configuration.options.sourceMap) {
          originalWriteFile.call(host, `${fileName}.map`, JSON.stringify(sourceMap), writeByteOrderMark, onError, sourceFiles);
        }
      } else {
        logger.warning(`Babel transformation skipped for ${fileName}`);
      }
    } else {
      originalWriteFile.call(host, fileName, text, writeByteOrderMark, onError, sourceFiles);
    }
  };
}


export function transformWithBabel(code: string, fileName: string, babelConfig: babel.TransformOptions): babel.BabelFileResult | null {
  try {
    const babelResult = babel.transformSync(code, {
      filename: fileName,
      ...babelConfig,
    });

    return babelResult;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Babel transformation error for ${fileName}: ${errorMessage}`);

    return null;
  }
}

export function transformOutput(fileName: string, code: string, options: BscCompileOptions) {
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

  return { newFileName: fileName, newFileContent: code };
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