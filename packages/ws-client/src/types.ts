/**
 * Values supported recursively by the HCM SOAP codec. Integers use signed
 * int64 bigint, while every number is SOAP real (including whole numbers).
 * Records require own enumerable data fields with unqualified XML names;
 * native XML, dates, sparse arrays, accessors and cycles are unsupported.
 */
export type WshcmValue = string | boolean | bigint | number | null | undefined | WshcmValue[] | { [key: string]: WshcmValue };

/**
 * Опции для создания WSHCM-клиента
 */
export interface WshcmClientOptions {
  /** Использовать HTTPS вместо HTTP */
  overHttps: boolean;
  /** Хост сервера (например, "localhost") */
  host: string;
  /** Порт сервера (например, 80, 8080 или "8080") */
  port: number | string;
  /** Имя пользователя */
  username: string;
  /** Пароль */
  password: string;
  /** Таймаут HTTP-запросов в мс (по умолчанию 30000) */
  requestTimeout?: number;
}

export interface WshcmRequestOptions {
  /** Deadline for this HTTP exchange, including connection and response body. */
  timeoutMs?: number;
}
