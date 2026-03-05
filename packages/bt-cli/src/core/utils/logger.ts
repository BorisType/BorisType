/**
 * Logger — цветной вывод в консоль
 *
 * Использует `util.styleText` из Node.js 21.7+ для раскраски.
 * На более старых версиях выводит plain text.
 *
 * @module core/utils/logger
 */

import util from 'node:util';

class Logger {
  #styleText: Function = (_color: string, message: string) => message;

  constructor() {
    this.#reimplementStyleText();
  }

  /** Вывод ошибки (красный) */
  error(message: string) {
    console.error(this.#styleText('red', message));
  }

  /** Вывод успешного результата (зелёный) */
  success(message: string) {
    console.log(this.#styleText('greenBright', message));
  }

  /** Вывод предупреждения (жёлтый) */
  warning(message: string) {
    console.warn(this.#styleText('yellow', message));
  }

  /** Вывод информации (голубой) */
  info(message: string) {
    console.log(this.#styleText('cyan', message));
  }

  #reimplementStyleText() {
    const nodeVersionArray = process.versions.node.split('.');

    if (
      Number(nodeVersionArray[0]) > 21 ||
      (Number(nodeVersionArray[0]) === 21 && Number(nodeVersionArray[1]) > 7)
    ) {
      this.#styleText = util.styleText;
    }
  }
}

/** Глобальный синглтон логгера */
export const logger = new Logger();
