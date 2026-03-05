/**
 * CLI модуль btc
 * Реэкспорт команд и типов
 */
export {
  initCommand,
  buildCommand,
  linkCommand,
  artifactCommand,
  devCommand,
  pushCommand,
} from './commands';

// Реэкспорт типов для обратной совместимости
export type { BtcCompileOptions, BtcConfiguration } from '../core/building/types';
export type { PushCommandOptions } from '../core/pushing/types';
