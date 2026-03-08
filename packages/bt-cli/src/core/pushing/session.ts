/**
 * DeploySession — persistent сессия для push-операций
 *
 * Управляет lifecycle одного WshcmClient + Evaluator.
 * Используется в dev mode для переиспользования соединения между push-ами,
 * а также в one-shot push через processPush().
 *
 * @module core/pushing/session
 */

import { WshcmClient, Evaluator, WshcmException } from "@boristype/ws-client";
import { logger } from "../logger";
import { uploadDist } from "./upload";
import { reinitModules } from "./reinit";
import type { PushConnectionOptions } from "./types";

/**
 * Persistent сессия для push-операций на WSHCM сервер
 *
 * Держит один WshcmClient + один Evaluator на всё время жизни сессии.
 * Поддерживает reconnect при network-ошибках (1 retry).
 *
 * @example
 * ```typescript
 * // One-shot
 * const session = new DeploySession(connectionOptions);
 * await session.initialize();
 * await session.push(distPath);
 * await session.close();
 *
 * // Dev mode (persistent)
 * const session = new DeploySession(connectionOptions);
 * await session.initialize();
 * // ... при каждом изменении:
 * await session.push(distPath);
 * // ... при завершении:
 * await session.close();
 * ```
 */
export class DeploySession {
  private connectionOptions: PushConnectionOptions;
  private client: WshcmClient | null = null;
  private evaluator: Evaluator | null = null;
  private initialized = false;

  /**
   * Создаёт новую deploy-сессию
   * @param connectionOptions - опции подключения к серверу
   */
  constructor(connectionOptions: PushConnectionOptions) {
    this.connectionOptions = connectionOptions;
  }

  /**
   * Инициализирует сессию: создаёт клиент, проверяет авторизацию,
   * создаёт и инициализирует evaluator.
   *
   * Должен быть вызван перед первым push().
   */
  async initialize(): Promise<void> {
    this.client = new WshcmClient({
      overHttps: this.connectionOptions.https,
      host: this.connectionOptions.host,
      port: this.connectionOptions.port,
      username: this.connectionOptions.username,
      password: this.connectionOptions.password,
    });
    await this.client.initialize();

    this.evaluator = this.client.createEvaluator();
    await this.evaluator.initialize();

    this.initialized = true;
  }

  /**
   * Выполняет push: загрузка dist + reinit модулей
   *
   * При network-ошибке пытается выполнить reconnect и повторный push (1 retry).
   *
   * @param distPath - путь к папке dist
   */
  async push(distPath: string): Promise<void> {
    if (!this.initialized || !this.evaluator) {
      throw new Error("DeploySession is not initialized. Call initialize() first.");
    }

    try {
      await this.executePush(distPath);
    } catch (error) {
      if (this.isNetworkError(error)) {
        logger.warning("⚠️ Network error during push, attempting reconnect...");
        try {
          await this.reconnect();
          await this.executePush(distPath);
        } catch (retryError) {
          throw new Error(`Push failed after reconnect: ${(retryError as Error).message}`);
        }
      } else {
        throw error;
      }
    }
  }

  /**
   * Закрывает сессию: удаляет evaluator с сервера
   */
  async close(): Promise<void> {
    if (this.evaluator) {
      try {
        await this.evaluator.close();
      } catch {
        // Игнорируем ошибки при закрытии
      }
      this.evaluator = null;
    }
    this.client = null;
    this.initialized = false;
  }

  /**
   * Выполняет push без retry-логики
   */
  private async executePush(distPath: string): Promise<void> {
    await uploadDist(this.evaluator!, distPath);
    await reinitModules(this.evaluator!, distPath);
  }

  /**
   * Переподключается к серверу: закрывает текущий evaluator,
   * создаёт новый и инициализирует его.
   */
  private async reconnect(): Promise<void> {
    // Закрываем старый evaluator (игнорируем ошибки)
    if (this.evaluator) {
      try {
        await this.evaluator.close();
      } catch {
        // Может быть уже недоступен
      }
    }

    // Пересоздаём клиент и evaluator
    this.client = new WshcmClient({
      overHttps: this.connectionOptions.https,
      host: this.connectionOptions.host,
      port: this.connectionOptions.port,
      username: this.connectionOptions.username,
      password: this.connectionOptions.password,
    });
    await this.client.initialize();

    this.evaluator = this.client.createEvaluator();
    await this.evaluator.initialize();

    logger.info("🔄 Reconnected to WSHCM server");
  }

  /**
   * Определяет, является ли ошибка сетевой
   */
  private isNetworkError(error: unknown): boolean {
    if (error instanceof WshcmException) {
      const message = error.message.toLowerCase();
      return (
        message.includes("request failed") ||
        message.includes("request timed out") ||
        message.includes("econnrefused") ||
        message.includes("econnreset") ||
        message.includes("etimedout") ||
        message.includes("socket hang up")
      );
    }
    return false;
  }
}
