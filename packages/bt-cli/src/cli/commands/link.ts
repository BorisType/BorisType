import { processLinking, type LinkingOptions } from '../../core/linking/index';

/**
 * Опции команды link
 */
export interface LinkCommandOptions {
  /** Очистить dist и кэш перед линковкой */
  clean?: boolean;
  /** Не использовать кэш (но не удалять его) */
  noCache?: boolean;
  /** Режим линковки system пакетов */
  linkingSystemAs?: 'standalone' | 'component';
  /** Пропустить линковку system-пакетов (runtime управляется извне) */
  externalRuntime?: boolean;
}

/**
 * Команда link - компоновка модулей и зависимостей
 * Собирает все необходимые модули в директорию dist
 * 
 * @param options - Опции команды
 */
export async function linkCommand(options: LinkCommandOptions = {}): Promise<void> {
  const linkingOptions: LinkingOptions = {
    clean: options.clean,
    noCache: options.noCache,
    systemLinkMode: options.linkingSystemAs ?? 'component',
    externalRuntime: options.externalRuntime,
  };
  
  await processLinking(linkingOptions);
}
