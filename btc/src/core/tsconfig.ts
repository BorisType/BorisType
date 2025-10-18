import ts from "typescript";
import { BscCompileOptions } from "..";
import { logger } from "./logger";
import { join } from "node:path";
import { existsSync, writeFileSync } from "node:fs";


export function getTSConfig(cwd: string, project: string = 'tsconfig.json', options: BscCompileOptions): ts.ParsedCommandLine {
  const tsconfigPath = ts.findConfigFile(cwd, ts.sys.fileExists, project);

  if (!tsconfigPath) {
    logger.error(`There is no any configuration files at "${cwd}". Execute npx tsc -init to create a new one.`);
    process.exit(1);
  }

  const { config, error } = ts.readConfigFile(tsconfigPath, ts.sys.readFile);

  if (error) {
    logger.error(error.messageText.toString());
    process.exit(1);
  }

  const configFileContent = ts.parseJsonConfigFileContent(config, ts.sys, './');

  if (configFileContent.errors.length > 0) {
    configFileContent.errors.forEach(x => {
      logger.error(x.messageText.toString());
    });

    process.exit(1);
  }

  return configFileContent;
}

export function generateDefaultTSConfig(cwd: string = process.cwd()): boolean {
  const tsconfigContent = `{
  "compilerOptions": {
    "target": "esnext",
    "module": "esnext",
    "moduleResolution": "Bundler",
    "outDir": "./build/",
    "strict": false,
    "skipLibCheck": true,
    "typeRoots": [
      "node_modules/@wshcmx/types/lib",
      "node_modules/@wshcmx/types/lib/xml"
    ]
  },
  "include": [
    "src/**/*"
  ],
  "exclude": [
    "node_modules"
  ]
}
`;

  const tsconfigPath = join(cwd, 'tsconfig.json');

  if (existsSync(tsconfigPath)) {
    logger.warning('⚠️  tsconfig.json already exists. Skipping generation.');
    return false;
  }

  try {
    writeFileSync(tsconfigPath, tsconfigContent, 'utf8');
    logger.success('Created a new tsconfig.json');
    return true;
  } catch (error) {
    // A 'tsconfig.json' file is already defined at:
    // logger.error('❌ Failed to create tsconfig.json:', error);
    logger.error('❌ Failed to create tsconfig.json');
    throw error;
  }
}