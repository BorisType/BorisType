/**
 * Сбор информации об исполняемых объектах (executables) из пакетов
 * 
 * @module linking/executables
 */

import * as fs from 'fs';
import * as path from 'path';
import { ExecutableObjectSourceFileInfo } from '../building/types.js';
import { UrlAppenPath } from './utils/url.js';
import { PackageInfo, LinkingContext } from './types.js';
import { addExecutable } from './context.js';

/**
 * Собирает executables из .executables.json пакета
 * и регистрирует их в контексте линковки
 */
export function collectExecutables(pkgInfo: PackageInfo, ctx: LinkingContext): void {
  const executablesPath = path.join(pkgInfo.sourceDir, '.executables.json');
  
  if (!fs.existsSync(executablesPath)) {
    return;
  }

  const executablesData: ExecutableObjectSourceFileInfo[] = JSON.parse(
    fs.readFileSync(executablesPath, 'utf-8')
  );

  for (const exec of executablesData) {
    const fileKey = `${exec.packageName}+${exec.packageVersion}+${exec.filePath}`;
    const fileAbsoluteUrl = UrlAppenPath(
      pkgInfo.rootUrl, 
      exec.filePath.replace(/\.ts$/, '.js').substring(exec.filePath.indexOf('/'))
    );
    addExecutable(ctx, fileKey, fileAbsoluteUrl);
  }
}
