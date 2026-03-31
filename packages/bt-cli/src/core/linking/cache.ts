/**
 * Кэширование для линковки
 *
 * Управляет кэшем в директории .btc/ для оптимизации линковки:
 * - Двухуровневый кэш: lockfile hash (registry deps) + per-library content hash (local deps)
 * - Lockfile ищется поднимаясь к корню workspace (поддержка monorepo)
 * - Позволяет пропускать копирование если зависимости не изменились
 *
 * @module linking/cache
 */

import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import { LinkingCacheState, NodeModulesCacheEntry } from "./types";

/** Текущая версия формата кэша (v2: per-library content hashes) */
const CACHE_VERSION = 2;

/** Имя директории кэша */
const CACHE_DIR_NAME = ".btc";

/** Имя файла состояния кэша */
const CACHE_STATE_FILE = "linking-cache.json";

/**
 * Менеджер кэша линковки
 *
 * @remarks
 * Хранит состояние кэша в `.btc/linking-cache.json`
 * Позволяет проверять нужно ли перекопировать node_modules
 */
export class LinkingCache {
  private projectPath: string;
  private cachePath: string;
  private stateFilePath: string;
  private state: LinkingCacheState;
  private enabled: boolean;

  /**
   * Создаёт экземпляр менеджера кэша
   *
   * @param projectPath - Корневая директория проекта
   * @param enabled - Включён ли кэш (false при --no-cache)
   */
  constructor(projectPath: string, enabled: boolean = true) {
    this.projectPath = projectPath;
    this.cachePath = path.join(projectPath, CACHE_DIR_NAME);
    this.stateFilePath = path.join(this.cachePath, CACHE_STATE_FILE);
    this.enabled = enabled;
    this.state = this.loadState();
  }

  /**
   * Загружает состояние кэша из файла
   */
  private loadState(): LinkingCacheState {
    if (!this.enabled) {
      return this.createEmptyState();
    }

    try {
      if (fs.existsSync(this.stateFilePath)) {
        const content = fs.readFileSync(this.stateFilePath, "utf-8");
        const state = JSON.parse(content) as LinkingCacheState;

        // Проверяем версию кэша
        if (state.version !== CACHE_VERSION) {
          // Версия устарела - сбрасываем кэш
          return this.createEmptyState();
        }

        return state;
      }
    } catch (_err) {
      // Ошибка чтения - начинаем с чистого состояния
    }

    return this.createEmptyState();
  }

  /**
   * Создаёт пустое состояние кэша
   */
  private createEmptyState(): LinkingCacheState {
    return {
      version: CACHE_VERSION,
      nodeModules: {},
    };
  }

  /**
   * Сохраняет состояние кэша в файл
   */
  private saveState(): void {
    if (!this.enabled) {
      return;
    }

    try {
      // Создаём директорию .btc если её нет
      if (!fs.existsSync(this.cachePath)) {
        fs.mkdirSync(this.cachePath, { recursive: true });
      }

      fs.writeFileSync(this.stateFilePath, JSON.stringify(this.state, null, 2), "utf-8");
    } catch (error) {
      // Не критично если не удалось сохранить кэш
      console.warn("Warning: Failed to save linking cache:", error);
    }
  }

  /**
   * Вычисляет hash от содержимого файла
   *
   * @param filePath - Путь к файлу
   * @returns SHA256 hash или null если файл не существует
   */
  private computeFileHash(filePath: string): string | null {
    try {
      if (!fs.existsSync(filePath)) {
        return null;
      }
      const content = fs.readFileSync(filePath);
      return crypto.createHash("sha256").update(content).digest("hex");
    } catch (_err) {
      return null;
    }
  }

  /**
   * Ищет lockfile поднимаясь от указанной директории к корню workspace
   *
   * @param startPath - Директория, от которой начинать поиск
   * @returns Абсолютный путь к найденному lockfile или null
   *
   * @remarks
   * Порядок проверки на каждом уровне:
   * 1. pnpm-lock.yaml (pnpm workspaces)
   * 2. package-lock.json (npm)
   *
   * Останавливается когда:
   * - Найден lockfile
   * - Найден pnpm-workspace.yaml (корень workspace, даже если lockfile отсутствует)
   * - Достигнут корень файловой системы
   */
  private findWorkspaceRootLockfile(startPath: string): string | null {
    let currentDir = path.resolve(startPath);
    const root = path.parse(currentDir).root;

    while (true) {
      // Проверяем pnpm-lock.yaml
      const pnpmLockPath = path.join(currentDir, "pnpm-lock.yaml");
      if (fs.existsSync(pnpmLockPath)) {
        return pnpmLockPath;
      }

      // Проверяем package-lock.json
      const npmLockPath = path.join(currentDir, "package-lock.json");
      if (fs.existsSync(npmLockPath)) {
        return npmLockPath;
      }

      // Если нашли pnpm-workspace.yaml — это корень workspace, но lockfile нет
      const pnpmWorkspacePath = path.join(currentDir, "pnpm-workspace.yaml");
      if (fs.existsSync(pnpmWorkspacePath)) {
        return null;
      }

      // Поднимаемся на уровень выше
      const parentDir = path.dirname(currentDir);
      if (parentDir === currentDir || currentDir === root) {
        // Достигли корня FS
        return null;
      }

      currentDir = parentDir;
    }
  }

  /**
   * Получает hash от lockfile проекта
   *
   * Ищет lockfile поднимаясь к корню workspace (поддержка monorepo).
   * Fallback на package.json пакета для standalone-проектов без lockfile.
   *
   * @param packagePath - Путь к директории пакета
   * @returns SHA256 hash от lockfile или null
   */
  getLockfileHash(packagePath: string): string | null {
    // Сначала ищем lockfile поднимаясь к workspace root
    const lockfilePath = this.findWorkspaceRootLockfile(packagePath);

    if (lockfilePath) {
      return this.computeFileHash(lockfilePath);
    }

    // Fallback: hash от package.json самого пакета
    const packageJsonPath = path.join(packagePath, "package.json");
    return this.computeFileHash(packageJsonPath);
  }

  /**
   * Получает закэшированное состояние node_modules для пакета
   *
   * @param wsName - ws:name пакета
   * @returns Запись кэша или null если записи нет или кэш отключён
   */
  getNodeModulesState(wsName: string): NodeModulesCacheEntry | null {
    if (!this.enabled) {
      return null;
    }

    return this.state.nodeModules[wsName] ?? null;
  }

  /**
   * Обновляет запись кэша node_modules для пакета
   *
   * @param wsName - ws:name пакета
   * @param entry - Новая запись кэша
   */
  updateNodeModulesState(wsName: string, entry: NodeModulesCacheEntry): void {
    if (!this.enabled) {
      return;
    }

    this.state.nodeModules[wsName] = entry;
    this.saveState();
  }

  /**
   * Очищает весь кэш
   */
  clear(): void {
    this.state = this.createEmptyState();

    try {
      if (fs.existsSync(this.stateFilePath)) {
        fs.unlinkSync(this.stateFilePath);
      }
    } catch (_err) {
      // Не критично
    }
  }

  /**
   * Полностью удаляет директорию .btc
   */
  static removeAll(projectPath: string): void {
    const cachePath = path.join(projectPath, CACHE_DIR_NAME);

    if (fs.existsSync(cachePath)) {
      fs.rmSync(cachePath, { recursive: true, force: true });
    }
  }

  /**
   * Проверяет включён ли кэш
   */
  isEnabled(): boolean {
    return this.enabled;
  }
}
