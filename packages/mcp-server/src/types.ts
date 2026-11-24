import type { WshcmClientOptions } from "@boristype/ws-client";

export const defaultConnectionTimeoutMs = 5000;

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
  /** Deadline per login, evaluator setup, probe and cleanup request. */
  connectionTimeoutMs?: number;
  /** Absolute local directory for package ZIP snapshots and metadata. */
  packageArtifactDirectory?: string;
  /** Absolute shared directory with packages/ and objects/ for local transfers. */
  sharedDirectory?: string;
  /** Project root used when the client supplies no usable local roots. */
  projectDirectory?: string;
}

/**
 * Преобразует опции MCP сервера в формат, ожидаемый {@link WshcmClient}.
 */
export function toWshcmClientOptions(options: McpServerOptions): WshcmClientOptions {
  if (typeof options.host !== "string" || !options.host || options.host.length > 253 || /[\s/@?#\\]/.test(options.host))
    throw new TypeError("Invalid HCM host");
  try {
    const url = new URL(`http://${options.host}:1`);
    if (url.port !== "1") throw new Error();
  } catch {
    throw new TypeError("Invalid HCM host");
  }
  if (!Number.isInteger(options.port) || options.port < 1 || options.port > 65535)
    throw new RangeError("HCM port must be an integer from 1 through 65535");
  if (options.connectionTimeoutMs !== undefined && (!Number.isSafeInteger(options.connectionTimeoutMs) || options.connectionTimeoutMs <= 0))
    throw new RangeError("connectionTimeoutMs must be a positive safe integer");
  return {
    overHttps: options.https,
    host: options.host,
    port: options.port,
    username: options.username,
    password: options.password,
  };
}
