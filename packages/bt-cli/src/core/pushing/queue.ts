/**
 * Debounced очередь для push-операций в dev mode
 *
 * @module pushing/queue
 */

import { logger } from "../logger.js";
import { DeploySession } from "./index.js";

/**
 * Простая debounced очередь для push-операций
 *
 * Гарантирует что:
 * - Push не вызывается чаще чем раз в `delayMs` мс
 * - Если push уже выполняется, новый запрос ставится в очередь
 * - Одновременно выполняется только один push
 *
 * Использует DeploySession для переиспользования одного клиента
 * и evaluator-а на всё время работы dev mode.
 */
export class DebouncedPushQueue {
  /** Таймер debounce */
  private timer: ReturnType<typeof setTimeout> | null = null;
  /** Флаг: push сейчас выполняется */
  private running = false;
  /** Флаг: требуется повторный push после текущего */
  private pendingAfterCurrent = false;
  /** Задержка debounce в мс */
  private delayMs: number;
  /** Deploy-сессия (persistent на всё время dev mode) */
  private session: DeploySession;
  /** Путь к папке dist */
  private distPath: string;
  /** Флаг: сессия инициализирована */
  private sessionInitialized = false;

  /**
   * @param session - DeploySession для push-операций
   * @param distPath - путь к папке dist
   * @param delayMs - задержка debounce в мс
   */
  constructor(session: DeploySession, distPath: string, delayMs = 500) {
    this.session = session;
    this.distPath = distPath;
    this.delayMs = delayMs;
  }

  /**
   * Запланировать push с debounce.
   * Если push уже идёт — будет выполнен повторно после завершения текущего.
   */
  schedule(): void {
    if (this.running) {
      this.pendingAfterCurrent = true;
      return;
    }

    if (this.timer) {
      clearTimeout(this.timer);
    }

    this.timer = setTimeout(() => this.execute(), this.delayMs);
  }

  /**
   * Закрывает сессию
   */
  async close(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    await this.session.close();
  }

  /** Выполнить push */
  private async execute(): Promise<void> {
    this.timer = null;
    this.running = true;
    this.pendingAfterCurrent = false;

    try {
      // Ленивая инициализация сессии при первом push
      if (!this.sessionInitialized) {
        await this.session.initialize();
        this.sessionInitialized = true;
      }

      logger.info("🚀 Auto-pushing dist to WSHCM server...");
      await this.session.push(this.distPath);
      logger.info("🎉 Auto-push completed successfully!");
    } catch (error) {
      logger.error(`❌ Auto-push failed: ${(error as Error).message}`);
    }

    this.running = false;

    if (this.pendingAfterCurrent) {
      this.pendingAfterCurrent = false;
      this.schedule();
    }
  }
}
