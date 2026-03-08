/**
 * Координатор dev mode для multi-package проектов
 *
 * @module building/coordinator
 */

import { logger } from "../logger.js";
import { processPackagesLinking } from "../linking/index.js";
import { BtConfigLinkingPackage } from "../config.js";
import { DebouncedPushQueue } from "../pushing/queue.js";

/**
 * Информация о watch-пакете
 */
export interface WatchPackage {
  /** Относительный путь к директории пакета */
  name: string;
  /** Абсолютный путь к директории пакета */
  absolutePath: string;
  /** ws:name из package.json */
  wsName: string;
  /** Тип пакета */
  packageType: string;
}

/**
 * Координатор dev mode для multi-package проектов
 *
 * Отслеживает initial build всех пакетов и координирует линковку:
 * - Ждёт завершения initial build от всех пакетов
 * - После этого выполняет одну полную линковку
 * - Далее — инкрементальная линковка для каждого изменения
 */
export class DevCoordinator {
  private pendingInitialBuilds: Set<string>;
  private initialLinkDone = false;
  private projectPath: string;
  private allPackages: BtConfigLinkingPackage[];
  private pushQueue: DebouncedPushQueue | null;

  constructor(
    projectPath: string,
    watchPackages: WatchPackage[],
    allPackages: BtConfigLinkingPackage[],
    pushQueue: DebouncedPushQueue | null,
  ) {
    this.projectPath = projectPath;
    this.allPackages = allPackages;
    this.pendingInitialBuilds = new Set(watchPackages.map((p) => p.wsName));
    this.pushQueue = pushQueue;
  }

  /**
   * Вызывается при завершении build пакета
   */
  async onPackageBuild(pkg: WatchPackage, emittedFiles: string[]): Promise<void> {
    if (this.pendingInitialBuilds.has(pkg.wsName)) {
      // Это initial build
      this.pendingInitialBuilds.delete(pkg.wsName);
      logger.success(`  ✅ Initial build completed: ${pkg.wsName}`);

      if (this.pendingInitialBuilds.size === 0) {
        // Все пакеты собрались — полная линковка
        logger.info("🔗 All packages built. Running full link...");
        await processPackagesLinking(this.projectPath, this.allPackages, {});
        this.initialLinkDone = true;
        logger.success("✅ Dev mode ready. Watching for changes...");
        this.pushQueue?.schedule();
      }
    } else if (this.initialLinkDone) {
      // Инкрементальная линковка
      await processPackagesLinking(this.projectPath, [{ name: pkg.name }], {
        devMode: true,
        changedFiles: emittedFiles,
      });
      this.pushQueue?.schedule();
    }
    // Если !initialLinkDone и это не initial build — игнорируем (промежуточное состояние)
  }

  /**
   * Вызывается при изменении non-TS файла
   */
  async onNonTsFileChange(pkg: WatchPackage, filePath: string): Promise<void> {
    if (this.initialLinkDone) {
      await processPackagesLinking(this.projectPath, [{ name: pkg.name }], {
        devMode: true,
        changedFiles: [filePath],
      });
      this.pushQueue?.schedule();
    }
  }
}
