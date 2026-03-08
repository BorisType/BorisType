/**
 * Типы для модуля pushing
 * @module core/pushing/types
 */

/**
 * Опции подключения к WSHCM серверу
 *
 * Все поля обязательны — мерж CLI/config/defaults выполняется до создания этого объекта.
 */
export interface PushConnectionOptions {
  /** Использовать HTTPS вместо HTTP */
  https: boolean;
  /** Хост сервера (например, "localhost") */
  host: string;
  /** Порт сервера (например, 80, 8080) */
  port: number | string;
  /** Имя пользователя */
  username: string;
  /** Пароль */
  password: string;
}

/**
 * Частичные опции подключения (из CLI или btconfig.properties)
 *
 * Все поля опциональны — будут дополнены дефолтами.
 */
export type PartialPushConnectionOptions = Partial<PushConnectionOptions>;

/**
 * Описание init-скрипта для reinit модулей
 */
export interface InitScript {
  /** Тип модуля */
  type: "standalone" | "component";
  /** Имя модуля */
  name: string;
  /** Код для выполнения */
  code: string;
}

/**
 * Опции CLI для команды push.
 *
 * Приоритет: CLI параметры > btconfig.properties > дефолтные значения
 */
export type PushCommandOptions = {
  /** Использовать HTTPS вместо HTTP */
  https?: boolean;
  /** Хост WSHCM сервера (default: localhost) */
  host?: string;
  /** Порт WSHCM сервера (default: 80) */
  port?: number;
  /** Имя пользователя для аутентификации (default: user1) */
  username?: string;
  /** Пароль для аутентификации (default: user1) */
  password?: string;
};
