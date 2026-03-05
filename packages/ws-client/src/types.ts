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
