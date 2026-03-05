/**
 * Reinit модулей на WSHCM сервере
 * 
 * Собирает init-скрипты из dist и выполняет их через evaluator.
 * 
 * @module core/pushing/reinit
 */

import { Evaluator } from '@boristype/ws-client';
import { logger } from '../logger';
import { collectComponentInitScripts, collectStandaloneInitScripts } from './init-scripts';
import type { InitScript } from './types';

/**
 * Выполняет reinit модулей на сервере
 * 
 * 1. Собирает init-скрипты из компонентов и standalone модулей
 * 2. Сбрасывает кеш require (`bt.init_require()`)
 * 3. Выполняет каждый init-скрипт
 * 
 * Ошибки отдельных init-скриптов логируются, но не прерывают процесс.
 * Lifecycle evaluator-а управляется вызывающим кодом.
 * 
 * @param evaluator - инициализированный evaluator
 * @param distPath - путь к папке dist
 */
export async function reinitModules(evaluator: Evaluator, distPath: string): Promise<void> {
  logger.info('🔄 Collecting init scripts...');

  const initScripts: InitScript[] = [];

  // 1. Компоненты (первыми, исключая bt-runtime)
  const componentScripts = collectComponentInitScripts(distPath).filter(
    (script) => script.name !== 'bt-runtime'
  );
  initScripts.push(...componentScripts);

  // 2. Standalone модули из api_ext.xml
  const standaloneScripts = collectStandaloneInitScripts(distPath);
  initScripts.push(...standaloneScripts);

  if (initScripts.length === 0) {
    logger.info('ℹ️ No init scripts found');
    return;
  }

  // Вывод найденных скриптов
  logger.info(`📜 Found ${initScripts.length} init script(s):`);
  for (const script of initScripts) {
    logger.info(`\n${'─'.repeat(60)}`);
    logger.info(`📦 [${script.type}] ${script.name}`);
    logger.info(`${'─'.repeat(60)}`);
    console.log(script.code);
  }
  logger.info(`\n${'─'.repeat(60)}`);

  // Сброс кеша require
  await evaluator.evalCode("bt.init_require();\nreturn;");

  // Выполнение init скриптов
  for (const script of initScripts) {
    logger.info(`⚙️ Executing init for [${script.type}] ${script.name}...`);
    try {
      await evaluator.evalCode(script.code + "\nreturn;");
      logger.info(`✅ Successfully executed init for ${script.name}`);
    } catch (error) {
      logger.error(`❌ Error executing init for ${script.name}: ${(error as Error).message}`);
    }
  }
}
