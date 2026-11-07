import type { WshcmClientOptions } from "@boristype/ws-client";

/**
 * Параметры подключения к WSHCM серверу для MCP сервера.
 * Совместимы с {@link WshcmClientOptions}.
 */
export interface McpServerOptions {
  /** Хост WSHCM сервера */
  host: string;
  /** Порт WSHCM сервера */
  port: number;
  /** Имя пользователя для авторизации */
  username: string;
  /** Пароль для авторизации */
  password: string;
  /** Использовать HTTPS */
  https: boolean;
}

/**
 * Преобразует опции MCP сервера в формат, ожидаемый {@link WshcmClient}.
 */
export function toWshcmClientOptions(options: McpServerOptions): WshcmClientOptions {
  return {
    overHttps: options.https,
    host: options.host,
    port: options.port,
    username: options.username,
    password: options.password,
  };
}
