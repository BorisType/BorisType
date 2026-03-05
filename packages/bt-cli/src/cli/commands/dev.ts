import * as path from 'path';
import * as fs from 'fs';
import { logger } from '../../core/logger';
import { resolvePackagesToLink } from '../../core/linking/index';
import { getTSConfig } from '../../core/config';
import { BuildPipeline, WatchController } from '../../core/building/index';
import { DeploySession, resolvePushConnectionOptions } from '../../core/pushing/index';
import { DebouncedPushQueue } from '../../core/pushing/queue';
import { DevCoordinator, WatchPackage } from '../../core/building/coordinator';

/**
 * Опции для команды dev (из CLI)
 */
export interface DevCommandOptions {
  /** Включён ли авто-push после линковки (по умолчанию true, отключается через --no-push) */
  push?: boolean;
}

/**
 * Команда dev - режим разработки с watch
 * 
 * Использует TypeScript watch API для инкрементальной компиляции.
 * Координирует сборку и линковку для multi-package проектов:
 * 1. Запускает watch для всех пакетов
 * 2. Ждёт завершения initial build всех пакетов
 * 3. Выполняет полную линковку
 * 4. Переходит в инкрементальный режим
 */
export async function devCommand(options: DevCommandOptions = {}): Promise<void> {
  const projectPath = process.cwd();
  const enablePush = options.push !== false;
  
  logger.info('🔧 Starting dev mode...');
  
  // 1. Получаем пакеты для линковки
  const packages = resolvePackagesToLink(projectPath);
  logger.info(`📦 Found ${packages.length} package(s) to process`);
  
  // 2. Фильтруем только ws:package пакеты (не статический контент)
  const watchPackages = resolveWatchPackages(projectPath, packages);
  
  if (watchPackages.length === 0) {
    logger.warning('⚠️ No ws:package packages found to watch');
    return;
  }
  
  logger.info(`👀 Watching ${watchPackages.length} package(s):`);
  for (const pkg of watchPackages) {
    logger.info(`   - ${pkg.wsName} (${pkg.packageType}) at ${pkg.name}`);
  }
  
  // 3. Создаём координатор
  let pushQueue: DebouncedPushQueue | null = null;
  if (enablePush) {
    logger.info('📤 Auto-push enabled (use --no-push to disable)');
    const connectionOptions = resolvePushConnectionOptions(projectPath);
    logger.info(`📡 Server: ${connectionOptions.https ? 'https' : 'http'}://${connectionOptions.host}:${connectionOptions.port}`);
    const distPath = path.join(projectPath, 'dist');
    const session = new DeploySession(connectionOptions);
    pushQueue = new DebouncedPushQueue(session, distPath);
  }
  const coordinator = new DevCoordinator(projectPath, watchPackages, packages, pushQueue);
  
  // 4. Запускаем watchers для каждого пакета
  logger.info('🔨 Starting initial build...');
  const watchers: WatchController[] = [];
  
  for (const pkg of watchPackages) {
    const watcher = startPackageWatch(pkg, coordinator);
    if (watcher) {
      watchers.push(watcher);
    }
  }
  
  // Обработка graceful shutdown
  process.on('SIGINT', async () => {
    logger.info('\n🛑 Stopping dev mode...');
    for (const w of watchers) {
      w.close();
    }
    if (pushQueue) {
      await pushQueue.close();
    }
    process.exit(0);
  });
}

/**
 * Определяет какие пакеты являются ws:package и могут быть watch-ены
 */
function resolveWatchPackages(
  projectPath: string,
  packages: { name: string; source?: string; target?: string }[]
): WatchPackage[] {
  const result: WatchPackage[] = [];
  
  for (const pkg of packages) {
    const packageDir = pkg.name === '.'
      ? projectPath
      : path.join(projectPath, pkg.name);
    
    const packageJsonPath = path.join(packageDir, 'package.json');
    
    if (!fs.existsSync(packageJsonPath)) {
      // Нет package.json - это статический контент, не watch-им
      continue;
    }
    
    try {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
      const wsPackage = packageJson['ws:package'];
      const wsName = packageJson['ws:name'];
      
      // Только пакеты с ws:package (standalone, component, system)
      if (!wsPackage || !wsName) {
        // Не BT пакет - пропускаем
        continue;
      }
      
      // library пакеты не watch-им напрямую
      if (wsPackage === 'library' || wsPackage === 'lib') {
        continue;
      }
      
      result.push({
        name: pkg.name,
        absolutePath: packageDir,
        wsName,
        packageType: wsPackage,
      });
    } catch (error) {
      logger.warning(`⚠️ Failed to parse package.json in ${pkg.name}: ${error}`);
    }
  }
  
  return result;
}

/**
 * Запускает watch для пакета используя BuildPipeline.watch()
 * 
 * @param pkg - Информация о пакете
 * @param coordinator - Координатор dev mode
 */
function startPackageWatch(pkg: WatchPackage, coordinator: DevCoordinator): WatchController | null {
  const tsconfigPath = path.join(pkg.absolutePath, 'tsconfig.json');
  
  if (!fs.existsSync(tsconfigPath)) {
    logger.warning(`⚠️ No tsconfig.json found for ${pkg.wsName}, skipping watch`);
    return null;
  }
  
  logger.info(`  🔄 Starting watcher for ${pkg.wsName}...`);
  
  // Получаем tsconfig
  const tsConfig = getTSConfig(pkg.absolutePath, 'tsconfig.json');
  
  // Запускаем watch через BuildPipeline
  const watcher = BuildPipeline.watch(
    {
      tsConfig,
      options: {
        includeNonTsFiles: true,
        retainNonAsciiCharacters: false,
        removeComments: false,
      },
      files: [],
      cwd: pkg.absolutePath,
    },
    {
      onRebuild: (result) => {
        if (result.success) {
          logger.success(`✅ [${pkg.wsName}] Build successful (${result.duration}ms)`);
          // Координатор решает: полная или инкрементальная линковка
          coordinator.onPackageBuild(pkg, result.emittedFiles);
        } else {
          logger.error(`❌ [${pkg.wsName}] Build failed`);
        }
      },
      onNonTsFileChange: (filePath) => {
        // Координатор обрабатывает изменения non-TS файлов
        coordinator.onNonTsFileChange(pkg, filePath);
      },
    }
  );
  
  return watcher;
}
