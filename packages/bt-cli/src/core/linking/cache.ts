/**
 * Кэширование для линковки
 * 
 * Управляет кэшем в директории .btc/ для оптимизации линковки:
 * - Кэширование hash от package-lock.json для node_modules
 * - Позволяет пропускать копирование если зависимости не изменились
 * 
 * @module linking/cache
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { LinkingCacheState, NodeModulesCacheEntry } from './types';

/** Текущая версия формата кэша */
const CACHE_VERSION = 1;

/** Имя директории кэша */
const CACHE_DIR_NAME = '.btc';

/** Имя файла состояния кэша */
const CACHE_STATE_FILE = 'linking-cache.json';

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
        const content = fs.readFileSync(this.stateFilePath, 'utf-8');
        const state = JSON.parse(content) as LinkingCacheState;
        
        // Проверяем версию кэша
        if (state.version !== CACHE_VERSION) {
          // Версия устарела - сбрасываем кэш
          return this.createEmptyState();
        }
        
        return state;
      }
    } catch (error) {
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
      nodeModules: {}
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

      fs.writeFileSync(
        this.stateFilePath,
        JSON.stringify(this.state, null, 2),
        'utf-8'
      );
    } catch (error) {
      // Не критично если не удалось сохранить кэш
      console.warn('Warning: Failed to save linking cache:', error);
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
      return crypto.createHash('sha256').update(content).digest('hex');
    } catch (error) {
      return null;
    }
  }

  /**
   * Получает hash от lockfile пакета
   * Пробует package-lock.json, затем pnpm-lock.yaml, затем package.json как fallback
   * 
   * @param packagePath - Путь к директории пакета
   * @returns Hash от lockfile
   */
  private getLockfileHash(packagePath: string): string | null {
    // Сначала пробуем package-lock.json (npm)
    const npmLockPath = path.join(packagePath, 'package-lock.json');
    let hash = this.computeFileHash(npmLockPath);
    
    if (hash) {
      return hash;
    }

    // Затем пробуем pnpm-lock.yaml (pnpm workspaces)
    const pnpmLockPath = path.join(packagePath, 'pnpm-lock.yaml');
    hash = this.computeFileHash(pnpmLockPath);
    
    if (hash) {
      return hash;
    }

    // Fallback на package.json
    const packageJsonPath = path.join(packagePath, 'package.json');
    return this.computeFileHash(packageJsonPath);
  }

  /**
   * Проверяет нужно ли копировать node_modules для пакета
   * 
   * @param wsName - ws:name пакета
   * @param packagePath - Путь к директории пакета (где находится package-lock.json)
   * @returns true если нужно копировать, false если можно пропустить
   * 
   * @remarks
   * Возвращает true (нужно копировать) если:
   * - Кэш отключён (--no-cache)
   * - Нет записи в кэше для этого пакета
   * - Hash от package-lock.json изменился
   * - Не удалось вычислить hash
   */
  shouldCopyNodeModules(wsName: string, packagePath: string): boolean {
    if (!this.enabled) {
      return true;
    }

    const currentHash = this.getLockfileHash(packagePath);
    
    if (!currentHash) {
      // Не удалось получить hash - копируем на всякий случай
      return true;
    }

    const cached = this.state.nodeModules[wsName];
    
    if (!cached) {
      // Нет записи в кэше
      return true;
    }

    // Сравниваем hash
    return cached.lockfileHash !== currentHash;
  }

  /**
   * Обновляет запись кэша после копирования node_modules
   * 
   * @param wsName - ws:name пакета
   * @param packagePath - Путь к директории пакета
   */
  updateNodeModulesCache(wsName: string, packagePath: string): void {
    if (!this.enabled) {
      return;
    }

    const hash = this.getLockfileHash(packagePath);
    
    if (!hash) {
      // Удаляем запись если не можем вычислить hash
      delete this.state.nodeModules[wsName];
    } else {
      this.state.nodeModules[wsName] = {
        lockfileHash: hash,
        linkedAt: new Date().toISOString(),
        version: CACHE_VERSION
      };
    }

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
    } catch (error) {
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
