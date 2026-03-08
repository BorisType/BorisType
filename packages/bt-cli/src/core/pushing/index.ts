/**
 * Модуль push — загрузка dist на WSHCM сервер и reinit модулей
 *
 * Основные экспорты:
 * - `processPush()` — one-shot push (создаёт сессию, выполняет push, закрывает)
 * - `DeploySession` — persistent сессия для dev mode
 * - Утилиты для конфигурации и сбора init-скриптов
 *
 * @module core/pushing
 */

import * as path from 'path';
import * as fs from 'fs';
import { logger } from '../logger';
import { resolvePushConnectionOptions } from './config';
import { DeploySession } from './session';
import type { PartialPushConnectionOptions } from './types';

/**
 * Выполняет one-shot push: загрузка dist + reinit модулей
 *
 * Создаёт DeploySession, выполняет push и закрывает сессию.
 * Для persistent использования (dev mode) используйте DeploySession напрямую.
 *
 * @param cwd - директория проекта
 * @param cliOptions - опции подключения из CLI (опциональные)
 */
export async function processPush(
  cwd: string,
  cliOptions: PartialPushConnectionOptions = {}
): Promise<void> {
  const options = resolvePushConnectionOptions(cwd, cliOptions);

  logger.info(`🚀 Pushing dist to WSHCM server...`);
  logger.info(`📡 Server: ${options.https ? 'https' : 'http'}://${options.host}:${options.port}`);
  logger.info(`👤 User: ${options.username}`);

  const distPath = path.join(cwd, 'dist');
  if (!fs.existsSync(distPath) || !fs.lstatSync(distPath).isDirectory()) {
    throw new Error(`Папка dist не найдена по пути: ${distPath}`);
  }

  const session = new DeploySession(options);
  try {
    await session.initialize();
    await session.push(distPath);
    logger.info('🎉 Push completed successfully!');
  } finally {
    await session.close();
  }
}

// Re-exports
export { DeploySession } from './session';
export { resolvePushConnectionOptions, parseBtConfigProperties } from './config';
export { uploadDist } from './upload';
export { reinitModules } from './reinit';
export {
  collectComponentInitScripts,
  collectStandaloneInitScripts,
  resolveXLocalPath,
  extractOnInitFromXml,
  findOnInit,
} from './init-scripts';
export type {
  PushConnectionOptions,
  PartialPushConnectionOptions,
  InitScript,
} from './types';
